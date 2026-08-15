import Phaser from "phaser";
import {
  DEFAULT_OVERLAY_VISIBILITY,
  hexToNumber,
  type OverlayVisibility,
  type PuppetBone,
  type PuppetMesh,
} from "@core/format";
import { toUV } from "@core/mesh";

const TEXTURE_KEY = "character";
const WEIGHT_TEXTURE_KEY = "weight-overlay";
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
  /** 커서 링 색. 보통 지금 고른 관절의 색이다. */
  color: number;
  /** 한 번 칠할 때 쌓이는 양 0~1. 커서 진하기로 그대로 보여 준다. */
  amount: number;
  erase: boolean;
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
  private weightOverlay: Phaser.GameObjects.Image | null = null;

  private bones: readonly PuppetBone[] = [];
  private selectedBoneId: string | null = null;
  private visibility: OverlayVisibility = { ...DEFAULT_OVERLAY_VISIBILITY };

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

  /**
   * 영향 영역 점 패턴을 이미지 위에 얹는다.
   * 캔버스로 구운 텍스처라 정점 수와 상관없이 촘촘하고, 매 프레임 다시 그리지 않는다.
   */
  setWeightOverlay(canvas: HTMLCanvasElement | null): void {
    this.weightOverlay?.destroy();
    this.weightOverlay = null;
    if (this.textures.exists(WEIGHT_TEXTURE_KEY)) this.textures.remove(WEIGHT_TEXTURE_KEY);
    if (!canvas) return;

    this.textures.addCanvas(WEIGHT_TEXTURE_KEY, canvas);
    this.weightOverlay = this.add
      .image(0, 0, WEIGHT_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setDepth(5)
      .setVisible(this.visibility.weights);
  }

  /** 변형된 정점 좌표를 반영한다. null이면 기준 자세로 되돌린다. */
  updateMeshVertices(deformed: Float32Array | null): void {
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

    // Phaser는 Mesh 자신의 변환이 그대로면 정점 투영을 건너뛴다.
    // 변형 중에는 매 프레임 다시 계산하게 두고, 멈추면 한 번만 갱신하고 다시 건너뛰게 한다.
    meshObject.ignoreDirtyCache = deformed !== null;
    // dirtyCache[10]은 "뷰 행렬이 바뀌었다" 표시다. 타입 정의에는 빠져 있어 직접 접근한다.
    if (!deformed) (meshObject as unknown as { dirtyCache: number[] }).dirtyCache[10] = 1;

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
  ): void {
    this.bones = bones;
    this.selectedBoneId = selectedId;
    this.visibility = visibility;
    this.weightOverlay?.setVisible(visibility.weights);
    this.redrawOverlay();
  }

  /** Zoom이 바뀌어도 관절점 크기가 화면상 일정하도록 다시 그린다. */
  private redrawOverlay(): void {
    const overlay = this.overlay;
    if (!overlay) return;

    overlay.clear();
    const zoom = this.cameras.main.zoom;

    if (this.visibility.links) this.drawLinks(overlay, zoom);
    if (this.visibility.bones) this.drawBonePoints(overlay, zoom);
    if (this.paint && this.brushWorld) this.drawBrush(overlay, zoom);
  }

  /** 연결선은 자식 관절의 색을 따른다. */
  private drawLinks(overlay: Phaser.GameObjects.Graphics, zoom: number): void {
    const byId = new Map(this.bones.map((bone) => [bone.id, bone]));
    for (const bone of this.bones) {
      const parent = bone.parentId ? byId.get(bone.parentId) : undefined;
      if (!parent) continue;

      overlay.lineStyle(3 / zoom, 0x000000, 0.45);
      overlay.lineBetween(parent.x, parent.y, bone.x, bone.y);
      overlay.lineStyle(1.5 / zoom, hexToNumber(bone.color), 0.9);
      overlay.lineBetween(parent.x, parent.y, bone.x, bone.y);
    }
  }

  private drawBonePoints(overlay: Phaser.GameObjects.Graphics, zoom: number): void {
    const radius = BONE_RADIUS / zoom;
    for (const bone of this.bones) {
      const selected = bone.id === this.selectedBoneId;
      const color = hexToNumber(bone.color);

      overlay.fillStyle(0x000000, 0.6);
      overlay.fillCircle(bone.x, bone.y, radius + 1.5 / zoom);

      overlay.fillStyle(color, selected ? 1 : 0.85);
      overlay.fillCircle(bone.x, bone.y, radius);

      if (selected) {
        // 선택된 관절만 흰 링과 가운데 점으로 한 번 더 구분한다.
        overlay.fillStyle(0x111113, 1);
        overlay.fillCircle(bone.x, bone.y, radius * 0.34);
        overlay.lineStyle(1.5 / zoom, 0xffffff, 0.9);
        overlay.strokeCircle(bone.x, bone.y, radius * 2);
      }
    }
  }

  /**
   * 브러시 커서. 크기뿐 아니라 가중치도 보여 준다.
   * 한 번 칠했을 때 얼마나 묻는지(진하기)와 가장자리가 얼마나 옅어지는지를 그대로 그린다.
   */
  private drawBrush(overlay: Phaser.GameObjects.Graphics, zoom: number): void {
    const brush = this.brushWorld;
    const paint = this.paint;
    if (!brush || !paint) return;

    const amount = Math.max(0, Math.min(1, paint.amount));
    const color = paint.erase ? 0xffffff : paint.color;

    // 안쪽에서 바깥으로 갈수록 옅어지는 falloff를 고리 몇 겹으로 흉내 낸다.
    const RINGS = 5;
    for (let i = RINGS; i >= 1; i -= 1) {
      const t = i / RINGS;
      const falloff = 1 - t * t * (3 - 2 * t); // 중심 1 → 가장자리 0
      overlay.fillStyle(color, falloff * amount * (paint.erase ? 0.18 : 0.3));
      overlay.fillCircle(brush.x, brush.y, paint.radius * t);
    }

    // 테두리도 가중치만큼 또렷해진다.
    overlay.lineStyle(2.5 / zoom, 0x000000, 0.45);
    overlay.strokeCircle(brush.x, brush.y, paint.radius);
    overlay.lineStyle(1.5 / zoom, color, 0.3 + amount * 0.65);
    overlay.strokeCircle(brush.x, brush.y, paint.radius);

    if (paint.erase) {
      // 지우개는 안쪽에 고리를 하나 더 둘러 구분한다.
      overlay.lineStyle(1 / zoom, 0xffffff, 0.35);
      overlay.strokeCircle(brush.x, brush.y, paint.radius * 0.72);
    }
  }


  clearTexture(): void {
    this.setWeightOverlay(null);
    this.overlay?.clear();
    this.sprite?.destroy();
    this.sprite = null;
    this.destroyMesh();
    this.meshData = null;
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
