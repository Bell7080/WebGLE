import "./style.css";

import {
  createBone,
  partForNewBone,
  serializeProject,
  type DeformMode,
  type PuppetAnimation,
  type PuppetBone,
  type PuppetProject,
} from "@core/format";
import { createGridMesh, vertexCount } from "@core/mesh";
import type { MeshResolution } from "@core/format";
import {
  normalizeWeights,
  paintInfluence,
  removeBoneWeights,
  resampleWeights,
  toWeightMap,
  type WeightMap,
} from "@core/weight";
import { autoManagedBones, withAutoWeights } from "@core/weight/auto";
import {
  applyPoint,
  compose,
  computeSkinMatrices,
  invert,
  multiply,
  NO_DELTA,
  skinVertices,
  type Mat2D,
} from "@core/skeleton/transform";
import { hexToNumber } from "@core/format";
import {
  AnimationPlayer,
  deformModesFor,
  deltaWithoutOwnKeys,
  evaluateAnimation,
  keyTimes,
  keyValueFor,
  moveOwnKeys,
  ownKeyTimes,
  ownKeysAt,
  removeOwnKeys,
  setKey,
  setDuration,
  tagAmplitude,
  setOwnKeyEase,
} from "@core/animation";
import { SecondaryMotion } from "@core/physics/secondary";
import { createCanvasView } from "@renderer/phaser";
import { EditorStore, type BrushState } from "@editor/state/store";
import { UndoStack } from "@editor/history/UndoStack";
import { EditorUI } from "@editor/ui";
import { attachDropTarget, loadImageFile } from "@editor/tools/imageLoader";
import {
  buildAlphaMap,
  readPixels,
  sampleAlphaMask,
  type AlphaMap,
} from "@editor/tools/alphaMask";
import { analyzePixels, judgePixelArt } from "@core/image/pixelart";
import { renderWeightOverlay } from "@editor/tools/weightOverlay";
import {
  downloadBlob,
  exportFileName,
  forExport,
  packProject,
  projectFileName,
  unpackProject,
} from "@editor/tools/projectFile";
import {
  clearSession,
  createAutosave,
  describeSavedAt,
  isAvailable as autosaveAvailable,
  loadSession,
  saveSession,
} from "@editor/tools/autosave";
import {
  bakeSheets,
  sheetBlockReason,
  sheetManifest,
} from "@editor/tools/spriteSheet";
import { createZip } from "@core/format/zip";
import { FRAME, Timeline } from "@editor/ui/timeline";
import { findPreset, PRESETS } from "./presets";

/**
 * 조절 막대를 끌고 있는 애니메이션 이름. 끌지 않는 동안에는 null이다.
 * 드래그 한 번을 Undo 한 단위로 묶기 위한 표시다.
 */
let settingGesture: string | null = null;

const canvasArea = document.getElementById("canvasArea") as HTMLElement;
const imageInput = document.getElementById("imageInput") as HTMLInputElement;
const projectInput = document.getElementById("projectInput") as HTMLInputElement;

const store = new EditorStore();
/** 이미지에서 뽑아 둔 알파. 저장 대상이 아니라 파생 데이터라 스토어 밖에 둔다. */
let alphaMap: AlphaMap | null = null;
const history = new UndoStack<PuppetProject>();
const player = new AnimationPlayer();
/** 꼬리 · 머리카락처럼 늦게 따라오는 부위의 흔들림. (기획서 29) */
const secondary = new SecondaryMotion();

const view = await createCanvasView(canvasArea);

