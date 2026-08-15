import Phaser from "phaser";
import { EditorScene } from "./EditorScene";

export { EditorScene };

export interface CanvasView {
  scene: EditorScene;
  destroy(): void;
}

/**
 * 편집 캔버스를 생성한다.
 * 렌더링만 Phaser가 담당하고, 편집기 UI는 DOM으로 만든다. (기획서 4)
 */
export function createCanvasView(parent: HTMLElement): Promise<CanvasView> {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#0b0b0c",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight,
    },
    scene: [EditorScene],
    banner: false,
  });

  return new Promise((resolve) => {
    game.events.once(Phaser.Core.Events.READY, () => {
      resolve({
        scene: game.scene.getScene(EditorScene.KEY) as EditorScene,
        destroy: () => game.destroy(true),
      });
    });
  });
}
