import "./style.css";

import { createBone, type PuppetBone, type PuppetProject } from "@core/format";
import { createCanvasView } from "@renderer/phaser";
import { EditorStore } from "@editor/state/store";
import { UndoStack } from "@editor/history/UndoStack";
import { EditorUI } from "@editor/ui";
import { attachDropTarget, loadImageFile } from "@editor/tools/imageLoader";

const canvasArea = document.getElementById("canvasArea") as HTMLElement;
const imageInput = document.getElementById("imageInput") as HTMLInputElement;

const store = new EditorStore();
const history = new UndoStack<PuppetProject>();

const view = await createCanvasView(canvasArea);

const ui = new EditorUI(store, {
  onAddBone: (part) => {
    // 지금 보고 있는 화면 중앙에 만든다. 이후 캔버스에서 끌어 옮길 수 있다.
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

  onMenu: (action) => {
    switch (action) {
      case "import-image":
        imageInput.click();
        break;
      case "new":
        resetProject();
        break;
      default:
        ui.setStatus("아직 준비 중인 기능입니다.");
    }
  },

  onPlay: (animationId) => ui.setStatus(`재생 예정: ${animationId} (애니메이션 런타임 준비 중)`),
  onStop: () => ui.setStatus("정지"),
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

// 캔버스에서 관절을 직접 집어 옮긴다. 드래그 한 번이 Undo 한 단위다.
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

function resetProject(): void {
  const { textureUrl } = store.get();
  if (textureUrl) URL.revokeObjectURL(textureUrl);
  history.clear();
  view.scene.clearTexture();
  store.set({
    project: { ...store.get().project, bones: [], mesh: null, animations: {} },
    textureUrl: null,
    selectedBoneId: null,
  });
  ui.setStatus("새 프로젝트");
}

async function importImage(file: File): Promise<void> {
  try {
    const previous = store.get().textureUrl;
    const { image, url, fileName } = await loadImageFile(file);
    if (previous) URL.revokeObjectURL(previous);

    store.update((project) => ({
      ...project,
      character: {
        ...project.character,
        name: fileName.replace(/\.[^.]+$/, ""),
        texture: fileName,
        width: image.width,
        height: image.height,
      },
    }));
    store.set({ textureUrl: url });

    view.scene.showTexture(image, store.get().project.character.pixelArt);
    ui.setStatus(`이미지 불러옴: ${fileName} (${image.width}×${image.height})`);
  } catch (error) {
    ui.setStatus(error instanceof Error ? error.message : "이미지를 불러오지 못했습니다.");
  }
}

attachDropTarget(canvasArea, (file) => void importImage(file));

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) void importImage(file);
  imageInput.value = "";
});

// 캔버스 오버레이는 상태 변화에 맞춰 다시 그린다.
store.subscribe((state) => view.scene.drawBones(state.project.bones, state.selectedBoneId));

// 개발 중 콘솔에서 상태를 들여다보기 위한 훅. 배포 빌드에는 포함되지 않는다.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__puppet = { store, view, history };
}

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    const previous = history.undo(store.get().project);
    if (previous) {
      store.set({ project: previous, selectedBoneId: null });
      ui.setStatus("실행 취소");
    }
    event.preventDefault();
  } else if (key === "y" || (key === "z" && event.shiftKey)) {
    const next = history.redo(store.get().project);
    if (next) {
      store.set({ project: next, selectedBoneId: null });
      ui.setStatus("다시 실행");
    }
    event.preventDefault();
  }
});