const ui = new EditorUI(store, {
  onAddBone: (part) => {
    const { x, y } = view.scene.getViewCenter((store.get().project.bones.length % 6) * 14);
    commit((current) => ({
      ...current,
      bones: [
        ...current.bones,
        createBone(partForNewBone(part, current.bones), Math.round(x), Math.round(y), current.bones),
      ],
    }));
    const added = store.get().project.bones.at(-1);
    if (added) {
      store.set({ selectedBoneId: added.id });
      // 놓자마자 그림이 따라 움직이도록 영향 영역을 바로 깔아 준다.
      const painted = refreshAutoWeights();
      ui.setStatus(
        painted > 0
          ? `관절 추가: ${added.name} · 영향 영역을 자동으로 칠했습니다`
          : `관절 추가: ${added.name}`,
      );
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
      // 이 관절만 따로 정해 둔 애니메이션이 있으면 그 항목도 같이 지운다.
      animations: Object.fromEntries(
        Object.entries(current.animations).map(([key, animation]) => {
          if (!animation.deform?.[boneId]) return [key, animation];
          const { [boneId]: _removed, ...rest } = animation.deform;
          return [key, withDeform(animation, rest)];
        }),
      ),
    }));
    setWeights(removeBoneWeights(store.get().weights, boneId));
    // 사라진 관절이 맡던 자리를 남은 관절들이 나눠 가진다.
    refreshAutoWeights();
    store.set({ selectedBoneId: null });
    ui.setStatus("관절을 삭제했습니다.");
  },

  onUpdateBone: (boneId, patch) => {
    commit((current) => patchBone(current, boneId, patch));
    // 부모가 바뀌면 그 관절이 덮는 선분 자체가 달라진다.
    if (patch.parentId !== undefined) refreshAutoWeights();
  },

  onAutoWeight: (boneId, enabled) => {
    const bone = store.get().project.bones.find((candidate) => candidate.id === boneId);
    commit((current) => patchBone(current, boneId, { autoWeight: enabled }));
    if (enabled) refreshAutoWeights();
    ui.setStatus(
      enabled
        ? `${bone?.name ?? "관절"}: 자동으로 되돌렸습니다.`
        : `${bone?.name ?? "관절"}: 이제 직접 맡습니다. 자동 계산이 덮어쓰지 않습니다.`,
    );
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
      case "export":
        void exportProject();
        break;
      case "sprite-sheet":
        void exportSpriteSheets();
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

  onAddAnimation: (presetId) => {
    const preset = findPreset(presetId);
    if (!preset) return;

    // 같은 프리셋을 두 번 넣을 수 있게 이름 뒤에 번호를 붙인다.
    const name = uniqueAnimationName(presetId, store.get().project.animations);
    commit((current) => ({
      ...current,
      animations: {
        ...current.animations,
        [name]: { ...structuredClone(preset.animation), name },
      },
    }));
    ui.setStatus(`${preset.label} 추가 · 이름 "${name}" (더블클릭해서 바꿀 수 있습니다)`);
    playAnimation(name);
  },

  onRenameAnimation: (animationId, name) => {
    const taken = Object.keys(store.get().project.animations);
    if (taken.includes(name)) {
      ui.setStatus(`"${name}"은 이미 쓰고 있는 이름입니다.`);
      return;
    }

    const wasPlaying = store.get().playing === animationId;
    commit((current) => {
      // 키 순서를 지키면서 이름만 바꾼다. 이 키가 곧 게임에서 부를 이름이다.
      const animations = Object.fromEntries(
        Object.entries(current.animations).map(([key, animation]) =>
          key === animationId ? [name, { ...animation, name }] : [key, animation],
        ),
      );
      return { ...current, animations };
    });
    if (wasPlaying) store.set({ playing: name });
    if (store.get().selectedAnimation === animationId) store.set({ selectedAnimation: name });
    ui.setStatus(`이름 변경: ${animationId} → ${name}`);
  },

  onRemoveAnimation: (animationId) => {
    if (store.get().playing === animationId) stopAnimation();
    commit((current) => {
      const { [animationId]: _removed, ...rest } = current.animations;
      return { ...current, animations: rest };
    });
    if (store.get().selectedAnimation === animationId) store.set({ selectedAnimation: null });
    ui.setStatus("애니메이션을 삭제했습니다.");
  },

  onToggleAnimationHidden: (animationId) => {
    let hidden = false;
    commit((current) => {
      const animation = current.animations[animationId];
      if (!animation) return current;
      hidden = !animation.hidden;
      return {
        ...current,
        animations: { ...current.animations, [animationId]: { ...animation, hidden } },
      };
    });
    ui.setStatus(
      hidden ? "내보내기에서 제외했습니다. 파일에는 남습니다." : "내보내기에 다시 포함합니다.",
    );
  },

  onAnimationSetting: (animationId, patch, done = true) => {
    // 막대를 끄는 동안에는 스토어만 갱신하고, 시작할 때 한 번만 Undo에 쌓는다.
    if (settingGesture === null) {
      history.push(store.get().project);
      settingGesture = animationId;
      refreshUndoButtons();
    }

    const { duration, ...simple } = patch;
    store.update((current) => {
      const animation = current.animations[animationId];
      if (!animation) return current;

      // 길이는 키 시각을 함께 옮겨야 하므로 단순 덮어쓰기가 아니다.
      const resized = duration === undefined ? animation : setDuration(animation, duration);
      return {
        ...current,
        animations: { ...current.animations, [animationId]: { ...resized, ...simple } },
      };
    });

    // 재생 중이면 멈추지 않고 곧바로 반영한다.
    if (store.get().playing === animationId) {
      if (patch.speed !== undefined) player.setSpeed(patch.speed);
      if (patch.strength !== undefined) player.setAmount(patch.strength);
    }
    // 길이가 바뀌면 재생 커서가 든 애니메이션과 타임라인 눈금도 갈아 끼워야 한다.
    if (duration !== undefined) reloadPlayer(animationId);

    if (done) settingGesture = null;
  },

  onCharacterSetting: (patch) => {
    const { project, textureUrl } = store.get();

    if (patch.name !== undefined) {
      commit((current) => ({
        ...current,
        character: { ...current.character, name: patch.name as string },
      }));
      ui.setStatus(`캐릭터 이름: ${patch.name}`);
    }

    if (patch.pixelArt !== undefined) {
      commit((current) => ({
        ...current,
        character: { ...current.character, pixelArt: patch.pixelArt as boolean },
      }));
      // 텍스처 필터가 바뀌므로 이미지를 다시 올린다.
      if (textureUrl) void reloadTexture(textureUrl, patch.pixelArt);
      ui.setStatus(patch.pixelArt ? "도트 모드로 그립니다." : "일반 그림으로 그립니다.");
    }

    if (patch.resolution !== undefined) changeResolution(patch.resolution, project);
  },

  onAnimationDeform: (animationId, boneId, mode) => {
    commit((current) => {
      const animation = current.animations[animationId];
      if (!animation) return current;

      const { [boneId]: _cleared, ...rest } = animation.deform ?? {};
      const deform = mode === null ? rest : { ...rest, [boneId]: mode };

      return {
        ...current,
        animations: { ...current.animations, [animationId]: withDeform(animation, deform) },
      };
    });

    const bone = store.get().project.bones.find((b) => b.id === boneId);
    ui.setStatus(
      mode === null
        ? `${bone?.name ?? "관절"}: ${animationId}의 덮어쓰기를 지웠습니다.`
        : `${bone?.name ?? "관절"}: ${animationId}에서만 다르게 씁니다.`,
    );
  },

  onKeyQuery: (boneId) => {
    const current = player.current;
    if (!current) return null;

    const at = keyTime();
    const keys = ownKeysAt(current.animation, boneId, at);
    if (keys.length === 0) return null;

    // 속성마다 다를 수 있으므로 첫 번째 것을 대표로 보여 준다.
    return { time: at, count: keys.length, ease: keys[0]!.key.ease ?? "linear" };
  },

  onKeyEase: (boneId, ease) => {
    const at = keyTime();
    history.push(store.get().project);
    if (editAnimation((animation) => setOwnKeyEase(animation, boneId, at, ease))) {
      ui.setStatus(`${at.toFixed(2)}초 키의 보간을 바꿨습니다.`);
      refreshUndoButtons();
    } else {
      history.undo(store.get().project);
    }
  },

  onKeyDelete: (boneId) => {
    const at = keyTime();
    const bone = store.get().project.bones.find((b) => b.id === boneId);
    history.push(store.get().project);
    if (editAnimation((animation) => removeOwnKeys(animation, boneId, at))) {
      ui.setStatus(`${bone?.name ?? "관절"}: ${at.toFixed(2)}초 키를 지웠습니다.`);
      refreshUndoButtons();
    } else {
      history.undo(store.get().project);
    }
  },

  onExport: () => void exportProject(),
});

