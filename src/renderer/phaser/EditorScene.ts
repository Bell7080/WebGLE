import Phaser from "phaser";
import {
  DEFAULT_OVERLAY_VISIBILITY,
  type OverlayVisibility,
  type PuppetBone,
  type PuppetMesh,
} from "@core/format";
import { toUV } from "@core/mesh";

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

export interface PaintHandlers {
  /** 브러시 반경(이미지 픽셀). */
  radius: number;
  onStart(): void;
  onPaint(x: number, y: number): void;
  onEnd(): void;
}

/**
 * 편집 캔버스 Scene.
 * 이미지 · Mesh 표시, Zoom / Pan, 관절 이동, 영향 영역 칠하기를 담당한다.
 * 애니메이션 계산은 core가 하고, 여기서는 결과 좌표만 받아 그린다. (기획서 62)
 */
export class EditorScene extends Phaser.Scene {
  static readonly KEY = "editor";

  private sprite: Phaser.GameObjects.Image | null = null;
  private meshObject: Phaser.GameObjects.Mesh | null = null;
  private meshData: PuppetMesh | null = null;
  private overlay: Phaser.GameObjects.Graphics | null = null;

  private bones: readonly PuppetBone[] = [];
  private selectedBoneId: string | null = null;
  private visibility: OverlayVisibility = { ...DEFAULT_OVERLAY_VISIBILITY };
  /** 선택된 Bone의 정점별 가중치(0~1). 표시용. */
  private weightPreview: readonly number[] | null = null;
  /** 화면에 그릴 정점 좌표. 변형 결과가 없으면 원본을 쓴다. */
  private deformed: Float32Array | null = null;

  private panning = false;
  private draggingBoneId: string | null = null;
  private painting = false;
  private brushWorld: { x: number; y: number } | null = null;

  private onZoomChange: ((zoom: number) => void) | null = null;
  private handlers: BoneInteractionHandlers | null = null;
  private paint: PaintHandlers | null = null;

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

      // 칠하기 중에는 관절을 건드리지 않는다.
      if (this.paint) {
        this.painting = true;
        this.paint.onStart();
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        this.paint.onPaint(world.x, world.y);
        return;
      }

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
      if (this.painting) {
        this.painting = false;
        this.paint?.onEnd();
      }
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

      const world = camera.getWorldPoint(pointer.x, pointer.y);

      if (this.paint) {
        this.brushWorld = { x: world.x, y: world.y };
        if (this.painting) this.paint.onPaint(world.x, world.y);
        this.redrawOverlay();
        return;
      }

