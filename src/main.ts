import "./style.css";

import {
  createBone,
  type PuppetAnimation,
  type PuppetBone,
  type PuppetProject,
} from "@core/format";
import { createGridMesh, vertexCount } from "@core/mesh";
import {
  normalizeWeights,
  paintInfluence,
  removeBoneWeights,
  toWeightMap,
  type WeightMap,
} from "@core/weight";
import { computeSkinMatrices, skinVertices } from "@core/skeleton/transform";
import { hexToNumber } from "@core/format";
import { AnimationPlayer } from "@core/animation";
import { createCanvasView } from "@renderer/phaser";
import { EditorStore, type BrushState } from "@editor/state/store";
import { UndoStack } from "@editor/history/UndoStack";
import { EditorUI } from "@editor/ui";
import { attachDropTarget, loadImageFile } from "@editor/tools/imageLoader";
import { buildAlphaMap, sampleAlphaMask, type AlphaMap } from "@editor/tools/alphaMask";
import { renderWeightOverlay } from "@editor/tools/weightOverlay";
import {
  downloadBlob,
  packProject,
  projectFileName,
  unpackProject,
} from "@editor/tools/projectFile";
import idlePreset from "./presets/idle.json";

const canvasArea = document.getElementById("canvasArea") as HTMLElement;
const imageInput = document.getElementById("imageInput") as HTMLInputElement;
const projectInput = document.getElementById("projectInput") as HTMLInputElement;

const store = new EditorStore();
/** 이미지에서 뽑아 둔 알파. 저장 대상이 아니라 파생 데이터라 스토어 밖에 둔다. */
let alphaMap: AlphaMap | null = null;
const history = new UndoStack<PuppetProject>();
const player = new AnimationPlayer();

/** 기본 애니메이션 프리셋. 새 모션은 JSON 추가만으로 늘린다. (기획서 26) */
const PRESETS: Record<string, PuppetAnimation> = {
  idle: idlePreset as unknown as PuppetAnimation,
};

const view = await createCanvasView(canvasArea);

const ui = new EditorUI(store, {
  onAddBone: (part) => {
    const { x, y } = view.scene.getViewCenter((store.get().project.bones.length % 6) * 14);
    commit((current) => ({
      ...current,
      bones: [...current.bones, createBone(part, Math.round(x), Math.round(y), current.bones)],
    }));
    const added = store.get().project.bones.at(-1);
    if (added) {
      store.set({ selectedBoneId: added.id });
      ui.setStatus(`관절 추가: ${added.name}`);
    }
  },

  onDeleteBone: (boneId) => {
    commit((current) => ({
      ...current,
      // 자식은 삭제된 Bone의 부모로 승격시킨다.
      bones: current.bones
        .filter((bone) => bone.id !== boneId)
        .map((bone) =>
          bone.parentId === boneId
            ? { ...bone, parentId: current.bones.find((b) => b.id === boneId)?.parentId ?? null }
            : bone,
        ),
    }));
    setWeights(removeBoneWeights(store.get().weights, boneId));
    store.set({ selectedBoneId: null });
    ui.setStatus("관절을 삭제했습니다.");
  },

  onUpdateBone: (boneId, patch) => {
    commit((current) => patchBone(current, boneId, patch));
  },

  onReorderBone: (boneId, targetId, place) => {
    commit((current) => {
      const bones = [...current.bones];
      const from = bones.findIndex((bone) => bone.id === boneId);
      if (from < 0) return current;

      const [moved] = bones.splice(from, 1);
      const target = bones.findIndex((bone) => bone.id === targetId);
      if (target < 0 || !moved) return current;

      bones.splice(place === "after" ? target + 1 : target, 0, moved);
      return { ...current, bones };
    });
    ui.setStatus("관절 순서를 바꿨습니다.");
  },

  onBrushChange: (patch) => {
    const brush = { ...store.get().brush, ...patch };
    store.set({ brush });
    syncPaintMode(brush);
  },

  onMenu: (action) => {
    switch (action) {
      case "import-image":
        imageInput.click();
        break;
      case "open":
        projectInput.click();
        break;
      case "save":
        void saveProject();
        break;
      case "new":
        resetProject();
        break;
      default:
        ui.setStatus("아직 준비 중인 기능입니다.");
    }
  },

  onPlay: (animationId) => playAnimation(animationId),
  onStop: () => stopAnimation(),
});