/** 도트 모드를 바꾸면 텍스처 필터가 달라져 이미지를 다시 올려야 한다. */
async function reloadTexture(url: string, pixelArt: boolean): Promise<void> {
  const image = new Image();
  image.src = url;
  await image.decode();
  view.scene.showTexture(image, pixelArt);

  const { project } = store.get();
  if (project.mesh) {
    view.scene.setMesh(project.mesh, project.character.width, project.character.height);
  }
}

/**
 * Mesh 해상도를 바꾼다. (기획서 15)
 * 칠해 둔 영향 영역은 새 격자로 옮겨 담아 작업을 잃지 않는다.
 */
function changeResolution(resolution: MeshResolution, project: PuppetProject): void {
  const previous = project.mesh;
  if (!previous || previous.resolution === resolution) return;

  const mesh = createGridMesh(project.character.width, project.character.height, resolution);
  const moved = resampleWeights(previous, mesh, store.get().weights);

  stopAnimation();
  commit((current) => ({ ...current, mesh }));
  store.set({ mask: sampleAlphaMask(alphaMap, mesh) });
  setWeights(moved);
  // 격자가 통째로 바뀌었으니 자동으로 맡긴 것은 새 격자에서 다시 계산한다.
  refreshAutoWeights();

  view.scene.setMesh(
    store.get().project.mesh ?? mesh,
    project.character.width,
    project.character.height,
  );
  ui.setStatus(`Mesh ${mesh.cols}×${mesh.rows} · 칠한 영역은 그대로 옮겼습니다.`);
}

/** 이미 쓰는 이름이면 뒤에 번호를 붙인다. */
function uniqueAnimationName(base: string, taken: Record<string, unknown>): string {
  if (!(base in taken)) return base;
  let index = 2;
  while (`${base}${index}` in taken) index += 1;
  return `${base}${index}`;
}

/** 프로젝트 변경 한 번을 Undo 단위로 기록한다. (기획서 36) */
function commit(updater: (project: PuppetProject) => PuppetProject): void {
  history.push(store.get().project);
  store.update(updater);
}