      if (this.draggingBoneId) {
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

  /** 칠하기 모드. null이면 평소처럼 관절을 집는다. */
  setPaintHandlers(paint: PaintHandlers | null): void {
    this.paint = paint;
    this.painting = false;
    this.brushWorld = null;
    this.input.setDefaultCursor(paint ? "crosshair" : "default");
    this.redrawOverlay();
  }

  /** 포인터에 가장 가까운 관절. 화면 기준 반경 안에 없으면 undefined. */
  private pickBone(pointer: Phaser.Input.Pointer): PuppetBone | undefined {
    // 감춰둔 관절은 집을 수 없다. 보이는 것만 조작 대상이다.
    if (!this.visibility.bones || this.bones.length === 0) return undefined;

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

    this.destroyMesh();
    this.fitToView();
  }

  /**
   * 격자 Mesh를 캔버스에 올린다.
   * Phaser Mesh는 원점이 항상 중앙이고 y축이 위로 향하므로, 이미지 좌표를 그에 맞춰 옮긴다.
   */
  setMesh(mesh: PuppetMesh, width: number, height: number): void {
    this.meshData = mesh;
    this.deformed = null;
    this.destroyMesh();

    // WebGL에서만 Mesh를 쓸 수 있다. Canvas 렌더러면 원본 이미지를 그대로 둔다.
    if (this.game.renderer.type !== Phaser.WEBGL) return;

    const uv = toUV(mesh, width, height);
    const positions: number[] = [];
    const uvs: number[] = [];
    for (const index of mesh.indices) {
      positions.push(
        (mesh.vertices[index * 2] ?? 0) - width / 2,
        height / 2 - (mesh.vertices[index * 2 + 1] ?? 0),
      );
      uvs.push(uv[index * 2] ?? 0, uv[index * 2 + 1] ?? 0);
    }

    const meshObject = this.add.mesh(width / 2, height / 2, TEXTURE_KEY);
    meshObject.setSize(width, height);
    meshObject.setOrtho(width, height);
    meshObject.hideCCW = false;
    meshObject.addVertices(positions, uvs);

    this.meshObject = meshObject;
    this.sprite?.setVisible(false);
  }

  /** 변형된 정점 좌표를 반영한다. null이면 기준 자세로 되돌린다. */
  updateMeshVertices(deformed: Float32Array | null): void {
    this.deformed = deformed;

    const mesh = this.meshData;
    const meshObject = this.meshObject;
    if (!mesh || !meshObject) {
      this.redrawOverlay();
      return;
    }

    const source = deformed ?? Float32Array.from(mesh.vertices);
    const halfWidth = meshObject.width / 2;
    const halfHeight = meshObject.height / 2;

    mesh.indices.forEach((index, slot) => {
      const vertex = meshObject.vertices[slot];
      if (!vertex) return;
      vertex.x = (source[index * 2] ?? 0) - halfWidth;
      vertex.y = halfHeight - (source[index * 2 + 1] ?? 0);
    });

    this.redrawOverlay();
  }

  /** 현재 화면 중앙의 월드 좌표. 새 관절을 놓을 기본 위치로 쓴다. */
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
  drawBones(
    bones: readonly PuppetBone[],
    selectedId: string | null,
    visibility: OverlayVisibility = this.visibility,
    weightPreview: readonly number[] | null = null,
  ): void {
    this.bones = bones;
    this.selectedBoneId = selectedId;
    this.visibility = visibility;
    this.weightPreview = weightPreview;
    this.redrawOverlay();
  }

  /** Zoom이 바뀌어도 관절점 크기가 화면상 일정하도록 다시 그린다. */
  private redrawOverlay(): void {
    const overlay = this.overlay;
    if (!overlay) return;

    overlay.clear();
    const zoom = this.cameras.main.zoom;

    if (this.visibility.weights) this.drawWeights(overlay, zoom);
    if (this.visibility.links) this.drawLinks(overlay, zoom);
    if (this.visibility.bones) this.drawBonePoints(overlay, zoom);
    if (this.paint && this.brushWorld) this.drawBrush(overlay, zoom);
  }

  /** 선택된 Bone의 영향 영역을 정점 밝기로 보여준다. (기획서 74) */
  private drawWeights(overlay: Phaser.GameObjects.Graphics, zoom: number): void {
    const mesh = this.meshData;
    if (!mesh) return;

    const source = this.deformed ?? mesh.vertices;
    const dot = 2 / zoom;

    for (let i = 0; i < mesh.weights.length; i += 1) {
      const x = source[i * 2] ?? 0;
      const y = source[i * 2 + 1] ?? 0;
      const value = this.weightPreview?.[i] ?? 0;

      if (value > 0.01) {
        overlay.fillStyle(0xffffff, 0.15 + value * 0.75);
        overlay.fillCircle(x, y, dot * (0.8 + value));
      } else if ((mesh.weights[i]?.boneIds.length ?? 0) > 0) {
        overlay.fillStyle(0xffffff, 0.14);
        overlay.fillCircle(x, y, dot * 0.7);
      } else {
        // 아직 아무도 칠하지 않은 정점. 있다는 것만 알 정도로 옅게 둔다.
        overlay.fillStyle(0x000000, 0.22);
        overlay.fillCircle(x, y, dot * 0.4);
      }
    }
  }

  private drawLinks(overlay: Phaser.GameObjects.Graphics, zoom: number): void {
    const byId = new Map(this.bones.map((bone) => [bone.id, bone]));
    overlay.lineStyle(1.5 / zoom, 0xffffff, 0.45);
    for (const bone of this.bones) {
      const parent = bone.parentId ? byId.get(bone.parentId) : undefined;
      if (parent) overlay.lineBetween(parent.x, parent.y, bone.x, bone.y);
    }
  }

  private drawBonePoints(overlay: Phaser.GameObjects.Graphics, zoom: number): void {
    const radius = BONE_RADIUS / zoom;
    for (const bone of this.bones) {
      const selected = bone.id === this.selectedBoneId;

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

  private drawBrush(overlay: Phaser.GameObjects.Graphics, zoom: number): void {
    const brush = this.brushWorld;
    const paint = this.paint;
    if (!brush || !paint) return;

    overlay.lineStyle(1 / zoom, 0x000000, 0.6);
    overlay.strokeCircle(brush.x, brush.y, paint.radius + 1 / zoom);
    overlay.lineStyle(1 / zoom, 0xffffff, 0.9);
    overlay.strokeCircle(brush.x, brush.y, paint.radius);
  }

  clearTexture(): void {
    this.overlay?.clear();
    this.sprite?.destroy();
    this.sprite = null;
    this.destroyMesh();
    this.meshData = null;
    this.deformed = null;
    if (this.textures.exists(TEXTURE_KEY)) this.textures.remove(TEXTURE_KEY);
  }

  private destroyMesh(): void {
    this.meshObject?.destroy();
    this.meshObject = null;
    this.sprite?.setVisible(true);
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
