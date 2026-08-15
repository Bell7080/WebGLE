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
    // 위치는 일단 이미지 중앙. 캔버스에서 찍어 만드는 조작은 다음 단계에서 붙인다.
    commit((current) => ({
      ...current,
      bones: [
        ...current.bones,
        createBone(part, current.character.width / 2, current.character.height / 2, current.bones),
      ],
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
    commit((current) => ({
      ...current,
      bones: current.bones.map((bone) =>
        bone.id === boneId ? ({ ...bone, ...patch } as PuppetBone) : bone,
      ),
    }));
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