/** 애니메이션의 관절별 변형 덮어쓰기를 갈아 끼운다. 빈 값이면 키 자체를 뺀다. */
function withDeform(
  animation: PuppetAnimation,
  deform: Record<string, DeformMode>,
): PuppetAnimation {
  if (Object.keys(deform).length === 0) {
    const { deform: _empty, ...rest } = animation;
    return rest;
  }
  return { ...animation, deform };
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

/**
 * 자동으로 맡긴 관절의 영향 영역을 다시 계산한다.
 *
 * 관절이 늘거나 옮겨지면 그 관절이 덮어야 할 자리도 달라지므로 그때마다 부른다.
 * 직접 칠한 관절은 대상에서 빠지니 손으로 한 작업이 이 때문에 사라지지는 않는다.
 * 몇 개가 다시 칠해졌는지 돌려준다 — 0이면 상태줄에 아무 말도 하지 않기 위한 것이다.
 */
function refreshAutoWeights(): number {
  const { project, weights, mask } = store.get();
  if (!project.mesh) return 0;

  const only = autoManagedBones(project.bones);
  if (only.size === 0) return 0;

  setWeights(withAutoWeights(weights, project.bones, project.mesh, { only, mask }));
  return only.size;
}

// ── 캔버스 조작 ────────────────────────────────────────────────

// 관절을 직접 집어 옮긴다. 드래그 한 번이 Undo 한 단위다.
view.scene.setBoneHandlers({
  onSelect: (boneId) => store.set({ selectedBoneId: boneId }),

  onDragStart: () => history.push(store.get().project),

  onDrag: (boneId, x, y) => {
    // 재생 중에는 손대지 않는다. 화면의 점은 자세를 따라가 있으므로
    // 여기서 기준 좌표를 덮어쓰면 잡은 자리와 결과가 어긋난다.
    if (player.current?.playing) {
      ui.setStatus("재생 중에는 관절을 옮길 수 없습니다. 일시정지한 뒤 옮기세요.");
      return;
    }

    // 타임라인이 서 있으면 그 시점의 키를 찍는다. 아니면 기준 자세를 옮긴다.
    if (poseEditable()) {
      writeMoveKey(boneId, x, y);
      return;
    }

    store.update((project) =>
      patchBone(project, boneId, { x: Math.round(x), y: Math.round(y) }),
    );
  },

  onRotate: (boneId, radians) => {
    if (!poseEditable()) return;
    writeRotateKey(boneId, radians);
  },

  onDragEnd: (boneId) => {
    const bone = store.get().project.bones.find((b) => b.id === boneId);
    if (!bone) return;

    if (poseEditable()) {
      rotateBase = null;
      ui.setStatus(
        `${bone.name}: ${keyTime().toFixed(2)}초(${Math.round(keyTime() / FRAME)}F)에 키를 찍었습니다.`,
      );
      return;
    }
    // 관절이 옮겨 갔으면 자동으로 맡긴 영역도 따라가야 한다.
    refreshAutoWeights();
    ui.setStatus(`${bone.name} 위치: ${Math.round(bone.x)}, ${Math.round(bone.y)}`);
  },
});

// ── 자세 편집 = 키 찍기 (기획서 21, 26) ────────────────────────

/**
 * 지금 자세를 편집할 수 있는지.
 * 애니메이션이 올라가 있고 멈춰 서 있을 때만 그 시점의 키를 찍는다.
 */
function poseEditable(): boolean {
  const current = player.current;
  return Boolean(current && !current.playing && store.get().project.mesh);
}

/** 회전을 시작할 때의 값. 끄는 동안 누적 각도를 여기에 더한다. */
let rotateBase: number | null = null;

/** 키를 끌기 시작한 시각. 끄는 동안 이어서 옮기기 위한 것이다. */
let keyDragFrom: number | null = null;

/**
 * 고른 애니메이션을 갈아 끼운다. 재생 커서가 들고 있는 것도 함께 바꾼다.
 * 히스토리는 부르는 쪽이 알아서 쌓는다 — 드래그 한 번이 한 단위여야 하기 때문이다.
 *
 * 실제로 바뀐 것이 있으면 true. 상태줄에 거짓말을 하지 않기 위한 것이다.
 */
function editAnimation(edit: (animation: PuppetAnimation) => PuppetAnimation): boolean {
  const { selectedAnimation } = store.get();
  const current = player.current;
  if (!current || !selectedAnimation) return false;

  const next = edit(current.animation);
  if (next === current.animation) return false;

  // 재생 커서를 **먼저** 갈아 끼운다. 스토어를 먼저 바꾸면 그 자리에서 화면을 다시 그리는데,
  // 그때 커서가 아직 옛 애니메이션을 들고 있어 방금 바꾼 값이 반영되지 않는다.
  const at = player.time;
  player.play(next, { speed: current.speed, amount: current.amount });
  player.pause();
  player.seek(at);

  store.update((draft) => ({
    ...draft,
    animations: { ...draft.animations, [selectedAnimation]: next },
  }));

  applyPose();
  refreshTimeline();
  return true;
}

/**
 * 재생 커서가 든 애니메이션을 스토어의 최신 값으로 갈아 끼운다.
 *
 * 커서는 재생을 시작한 순간의 애니메이션 객체를 붙들고 있으므로,
 * 길이처럼 데이터 자체가 바뀌는 편집을 하면 여기서 다시 물려줘야 화면이 따라온다.
 * 서 있던 시각은 새 길이 안으로 접어 넣는다.
 */
function reloadPlayer(animationId: string): void {
  const current = player.current;
  if (!current || store.get().selectedAnimation !== animationId) return;

  const next = store.get().project.animations[animationId];
  if (!next) return;

  const playing = current.playing;
  const at = Math.min(player.time, next.duration);
  player.play(next, { speed: current.speed, amount: current.amount });
  if (!playing) player.pause();
  player.seek(at);

  applyPose();
  refreshTimeline();
}

/** 지금 재생 헤드가 선 시각. 한 프레임에 맞춰 떨어뜨린다. */
function keyTime(): number {
  return Math.round(player.time / FRAME) * FRAME;
}

/**
 * 키에 적을 값을 구해 애니메이션에 넣는다.
 *
 * 화면에서 원하는 변화량(`desired`)을 만들려면, 태그 Track 등이 이미 주고 있는 몫을 빼고
 * 강도로 나눈 값을 적어야 한다. 그래야 프리셋과 섞여도 두 배로 움직이지 않는다.
 */
function putKey(
  boneId: string,
  property: "x" | "y" | "rotation",
  desired: number,
  time: number,
): void {
  const { project, selectedAnimation } = store.get();
  const current = player.current;
  const bone = project.bones.find((b) => b.id === boneId);
  if (!current || !bone || !selectedAnimation) return;

  const others = deltaWithoutOwnKeys(current.animation, project.bones, boneId, time, current.amount);
  // 성격 태그(heavy · stiff 등)도 값에 곱해지므로 되돌릴 때 함께 나눠야 한다.
  const scale = bone.motionStrength * tagAmplitude(bone);
  const value = keyValueFor(desired, others[property], scale, current.amount);

  const next = setKey(current.animation, { kind: "bone", boneId }, property, time, value);
  // 드래그 한 번이 Undo 한 단위다. 히스토리는 onDragStart에서 이미 쌓았으므로
  // 여기서는 commit이 아니라 store만 갱신한다.
  store.update((draft) => ({
    ...draft,
    animations: { ...draft.animations, [selectedAnimation]: next },
  }));

  // 재생 커서가 들고 있는 것도 갈아 끼워야 화면이 곧바로 따라온다.
  // 시각을 지키기 위해 다시 올린 뒤 그 자리로 돌려놓는다.
  const at = player.time;
  player.play(next, { speed: current.speed, amount: current.amount });
  player.pause();
  player.seek(at);
}

/** 관절을 끌어 옮긴 자리를 x · y 키로 적는다. */
function writeMoveKey(boneId: string, worldX: number, worldY: number): void {
  const { project } = store.get();
  const bone = project.bones.find((b) => b.id === boneId);
  if (!bone) return;

  // 델타가 없을 때의 자세(부모까지만 반영된 자리)를 기준으로 역산한다.
  const base = baseMatrix(boneId);
  if (!base) return;

  const local = applyPoint(invert(base), worldX, worldY);
  const time = keyTime();
  putKey(boneId, "x", local.x, time);
  putKey(boneId, "y", local.y, time);
  applyPose();
  refreshTimeline();
}

/** 바깥 링을 돌린 만큼을 rotation 키로 적는다. */
function writeRotateKey(boneId: string, radians: number): void {
  const { project } = store.get();
  const current = player.current;
  if (!current) return;

  if (rotateBase === null) {
    rotateBase = evaluateAnimation(
      current.animation,
      project.bones,
      keyTime(),
      current.amount,
    ).get(boneId)?.rotation ?? 0;
  }

  putKey(boneId, "rotation", (rotateBase ?? 0) + radians, keyTime());
  applyPose();
  refreshTimeline();
}

/**
 * 델타를 뺀 이 관절의 세계 변환. `부모의 현재 자세 × 부모 기준 지역 변환`이다.
 * 끌어 옮긴 세계 좌표를 지역 델타로 되돌릴 때 쓴다.
 */
function baseMatrix(boneId: string): Mat2D | null {
  const { project } = store.get();
  const current = player.current;
  if (!current) return null;

  const bones = project.bones;
  const bone = bones.find((b) => b.id === boneId);
  if (!bone) return null;

  // 이 관절의 델타만 0으로 둔 자세를 구하면 그 세계 변환이 곧 기준이 된다.
  const deltas = evaluateAnimation(current.animation, bones, keyTime(), current.amount);
  deltas.set(boneId, { ...NO_DELTA });
  const skin = computeSkinMatrices(bones, deltas);

  const matrix = skin.get(boneId);
  if (!matrix) return null;

  // skin은 "기준 자세 → 현재"이므로 기준 세계 변환을 곱해 되돌린다.
  return multiply(matrix, compose(bone.x, bone.y, bone.rotation, bone.scaleX, bone.scaleY));
}

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
    amount: brush.amount / 100,
    erase,
    onStart: () => {
      history.push(store.get().project);
      // 한 번이라도 직접 칠했으면 그 관절은 사용자의 것이다.
      // 이후 관절을 더 놓아도 자동 계산이 이 관절을 다시 칠하지 않는다.
      if (bone.autoWeight) {
        store.update((project) => patchBone(project, bone.id, { autoWeight: false }));
      }
    },
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
  const { project } = store.get();
  const animation = project.animations[animationId];
  if (!animation) {
    ui.setStatus("목록에 없는 애니메이션입니다.");
    return;
  }
  if (!project.mesh) {
    ui.setStatus("이미지를 먼저 불러오세요.");
    return;
  }

  secondary.reset();
  player.play(animation, {
    speed: animation.speed ?? 1,
    amount: animation.strength ?? 1,
  });
  view.scene.setWeightOverlay(null);
  store.set({ playing: animationId, selectedAnimation: animationId });
  ui.setStatus(`재생: ${animationId}`);
}