/** 프로젝트 변경 한 번을 Undo 단위로 기록한다. (기획서 36) */
function commit(updater: (project: PuppetProject) => PuppetProject): void {
  history.push(store.get().project);
  store.update(updater);
}

function patchBone(
  project: PuppetProject,
  boneId: string,
  patch: Partial<PuppetBone>,
): PuppetProject {
  return {
    ...project,
    bones: project.bones.map((bone) =>
      bone.id === boneId ? ({ ...bone, ...patch } as PuppetBone) : bone,
    ),
  };
}

/** 가중치가 바뀔 때마다 올라가는 번호. 점 패턴을 다시 구울 시점을 알기 위한 것이다. */
let weightsRevision = 0;

/** 편집 중인 가중치를 정규화해서 Mesh에 반영한다. (기획서 17) */
function setWeights(weights: WeightMap): void {
  weightsRevision += 1;
  const { project } = store.get();
  if (!project.mesh) {
    store.set({ weights });
    return;
  }

  const normalized = normalizeWeights(weights, vertexCount(project.mesh));
  store.set({ weights });
  store.update((current) =>
    current.mesh ? { ...current, mesh: { ...current.mesh, weights: normalized } } : current,
  );
}

// ── 캔버스 조작 ────────────────────────────────────────────────

// 관절을 직접 집어 옮긴다. 드래그 한 번이 Undo 한 단위다.
view.scene.setBoneHandlers({
  onSelect: (boneId) => store.set({ selectedBoneId: boneId }),

  onDragStart: () => history.push(store.get().project),

  onDrag: (boneId, x, y) => {
    store.update((project) =>
      patchBone(project, boneId, { x: Math.round(x), y: Math.round(y) }),
    );
  },

  onDragEnd: (boneId) => {
    const bone = store.get().project.bones.find((b) => b.id === boneId);
    if (bone) ui.setStatus(`${bone.name} 위치: ${Math.round(bone.x)}, ${Math.round(bone.y)}`);
  },
});

/** 칠하기 · 지우개를 캔버스에 연결하거나 해제한다. */
function syncPaintMode(brush: BrushState = store.get().brush): void {
  const { selectedBoneId, project } = store.get();
  const bone = project.bones.find((candidate) => candidate.id === selectedBoneId);

  if (!brush.tool || !bone || !project.mesh) {
    view.scene.setPaintHandlers(null);
    return;
  }

  const erase = brush.tool === "eraser";

  view.scene.setPaintHandlers({
    radius: brush.size,
    color: hexToNumber(bone.color),
    erase,
    onStart: () => history.push(store.get().project),
    onPaint: (x, y) => {
      const state = store.get();
      if (!state.project.mesh || !state.selectedBoneId) return;

      setWeights(
        paintInfluence(
          state.weights,
          state.selectedBoneId,
          state.project.mesh,
          {
            x1: x,
            y1: y,
            x2: x,
            y2: y,
            radius: state.brush.size,
            strength: state.brush.amount / 100,
            softness: 0.7,
          },
          erase,
          // 이미지가 그려진 영역 안에서만 칠한다.
          state.mask,
        ),
      );
    },
    onEnd: () => ui.setStatus(`${bone.name} 영향 영역을 ${erase ? "지웠" : "칠했"}습니다.`),
  });
}

// ── 애니메이션 재생 (기획서 30, 32) ────────────────────────────

