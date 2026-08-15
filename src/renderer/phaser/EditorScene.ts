import Phaser from "phaser";
import type { PuppetBone } from "@core/format";

const TEXTURE_KEY = "character";
const BONE_RADIUS = 5;
/** 관절을 집을 수 있는 화면상 반경(px). 점보다 넉넉하게 잡는다. */
const PICK_RADIUS = 11;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

export interface BoneInteractionHandlers {
  /** 빈 곳을 클릭하면 null. */
  onSelect(boneId: string | null): void;
  onDragStart(boneId: string): void;
  onDrag(boneId: string, x: number, y: number): void;
  onDragEnd(boneId: string): void;
}

/**
 * 편집 캔버스 Scene.
 * 캐릭터 이미지 표시, Zoom / Pan, 관절점 표시와 이동을 담당한다. (기획서 14, 78)
 * Mesh와 Weight 렌더링은 이후 Phase에서 이 Scene 위에 얹는다.
 */
export class EditorScene extends Phaser.Scene {
  static readonly KEY = "editor";

  private sprite: Phaser.GameObjects.Image | null = null;
  private grid: Phaser.GameObjects.Grid | null = null;
  private overlay: Phaser.GameObjects.Graphics | null = null;
  private bones: readonly PuppetBone[] = [];
  private selectedBoneId: string | null = null;
  private panning = false;
  private draggingBoneId: string | null = null;
  private onZoomChange: ((zoom: number) => void) | null = null;
  private handlers: BoneInteractionHandlers | null = null;

  constructor() {
    super(EditorScene.KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0b0b0c");
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
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.panning = true;
        return;
      }
      if (!pointer.leftButtonDown()) return;

      // 왼쪽 버튼: 관절 선택 후 그대로 끌어서 이동. (기획서 14)
      const picked = this.pickBone(pointer);
      this.handlers?.onSelect(picked?.id ?? null);
      if (picked) {
        this.draggingBoneId = picked.id;
        this.handlers?.onDragStart(picked.id);
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.panning = false;
      if (this.draggingBoneId) {
        this.handlers?.onDragEnd(this.draggingBoneId);
        this.draggingBoneId = null;
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const camera = this.cameras.main;

      if (this.panning) {
        camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
        camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
        this.redrawOverlay();
        return;
      }

      if (this.draggingBoneId) {
        const world = camera.getWorldPoint(pointer.x, pointer.y);
        this.handlers?.onDrag(this.draggingBoneId, world.x, world.y);
        return;
      }

      this.input.setDefaultCursor(this.pickBone(pointer) ? "grab" : "default");
    });
  }

  setZoomListener(listener: (zoom: number) => void): void {
    this.onZoomChange = listener;
  }

  setBoneHandlers(handlers: BoneInteractionHandlers): void {
    this.handlers = handlers;
  }

  /** 포인터에 가장 가까운 관절. 화면 기준 반경 안에 없으면 undefined. */
  private pickBone(pointer: Phaser.Input.Pointer): PuppetBone | undefined {
    if (this.bones.length === 0) return undefined;

    const camera = this.cameras.main;
    const world = camera.getWorldPoint(pointer.x, pointer.y);
    const radius = PICK_RADIUS / camera.zoom;

    let nearest: PuppetBone | undefined;
    let nearestDistance = radius;
    for (const bone of this.bones) {
      const distance = Phaser.Math.Distance.Between(world.x, world.y, bone.x, bone.y);
      if (distance <= nearestDistance) {
        nearest = bone;
        nearestDistance = distance;
      }
    }
    return nearest;
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
      .grid(0, 0, image.width, image.height, 32, 32, undefined, 0, 0xffffff, 0.06)
      .setOrigin(0, 0)
      .setDepth(-1);

    this.fitToView();
  }

  /**
   * 현재 화면 중앙의 월드 좌표. 새 관절을 놓을 기본 위치로 쓴다.
   * offsetPx만큼 어긋나게 두면 여러 개를 연달아 추가해도 완전히 겹치지 않는다.
   */
  getViewCenter(offsetPx = 0): { x: number; y: number } {
    const camera = this.cameras.main;
    const offset = offsetPx / camera.zoom;
    return { x: camera.midPoint.x + offset, y: camera.midPoint.y + offset };
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

  /** 관절점과 부모 연결선을 그린다. 흑백으로만 구분한다. (기획서 74) */
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
    const zoom = this.cameras.main.zoom;
    const byId = new Map(bones.map((bone) => [bone.id, bone]));

    // 부모 연결선
    overlay.lineStyle(1.5 / zoom, 0xffffff, 0.45);
    for (const bone of bones) {
      const parent = bone.parentId ? byId.get(bone.parentId) : undefined;
      if (parent) overlay.lineBetween(parent.x, parent.y, bone.x, bone.y);
    }

    // 관절점: 어두운 테두리 + 흰 점. 선택된 것만 링을 두른다.
    const radius = BONE_RADIUS / zoom;
    for (const bone of bones) {
      const selected = bone.id === selectedId;

      overlay.fillStyle(0x000000, 0.55);
      overlay.fillCircle(bone.x, bone.y, radius + 1.5 / zoom);

      overlay.fillStyle(0xffffff, selected ? 1 : 0.78);
      overlay.fillCircle(bone.x, bone.y, radius);

      if (selected) {
        overlay.fillStyle(0x111113, 1);
        overlay.fillCircle(bone.x, bone.y, radius * 0.34);
        overlay.lineStyle(1.5 / zoom, 0xffffff, 0.85);
        overlay.strokeCircle(bone.x, bone.y, radius * 2);
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