/** 자세가 반영된 관절 위치. 오버레이가 이 자리에 점을 찍는다. */
function posedPositions(
  bones: readonly PuppetBone[],
  skin: ReadonlyMap<string, Mat2D>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  for (const bone of bones) {
    const matrix = skin.get(bone.id);
    positions.set(bone.id, matrix ? applyPoint(matrix, bone.x, bone.y) : { x: bone.x, y: bone.y });
  }
  return positions;
}

function stopAnimation(): void {
  player.stop();
  secondary.reset();
  store.set({ playing: null });
  view.scene.setPosedBones(null);
  view.scene.updateMeshVertices(null);
  overlayDirty = true;
  refreshTimeline();
  ui.setStatus("정지");
}

let lastFrame = performance.now();
// ── 타임라인 (키프레임 편집 준비) ─────────────────────────────

const timeline = new Timeline(document.getElementById("timeline") as HTMLElement, {
  onSeek: (time) => {
    // 정지 상태에서 눈금을 눌러도 그 시점에 설 수 있어야 한다.
    if (!player.current && !loadSelectedAnimation()) return;
    // 붙잡고 있는 동안에는 시간이 저절로 흐르면 안 된다.
    player.pause();
    player.seek(time);
    store.set({ playing: null });
    applyPose();
    refreshTimeline();
  },
  onTogglePlay: () => togglePlay(),

  onMoveKey: (from, to, done) => {
    const boneId = store.get().selectedBoneId;
    if (!boneId) return;

    // 끄는 동안에는 스토어만 갱신하고, 시작할 때 한 번만 Undo에 쌓는다.
    if (keyDragFrom === null) {
      keyDragFrom = from;
      history.push(store.get().project);
      refreshUndoButtons();
    }

    const at = Math.round(to / FRAME) * FRAME;
    if (editAnimation((animation) => moveOwnKeys(animation, boneId, keyDragFrom ?? from, at))) {
      keyDragFrom = at;
      if (done) ui.setStatus(`키를 ${at.toFixed(2)}초로 옮겼습니다.`);
    }

    if (done) keyDragFrom = null;
  },

  onDeleteKey: (time) => {
    const { selectedBoneId, project } = store.get();
    if (!selectedBoneId) return;
    const bone = project.bones.find((b) => b.id === selectedBoneId);

    history.push(project);
    if (editAnimation((animation) => removeOwnKeys(animation, selectedBoneId, time))) {
      ui.setStatus(`${bone?.name ?? "관절"}: ${time.toFixed(2)}초 키를 지웠습니다.`);
      refreshUndoButtons();
    } else {
      history.undo(project);
      ui.setStatus("직접 찍은 키만 지울 수 있습니다. 프리셋의 키는 손댈 수 없습니다.");
    }
  },
  onRewind: () => {
    if (!player.current && !loadSelectedAnimation()) return;
    player.seek(0);
    applyPose();
    refreshTimeline();
  },
});