function playAnimation(animationId: string): void {
  const preset = PRESETS[animationId];
  if (!preset) {
    ui.setStatus("아직 준비 중인 애니메이션입니다.");
    return;
  }

  const { project } = store.get();
  if (!project.mesh) {
    ui.setStatus("이미지를 먼저 불러오세요.");
    return;
  }

  player.play(preset);
  view.scene.setWeightOverlay(null);
  store.set({ playing: animationId });
  ui.setStatus(`재생: ${animationId}`);
}

function stopAnimation(): void {
  player.stop();
  store.set({ playing: null });
  view.scene.updateMeshVertices(null);
  overlayDirty = true;
  ui.setStatus("정지");
}

let lastFrame = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (player.current?.playing) {
    const { project } = store.get();
    const deltas = player.update(dt, project.bones);
    if (project.mesh) {
      const skin = computeSkinMatrices(project.bones, deltas);
      // 변형 모드는 정점 혼합 방식까지 결정하므로 런타임에 Bone 설정을 함께 전달한다.
      const deformModes = new Map(project.bones.map((bone) => [bone.id, bone.deform]));
      view.scene.updateMeshVertices(skinVertices(project.mesh, skin, undefined, deformModes));
    }
  } else if (overlayDirty) {
    // 재생 중에는 굽지 않는다. 점 패턴은 변형을 따라가지 않으므로 재생 중에는 감춘다.
    overlayDirty = false;
    refreshWeightOverlay();
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ── 프로젝트 입출력 ────────────────────────────────────────────

function resetProject(): void {
  const { textureUrl } = store.get();
  if (textureUrl) URL.revokeObjectURL(textureUrl);

  stopAnimation();
  history.clear();
  view.scene.clearTexture();
  store.set({
    project: { ...store.get().project, bones: [], mesh: null, animations: {} },
    textureUrl: null,
    selectedBoneId: null,
    weights: {},
    mask: null,
  });
  alphaMap = null;
  ui.setStatus("새 프로젝트");
}

async function importImage(file: File): Promise<void> {
  try {
    const previous = store.get().textureUrl;
    const { image, url, fileName } = await loadImageFile(file);
    if (previous) URL.revokeObjectURL(previous);

    // Mesh는 이미지 크기에 맞춰 자동으로 만든다. (기획서 73)
    const mesh = createGridMesh(image.width, image.height, "normal");

    store.update((project) => ({
      ...project,
      character: {
        ...project.character,
        name: fileName.replace(/\.[^.]+$/, ""),
        texture: fileName,
        width: image.width,
        height: image.height,
      },
      mesh,
    }));
    alphaMap = buildAlphaMap(image);
    store.set({ textureUrl: url, weights: {}, mask: sampleAlphaMask(alphaMap, mesh) });

    view.scene.showTexture(image, store.get().project.character.pixelArt);
    view.scene.setMesh(mesh, image.width, image.height);
    ui.setStatus(
      `이미지 불러옴: ${fileName} (${image.width}×${image.height}) · Mesh ${mesh.cols}×${mesh.rows}`,
    );
  } catch (error) {
    ui.setStatus(error instanceof Error ? error.message : "이미지를 불러오지 못했습니다.");
  }
}

async function saveProject(): Promise<void> {
  const { project, textureUrl } = store.get();
  try {
    const blob = await packProject(project, textureUrl);
    downloadBlob(blob, projectFileName(project));
    ui.setStatus(`저장: ${projectFileName(project)}`);
  } catch (error) {
    ui.setStatus(error instanceof Error ? error.message : "저장하지 못했습니다.");
  }
}

async function openProject(file: File): Promise<void> {
  try {
    const previous = store.get().textureUrl;
    const { project, textureUrl } = await unpackProject(file);
    if (previous) URL.revokeObjectURL(previous);

    stopAnimation();
    history.clear();
    view.scene.clearTexture();

    store.set({
      project,
      textureUrl,
      selectedBoneId: null,
      weights: project.mesh ? toWeightMap(project.mesh.weights) : {},
    });

    if (textureUrl) {
      const image = new Image();
      image.src = textureUrl;
      await image.decode();
      view.scene.showTexture(image, project.character.pixelArt);
      if (project.mesh) {
        view.scene.setMesh(project.mesh, project.character.width, project.character.height);
        alphaMap = buildAlphaMap(image);
        store.set({ mask: sampleAlphaMask(alphaMap, project.mesh) });
      }
    }

    ui.setStatus(`불러옴: ${project.character.name} · 관절 ${project.bones.length}개`);
  } catch (error) {
    ui.setStatus(error instanceof Error ? error.message : "프로젝트를 열지 못했습니다.");
  }
}

attachDropTarget(canvasArea, (file) => {
  if (file.name.endsWith(".zip") || file.name.endsWith(".puppet.zip")) {
    void openProject(file);
  } else {
    void importImage(file);
  }
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) void importImage(file);
  imageInput.value = "";
});

