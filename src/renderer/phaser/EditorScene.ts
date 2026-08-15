import Phaser from "phaser";
import type { PuppetBone } from "@core/format";

const TEXTURE_KEY = "character";
const BONE_RADIUS = 5;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

/**
 * 편집 캔버스 Scene.
 * 지금은 캐릭터 이미지 표시와 Zoom / Pan만 담당한다. (기획서 78-4~6)
 * Bone, Mesh 렌더링은 이후 Phase에서 이 Scene 위에 얹는다.
 */
export class EditorScene extends Phaser.Scene {
  static readonly KEY = "editor";

  private sprite: Phaser.GameObjects.Image | null = null;
  private grid: Phaser.GameObjects.Grid | null = null;
  private overlay: Phaser.GameObjects.Graphics | null = null;
  private bones: readonly PuppetBone[] = [];
  private selectedBoneId: string | null = null;
  private panning = false;
  private onZoomChange: ((zoom: number) => void) | null = null;

  constructor() {
    super(EditorScene.KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#101216");
    this.overlay = this.add.graphics().setDepth(10);
    this.input.mouse?.disableContextMenu();

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        this.zoomAt(pointer, dy > 0 ? 0.9 : 1 / 0.9);
      },
    );

    // 창 크기가 바뀌면 이미지가 다시 화면에 들어오게 맞춘다.
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitToView());

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) this.panning = true;
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.panning = false;
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!this.panning) return;
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
      camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
    });
  }

  setZoomListener(listener: (zoom: number) => void): void {
    this.onZoomChange = listener;
  }

  /** 불러온 이미지를 캔버스에 올린다. 기존 텍스처는 교체한다. */
  showTexture(image: HTMLImageElement, pixelArt: boolean): void {
    if (this.textures.exists(TEXTURE_KEY)) this.textures.remove(TEXTURE_KEY);
    const texture = this.textures.addImage(TEXTURE_KEY, image);
    texture?.setFilter(
      pixelArt ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR,
    );

    this.sprite?.destroy();
    this.sprite = this.add.image(0, 0, TEXTURE_KEY).setOrigin(0, 0);

    this.grid?.destroy();
    this.grid = this.add
      .grid(0, 0, image.width, image.height, 32, 32, undefined, 0, 0x3a3f4a, 0.35)
      .setOrigin(0, 0)
      .setDepth(-1);

    this.fitToView();
  }

  /** 이미지 전체가 보이도록 카메라를 맞춘다. */
  fitToView(): void {
    if (!this.sprite) return;
    const camera = this.cameras.main;
    const margin = 40;
    const zoom = Math.min(
      (camera.width - margin) / this.sprite.width,
      (camera.height - margin) / this.sprite.height,
    );
    camera.setZoom(Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM));
    camera.centerOn(this.sprite.width / 2, this.sprite.height / 2);
    this.redrawOverlay();
    this.onZoomChange?.(camera.zoom);
  }

  /**
   * 관절점과 부모 연결선을 그린다. (기획서 74)
   * 캔버스에서의 선택/드래그 조작은 이후 Phase에서 추가한다.
   */
  drawBones(bones: readonly PuppetBone[], selectedId: string | null): void {
    this.bones = bones;
    this.selectedBoneId = selectedId;
    this.redrawOverlay();
  }

  /** Zoom이 바뀌어도 관절점 크기가 화면상 일정하도록 다시 그린다. */
  private redrawOverlay(): void {
    const overlay = this.overlay;
    if (!overlay) return;
    const bones = this.bones;
    const selectedId = this.selectedBoneId;

    overlay.clear();
    const byId = new Map(bones.map((bone) => [bone.id, bone]));

    overlay.lineStyle(2 / this.cameras.main.zoom, 0x7f8798, 0.9);
    for (const bone of bones) {
      const parent = bone.parentId ? byId.get(bone.parentId) : undefined;
      if (parent) overlay.lineBetween(parent.x, parent.y, bone.x, bone.y);
    }

    const radius = BONE_RADIUS / this.cameras.main.zoom;
    for (const bone of bones) {
      const selected = bone.id === selectedId;
      overlay.fillStyle(selected ? 0x4c8dff : 0xdfe3ea, 1);
      overlay.fillCircle(bone.x, bone.y, radius);
      if (selected) {
        overlay.lineStyle(2 / this.cameras.main.zoom, 0xffffff, 0.9);
        overlay.strokeCircle(bone.x, bone.y, radius * 1.8);
      }
    }
  }

  clearTexture(): void {
    this.overlay?.clear();
    this.sprite?.destroy();
    this.sprite = null;
    this.grid?.destroy();
    this.grid = null;
    if (this.textures.exists(TEXTURE_KEY)) this.textures.remove(TEXTURE_KEY);
  }

  /** 포인터 아래 지점을 고정한 채 확대/축소한다. */
  private zoomAt(pointer: Phaser.Input.Pointer, factor: number): void {
    const camera = this.cameras.main;
    const next = Phaser.Math.Clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === camera.zoom) return;

    // getWorldPoint은 preRender에서 갱신되는 행렬을 쓰므로 setZoom 직후에는 값이 낡는다.
    // 화면 중심 기준 오프셋으로 직접 보정한다.
    const scale = 1 / camera.zoom - 1 / next;
    camera.setZoom(next);
    camera.scrollX += (pointer.x - camera.width / 2) * scale;
    camera.scrollY += (pointer.y - camera.height / 2) * scale;
    this.redrawOverlay();
    this.onZoomChange?.(next);
  }
}