/**
 * 고른 애니메이션을 재생 커서에 올리되 멈춘 채로 둔다.
 * 정지 상태에서 타임라인을 건드렸을 때 곧바로 그 시점에 설 수 있게 하기 위한 것이다.
 */
function loadSelectedAnimation(): boolean {
  const { project, selectedAnimation } = store.get();
  const animation = selectedAnimation ? project.animations[selectedAnimation] : undefined;
  if (!animation || !project.mesh) return false;

  secondary.reset();
  player.play(animation, {
    speed: animation.speed ?? 1,
    amount: animation.strength ?? 1,
  });
  player.pause();
  return true;
}

/** 재생 / 일시정지. 아무것도 올라가 있지 않으면 고른 것을 올려 재생한다. */
function togglePlay(): void {
  const current = player.current;
  if (!current) {
    const id = store.get().selectedAnimation;
    if (id) playAnimation(id);
    return;
  }

  if (current.playing) {
    player.pause();
    store.set({ playing: null });
  } else {
    player.resume();
    store.set({ playing: current.animation.name });
  }
  refreshTimeline();
}

/** 지금 재생 헤드가 선 자리의 자세를 화면에 반영한다. 시간은 굴리지 않는다. */
function applyPose(): void {
  const { project } = store.get();
  const current = player.current;
  if (!project.mesh || !current) return;

  const deltas = player.sample(project.bones);
  const skin = computeSkinMatrices(project.bones, deltas);
  const deformModes = deformModesFor(project.bones, current.animation);
  view.scene.setPosedBones(posedPositions(project.bones, skin));
  view.scene.updateMeshVertices(skinVertices(project.mesh, skin, undefined, deformModes));
}

function refreshTimeline(): void {
  const { project, selectedAnimation, selectedBoneId } = store.get();
  view.scene.setPoseEditable(poseEditable());
  const animation = selectedAnimation ? project.animations[selectedAnimation] : undefined;
  const bone = project.bones.find((b) => b.id === selectedBoneId);

  timeline.render({
    animationId: animation ? selectedAnimation : null,
    time: player.time,
    duration: animation?.duration ?? 0,
    playing: player.current?.playing ?? false,
    keys: animation ? keyTimes(animation, project.bones) : [],
    boneKeys: animation && bone ? keyTimes(animation, project.bones, bone.id) : [],
    ownKeys: animation && bone ? ownKeyTimes(animation, bone.id) : [],
    boneName: bone?.name ?? null,
  });
}

store.subscribe(() => refreshTimeline());

// 한 프레임씩 옮기기 · 재생 토글
window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
  if (!player.current) return;

  const step = event.shiftKey ? FRAME * 5 : FRAME;
  if (event.key === "ArrowLeft") {
    player.pause();
    player.seek(player.time - step);
  } else if (event.key === "ArrowRight") {
    player.pause();
    player.seek(player.time + step);
  } else if (event.key === "Home") {
    player.seek(0);
  } else if (event.key === " ") {
    event.preventDefault();
    togglePlay();
    return;
  } else if (event.key === "Delete" || event.key === "Backspace") {
    // 재생 헤드가 선 자리의 키를 지운다. 고른 관절의 것만 지운다.
    const { selectedBoneId, project } = store.get();
    if (!selectedBoneId) return;
    event.preventDefault();

    const at = keyTime();
    const bone = project.bones.find((b) => b.id === selectedBoneId);
    history.push(project);
    if (editAnimation((animation) => removeOwnKeys(animation, selectedBoneId, at))) {
      ui.setStatus(`${bone?.name ?? "관절"}: ${at.toFixed(2)}초 키를 지웠습니다.`);
      refreshUndoButtons();
    } else {
      history.undo(project);
      ui.setStatus(`${at.toFixed(2)}초에 직접 찍은 키가 없습니다.`);
    }
    return;
  } else {
    return;
  }

  event.preventDefault();
  store.set({ playing: null });
  applyPose();
  refreshTimeline();
});