projectInput.addEventListener("change", () => {
  const file = projectInput.files?.[0];
  if (file) void openProject(file);
  projectInput.value = "";
});

// 캔버스 오버레이는 상태 변화에 맞춰 다시 그린다.
store.subscribe((state) => {
  view.scene.drawBones(state.project.bones, state.selectedBoneId, state.visibility);
});

// 영향 영역 점 패턴은 가중치·선택·표시 설정이 바뀔 때만 다시 굽는다.
let overlayDirty = true;
let lastOverlayKey = "";
store.subscribe((state) => {
  const key = [
    state.selectedBoneId,
    state.visibility.weights,
    state.visibility.weightsAll,
    state.project.mesh ? 1 : 0,
    state.project.bones.map((bone) => bone.color).join(""),
    weightsRevision,
  ].join("|");
  if (key === lastOverlayKey) return;
  lastOverlayKey = key;
  overlayDirty = true;
});

function refreshWeightOverlay(): void {
  const state = store.get();
  if (!state.project.mesh || !state.visibility.weights) {
    view.scene.setWeightOverlay(null);
    return;
  }

  view.scene.setWeightOverlay(
    renderWeightOverlay({
      mesh: state.project.mesh,
      bones: state.project.bones,
      weights: state.weights,
      selectedBoneId: state.selectedBoneId,
      showAll: state.visibility.weightsAll,
      alpha: alphaMap,
    }),
  );
}

// 선택이 바뀌거나 칠하기를 끄면 브러시 연결도 따라간다.
let lastPaintKey = "";
store.subscribe((state) => {
  const key = `${state.brush.tool}|${state.selectedBoneId}|${state.brush.size}|${state.brush.amount}|${state.project.mesh ? 1 : 0}|${state.project.bones.find((b) => b.id === state.selectedBoneId)?.color ?? ""}`;
  if (key === lastPaintKey) return;
  lastPaintKey = key;
  syncPaintMode(state.brush);
});

// 개발 중 콘솔에서 상태를 들여다보기 위한 훅. 배포 빌드에는 포함되지 않는다.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__puppet = { store, view, history, player };
}

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    const previous = history.undo(store.get().project);
    if (previous) {
      applyHistory(previous);
      ui.setStatus("실행 취소");
    }
    event.preventDefault();
  } else if (key === "y" || (key === "z" && event.shiftKey)) {
    const next = history.redo(store.get().project);
    if (next) {
      applyHistory(next);
      ui.setStatus("다시 실행");
    }
    event.preventDefault();
  } else if (key === "s") {
    void saveProject();
    event.preventDefault();
  }
});

/** Undo / Redo는 가중치 편집 상태도 함께 되돌린다. */
function applyHistory(project: PuppetProject): void {
  store.set({
    project,
    selectedBoneId: null,
    weights: project.mesh ? toWeightMap(project.mesh.weights) : {},
  });
  if (project.mesh) view.scene.updateMeshVertices(null);
}