function tick(now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  if (player.current?.playing) {
    const { project } = store.get();
    const deltas = player.update(dt, project.bones);
    if (project.mesh) {
      // 1) 애니메이션만 반영한 자세를 먼저 구한다
      const posed = computeSkinMatrices(project.bones, deltas);
      // 2) 그 움직임을 입력 삼아 늦게 따라오는 흔들림을 더하고 (기획서 29)
      secondary.apply(
        project.bones,
        deltas,
        posed,
        dt,
        player.current.animation.secondary ?? 1,
      );
      // 3) 흔들림까지 반영한 최종 자세로 정점을 옮긴다
      const skin = computeSkinMatrices(project.bones, deltas);
      // 변형 모드는 정점 혼합 방식까지 결정하므로 런타임에 Bone 설정을 함께 전달한다.
      // 대기에서만 발을 묶어 두는 식으로 애니메이션이 관절별 값을 덮어쓸 수 있다.
      const deformModes = deformModesFor(project.bones, player.current.animation);
      // 관절점도 자세를 따라가게 한다. 그림만 휘고 점은 제자리에 있으면
      // 지금 어디를 잡아야 할지 알 수 없다.
      view.scene.setPosedBones(posedPositions(project.bones, skin));
      view.scene.updateMeshVertices(skinVertices(project.mesh, skin, undefined, deformModes));
      refreshTimeline();
    }
  } else if (overlayDirty) {
    // 재생 중에는 굽지 않는다. 점 패턴은 변형을 따라가지 않으므로 재생 중에는 감춘다.
    overlayDirty = false;
    refreshWeightOverlay();
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ── 자동 저장 (기획서 37) ──────────────────────────────────────

const autosave = createAutosave();
/** 마지막으로 담아 둔 내용. 같은 것을 두 번 담지 않기 위한 것이다. */
let savedSignature = "";
/**
 * 마지막으로 담은 이미지의 Object URL.
 * 지금 것과 다를 때만 이미지를 다시 담는다 — 관절 하나 옮길 때마다 PNG를 다시 넣지 않기 위해서다.
 */
let savedTextureUrl: string | null = null;

/** 담을 내용이 지난번과 같은지 가리는 값. 이미지가 바뀐 것도 여기서 잡힌다. */
function sessionSignature(state: { project: PuppetProject; textureUrl: string | null }): string {
  return `${state.textureUrl ?? "-"}|${serializeProject(state.project, false)}`;
}

if (autosaveAvailable()) {
  store.subscribe((state) => {
    // 재생 중에는 정점만 바뀌고 프로젝트는 그대로다. 굳이 담을 이유가 없다.
    const signature = sessionSignature(state);
    if (signature === savedSignature) return;
    savedSignature = signature;

    const { project, textureUrl } = state;
    autosave.schedule(async () => {
      let texture: Blob | null | undefined;
      if (!textureUrl) {
        texture = null;
      } else if (textureUrl !== savedTextureUrl) {
        texture = await (await fetch(textureUrl)).blob();
      }
      // undefined면 이미 담아 둔 이미지를 그대로 둔다.
      await saveSession(project, texture);
      savedTextureUrl = textureUrl;
    });
  });

  // 탭을 닫기 직전에 예약된 것을 마저 담는다.
  window.addEventListener("pagehide", () => void autosave.flushNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void autosave.flushNow();
  });
}

/** 지난번에 하던 작업이 있으면 그대로 이어서 연다. */
async function restoreSession(): Promise<void> {
  if (!autosaveAvailable()) return;

  const saved = await loadSession().catch(() => null);
  if (!saved || saved.project.bones.length === 0) return;

  const { project, texture } = saved;
  const textureUrl = texture ? URL.createObjectURL(texture) : null;

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
      alphaMap = buildAlphaMap(readPixels(image));
      store.set({ mask: sampleAlphaMask(alphaMap, project.mesh) });
    }
  }

  savedSignature = sessionSignature({ project, textureUrl });
  savedTextureUrl = textureUrl;
  ui.setStatus(
    `${describeSavedAt(saved.savedAt)} 작업을 이어서 엽니다 · ${project.character.name} · ` +
      `관절 ${project.bones.length}개 (새로 시작하려면 파일 → 새 프로젝트)`,
  );
}

void restoreSession();

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
  autosave.cancel();
  void clearSession();
  ui.setStatus("새 프로젝트");
}

async function importImage(file: File): Promise<void> {
  try {
    const previous = store.get().textureUrl;
    const { image, url, fileName } = await loadImageFile(file);
    if (previous) URL.revokeObjectURL(previous);

    // 픽셀을 한 번 읽어 알파 마스크와 도트 판정에 함께 쓴다.
    const pixels = readPixels(image);
    const verdict = pixels
      ? judgePixelArt(analyzePixels(pixels.data, pixels.width, pixels.height))
      : { pixelArt: false, reason: "픽셀을 읽지 못했습니다" };

    // Mesh는 이미지 크기에 맞춰 자동으로 만든다. (기획서 73)
    // 도트 그림은 과하게 휘면 깨져 보이므로 격자를 성기게 잡는다. (기획서 51)
    const mesh = createGridMesh(image.width, image.height, verdict.pixelArt ? "low" : "normal");

    store.update((project) => ({
      ...project,
      character: {
        ...project.character,
        name: fileName.replace(/\.[^.]+$/, ""),
        texture: fileName,
        width: image.width,
        height: image.height,
        pixelArt: verdict.pixelArt,
      },
      mesh,
      // 처음 불러올 때는 대기 하나를 넣어 둔다. 하단에서 더하거나 빼면 된다.
      animations:
        Object.keys(project.animations).length === 0
          ? { idle: structuredClone(PRESETS[0]!.animation) }
          : project.animations,
    }));
    alphaMap = buildAlphaMap(pixels);
    store.set({
      textureUrl: url,
      weights: {},
      mask: sampleAlphaMask(alphaMap, mesh),
      pixelArtReason: verdict.reason,
    });

    view.scene.showTexture(image, verdict.pixelArt);
    view.scene.setMesh(mesh, image.width, image.height);
    // 관절을 먼저 놓고 그림을 나중에 불러온 경우에도 곧바로 움직이게 한다.
    refreshAutoWeights();
    ui.setStatus(
      `${fileName} (${image.width}×${image.height}) · ${verdict.pixelArt ? "도트" : "일반"} 그림 · Mesh ${mesh.cols}×${mesh.rows}`,
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

/** 게임에 넘길 묶음. 숨긴 애니메이션은 빠진다. */
/**
 * 재생 결과를 프레임마다 구워 스프라이트 시트로 내보낸다. (기획서 47)
 *
 * 숨기지 않은 애니메이션은 하나도 빠짐없이 각각 한 장씩 나온다.
 * 무엇을 뽑을지 또 고르게 하지 않으려는 것이다 — 빼고 싶으면 목록에서 숨기면 된다.
 */
async function exportSpriteSheets(): Promise<void> {
  const { project, textureUrl } = store.get();

  const blocked = sheetBlockReason(project);
  if (blocked) {
    ui.setStatus(blocked);
    return;
  }
  if (!textureUrl) {
    ui.setStatus("이미지를 먼저 불러오세요.");
    return;
  }

  try {
    ui.setStatus("스프라이트 시트를 굽는 중…");
    const image = new Image();
    image.src = textureUrl;
    await image.decode();

    const sheets = await bakeSheets(project, image);
    const encoder = new TextEncoder();
    const entries = [
      { name: "sheets.json", data: encoder.encode(sheetManifest(project, sheets)) },
      ...(await Promise.all(
        sheets.map(async (sheet) => ({
          name: `${sheet.name}.png`,
          data: new Uint8Array(await sheet.blob.arrayBuffer()),
        })),
      )),
    ];

    const safe = (project.character.name || "character").replace(/[\\/:*?"<>|]/g, "_").trim();
    downloadBlob(
      new Blob([createZip(entries) as unknown as BlobPart], { type: "application/zip" }),
      `${safe || "character"}.sheets.zip`,
    );

    const total = sheets.reduce((sum, sheet) => sum + sheet.frames, 0);
    ui.setStatus(`시트 ${sheets.length}장 · 프레임 ${total}개 (${sheets.map((s) => s.name).join(", ")})`);
  } catch (error) {
    ui.setStatus(error instanceof Error ? error.message : "시트를 굽지 못했습니다.");
  }
}

async function exportProject(): Promise<void> {
  const { project, textureUrl } = store.get();
  const shipped = forExport(project);
  const names = Object.keys(shipped.animations);

  if (names.length === 0) {
    ui.setStatus("내보낼 애니메이션이 없습니다. 하단에서 추가하세요.");
    return;
  }

  try {
    const blob = await packProject(shipped, textureUrl, true);
    downloadBlob(blob, exportFileName(project));
    ui.setStatus(`내보냄: ${names.length}개 (${names.join(", ")})`);
  } catch (error) {
    ui.setStatus(error instanceof Error ? error.message : "내보내지 못했습니다.");
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
        alphaMap = buildAlphaMap(readPixels(image));
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
  (window as unknown as Record<string, unknown>).__puppet = {
    store,
    view,
    history,
    player,
    secondary,
  };
}

// ── 실행 취소 · 다시 실행 ──────────────────────────────────────

const undoButton = document.getElementById("undoButton") as HTMLButtonElement;
const redoButton = document.getElementById("redoButton") as HTMLButtonElement;

/** 되돌릴 것이 있는지에 맞춰 버튼을 켜고 끈다. */
function refreshUndoButtons(): void {
  undoButton.disabled = !history.canUndo;
  redoButton.disabled = !history.canRedo;
}

function undo(): void {
  const previous = history.undo(store.get().project);
  ui.setStatus(previous ? "실행 취소" : "되돌릴 것이 없습니다.");
  if (previous) applyHistory(previous);
  refreshUndoButtons();
}

function redo(): void {
  const next = history.redo(store.get().project);
  ui.setStatus(next ? "다시 실행" : "다시 실행할 것이 없습니다.");
  if (next) applyHistory(next);
  refreshUndoButtons();
}

undoButton.addEventListener("click", () => undo());
redoButton.addEventListener("click", () => redo());
// 프로젝트가 바뀌면 쌓인 만큼 버튼 상태도 맞춘다.
store.subscribe(() => refreshUndoButtons());

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  const key = event.key.toLowerCase();
  if (key !== "z" && key !== "y" && key !== "s") return;

  // 브라우저 기본 동작(페이지 저장 등)을 **먼저** 막는다.
  // 뒤에서 오류가 나더라도 화면이 넘어가지 않아야 한다.
  event.preventDefault();

  // 이름을 고쳐 쓰는 중이면 글자 편집이 우선이다. 저장만 그대로 받는다.
  const target = event.target as HTMLElement | null;
  const typing = Boolean(target && /^(INPUT|TEXTAREA)$/.test(target.tagName));
  if (typing && key !== "s") return;

  if (key === "z" && !event.shiftKey) {
    undo();
  } else if (key === "y" || (key === "z" && event.shiftKey)) {
    redo();
  } else {
    void saveProject();
  }
});

/**
 * Undo / Redo는 가중치 편집 상태도 함께 되돌린다.
 *
 * 고르고 있던 관절과 칠하기 상태는 지키려 애쓴다.
 * 한 획 되돌렸다고 붓을 내려놓게 되면 이어서 칠할 수가 없다.
 */
function applyHistory(project: PuppetProject): void {
  const { selectedBoneId } = store.get();
  // 되돌린 뒤에도 남아 있는 관절이면 선택을 지킨다.
  const keep = project.bones.some((bone) => bone.id === selectedBoneId) ? selectedBoneId : null;

  store.set({
    project,
    selectedBoneId: keep,
    weights: project.mesh ? toWeightMap(project.mesh.weights) : {},
  });

  // 선택이 살아 있으면 칠하기도 그대로 이어 간다.
  syncPaintMode();
  if (project.mesh) view.scene.updateMeshVertices(null);
}
