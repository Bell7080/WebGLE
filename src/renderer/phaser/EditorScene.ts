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
const BONE_RADIUS = 8;
/** 관절을 집을 수 있는 화면상 반경(px). 점보다 넉넉하게 잡는다. */
const PICK_RADIUS = 14;
/** 선택된 관절을 돌리는 링의 반경(px). 이 부근을 끌면 회전이 된다. */
const ROTATE_RADIUS = 26;
/** 링을 집을 수 있는 두께(px). */
const ROTATE_BAND = 9;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;

export interface BoneInteractionHandlers {
  /** 빈 곳을 클릭하면 null. */
  onSelect(boneId: string | null): void;
  onDragStart(boneId: string): void;
  onDrag(boneId: string, x: number, y: number): void;
  onDragEnd(boneId: string): void;
  /**
   * 선택된 관절의 바깥 링을 끌었을 때. 라디안 단위의 누적 회전량이다.
   * 안쪽 점을 끌면 이동, 링을 끌면 회전이다. (스파인과 같은 방식)
   */
  onRotate(boneId: string, radians: number): void;
  /** 우클릭으로 가로·세로 크기를 끌어 바꿀 때의 누적 배율이다. */
  onScale(boneId: string, scaleX: number, scaleY: number): void;
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
  /**
   * 재생 중인 자세에서 관절이 실제로 가 있는 위치. 멈춰 있으면 null이다.
   * 그림이 휘는데 관절점만 기준 자세에 박혀 있으면 어디를 잡아야 할지 알 수 없다.
   */
  private posed: ReadonlyMap<string, { x: number; y: number }> | null = null;
  /** 지금 자세를 편집할 수 있는 상태인지. 회전 링을 진하게 그릴지 정한다. */
  private canPose = false;
  private selectedBoneId: string | null = null;
  private visibility: OverlayVisibility = { ...DEFAULT_OVERLAY_VISIBILITY };

  private panning = false;
  private draggingBoneId: string | null = null;
  /** 우클릭으로 크기를 편집 중인 관절과 잡은 화면 좌표. */
  private scalingBoneId: string | null = null;
  private scaleFrom = { x: 0, y: 0 };
  /** 바깥 링을 잡아 돌리는 중인 관절. */
  private rotatingBoneId: string | null = null;
  /** 잡은 순간의 각도와, 그 뒤로 누적된 회전량(라디안). */
  private rotateFrom = 0;
  private rotateAccum = 0;
  private painting = false;
  private brushWorld: { x: number; y: number } | null = null;

  /**
   * 화면에 닿아 있는 손가락들. id → 마지막 위치.
   *
   * Phaser의 포인터로도 멀티터치를 볼 수 있지만, 두 손가락 벌리기는 두 점의 **관계**를
   * 봐야 해서 캔버스 DOM에서 직접 듣는 편이 훨씬 짧다.
   */
  private readonly touches = new Map<number, { x: number; y: number }>();
  /** 두 손가락 제스처 중인지. 이 동안에는 관절 조작과 칠하기를 모두 멈춘다. */
  private gesturing = false;
  /** 직전 두 손가락 사이 거리와 중점. 확대율과 이동량을 여기서 뽑는다. */
  private pinchDistance = 0;
  private pinchCenter = { x: 0, y: 0 };

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

    this.attachTouchGestures();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (this.gesturing) return;
      if (pointer.rightButtonDown()) {
        // 관절 위 우클릭은 가로·세로 크기 편집, 빈 곳 우클릭은 기존 화면 이동이다.
        const picked = this.pickBone(pointer);
        if (picked && !this.paint) {
          this.handlers?.onSelect(picked.id);
          this.scalingBoneId = picked.id;
          this.scaleFrom = { x: pointer.x, y: pointer.y };
          this.handlers?.onDragStart(picked.id);
        } else {
          this.panning = true;
        }
        return;
      }
      if (pointer.middleButtonDown()) {
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

      // 선택된 관절의 바깥 링을 잡았으면 회전이다.
      const spinning = this.pickRotateHandle(pointer);
      if (spinning) {
        this.rotatingBoneId = spinning.id;
        this.rotateFrom = this.angleTo(pointer, spinning.id);
        this.rotateAccum = 0;
        this.handlers?.onDragStart(spinning.id);
        return;
      }

      // 왼쪽 버튼: 관절 선택 후 그대로 끌어서 이동. (기획서 14)
      const picked = this.pickBone(pointer);
      this.handlers?.onSelect(picked?.id ?? null);
      if (picked) {
        this.draggingBoneId = picked.id;
        this.handlers?.onDragStart(picked.id);
        return;
      }

      // 손가락으로 빈 곳을 끌면 화면이 움직인다.
      // 마우스에는 우클릭 드래그가 있지만 손가락에는 없어서, 빈 곳이 그 자리를 대신한다.
      if (pointer.wasTouch) this.panning = true;
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
      if (this.rotatingBoneId) {
        this.handlers?.onDragEnd(this.rotatingBoneId);
        this.rotatingBoneId = null;
      }
      if (this.scalingBoneId) {
        this.handlers?.onDragEnd(this.scalingBoneId);
        this.scalingBoneId = null;
      }
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.gesturing) return;
      const camera = this.cameras.main;

      if (this.panning) {
        camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
        camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
        this.redrawOverlay();
        return;
      }

      const world = camera.getWorldPoint(pointer.x, pointer.y);

      if (this.scalingBoneId) {
        // 100 화면 px를 끌 때 약 e배가 되며, 지수식이라 음수 크기나 0을 만들지 않는다.
        const scaleX = Math.exp((pointer.x - this.scaleFrom.x) / 100);
        const scaleY = Math.exp((pointer.y - this.scaleFrom.y) / 100);
        this.handlers?.onScale(this.scalingBoneId, scaleX, scaleY);
        return;
      }

      if (this.paint) {
        this.brushWorld = { x: world.x, y: world.y };
        if (this.painting) this.paint.onPaint(world.x, world.y);
        this.redrawOverlay();
        return;
      }

      if (this.rotatingBoneId) {
        const now = this.angleTo(pointer, this.rotatingBoneId);
        // 한 바퀴를 넘겨도 이어지도록 −π~π로 접어 누적한다.
        let step = now - this.rotateFrom;
        while (step > Math.PI) step -= Math.PI * 2;
        while (step < -Math.PI) step += Math.PI * 2;
        this.rotateFrom = now;
        this.rotateAccum += step;
        this.handlers?.onRotate(this.rotatingBoneId, this.rotateAccum);
        return;
      }

      if (this.draggingBoneId) {
        this.handlers?.onDrag(this.draggingBoneId, world.x, world.y);
        return;
      }

      if (this.pickRotateHandle(pointer)) {
        this.input.setDefaultCursor("crosshair");
      } else {
        this.input.setDefaultCursor(this.pickBone(pointer) ? "grab" : "default");
      }
    });
  }

  /**
   * 두 손가락 확대 · 이동. (모바일)
   *
   * 마우스에는 휠과 우클릭 드래그가 있지만 손가락에는 그런 것이 없다.
   * 벌리면 확대, 오므리면 축소, 두 손가락을 함께 끌면 화면이 따라 움직인다.
   * 마우스 조작은 이 코드를 전혀 지나가지 않으므로 그대로다.
   */
  private attachTouchGestures(): void {
    const canvas = this.game.canvas;
    if (!canvas) return;

    // 브라우저가 먼저 확대하거나 화면을 끌고 가 버리면 여기까지 오지 않는다.
    canvas.style.touchAction = "none";

    const center = () => {
      const [a, b] = [...this.touches.values()];
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
    };
    const spread = () => {
      const [a, b] = [...this.touches.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    const at = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      this.touches.set(event.pointerId, at(event));

      if (this.touches.size === 2) {
        // 손가락이 하나 더 얹혔다. 그 전까지 하던 조작은 없던 일로 되돌린다 —
        // 화면을 넓히려던 것이지 관절을 옮기려던 것이 아니다.
        this.cancelPointerWork();
        this.gesturing = true;
        this.pinchDistance = spread();
        this.pinchCenter = center();
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch" || !this.touches.has(event.pointerId)) return;
      this.touches.set(event.pointerId, at(event));
      if (!this.gesturing || this.touches.size < 2) return;

      const camera = this.cameras.main;
      const now = spread();
      const middle = center();

      // 벌어진 만큼 확대한다. 손가락 사이가 붙으면 0으로 나누게 되므로 막아 둔다.
      if (this.pinchDistance > 8 && now > 8) {
        const zoom = Phaser.Math.Clamp(
          camera.zoom * (now / this.pinchDistance),
          MIN_ZOOM,
          MAX_ZOOM,
        );
        // 두 손가락 사이의 그림이 그 자리에 머무르게 한다.
        const before = camera.getWorldPoint(middle.x, middle.y);
        camera.setZoom(zoom);
        const after = camera.getWorldPoint(middle.x, middle.y);
        camera.scrollX += before.x - after.x;
        camera.scrollY += before.y - after.y;
        this.onZoomChange?.(camera.zoom);
      }

      // 중점이 움직인 만큼 화면도 함께 끌려간다.
      camera.scrollX -= (middle.x - this.pinchCenter.x) / camera.zoom;
      camera.scrollY -= (middle.y - this.pinchCenter.y) / camera.zoom;

      this.pinchDistance = now;
      this.pinchCenter = middle;
      this.redrawOverlay();
    });

    const lift = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      this.touches.delete(event.pointerId);
      if (this.touches.size < 2) this.gesturing = false;
    };
    canvas.addEventListener("pointerup", lift);
    canvas.addEventListener("pointercancel", lift);
  }

  /** 하던 조작을 없던 일로 되돌린다. 손가락이 하나 더 얹혔을 때 쓴다. */
  private cancelPointerWork(): void {
    this.panning = false;
    if (this.painting) {
      this.painting = false;
      this.paint?.onEnd();
    }
    if (this.draggingBoneId) {
      this.handlers?.onDragEnd(this.draggingBoneId);
      this.draggingBoneId = null;
    }
    if (this.rotatingBoneId) {
      this.handlers?.onDragEnd(this.rotatingBoneId);
      this.rotatingBoneId = null;
    }
    if (this.scalingBoneId) {
      this.handlers?.onDragEnd(this.scalingBoneId);
      this.scalingBoneId = null;
    }
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
  /** 선택된 관절의 바깥 링을 잡았는지. 자세를 편집할 수 있을 때만 동작한다. */
  private pickRotateHandle(pointer: Phaser.Input.Pointer): PuppetBone | undefined {
    if (!this.canPose || !this.visibility.bones) return undefined;

    const bone = this.bones.find((candidate) => candidate.id === this.selectedBoneId);
    if (!bone) return undefined;

    const camera = this.cameras.main;
    const world = camera.getWorldPoint(pointer.x, pointer.y);
    const at = this.positionOf(bone);
    const distance = Phaser.Math.Distance.Between(world.x, world.y, at.x, at.y) * camera.zoom;

    return Math.abs(distance - ROTATE_RADIUS) <= ROTATE_BAND ? bone : undefined;
  }

  /** 관절 중심에서 포인터를 바라보는 각도(라디안). */
  private angleTo(pointer: Phaser.Input.Pointer, boneId: string): number {
    const bone = this.bones.find((candidate) => candidate.id === boneId);
    if (!bone) return 0;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const at = this.positionOf(bone);
    return Math.atan2(world.y - at.y, world.x - at.x);
  }

  /** 지금 자세를 편집할 수 있는지 알려 준다. 회전 링의 진하기와 집기 판정에 쓴다. */
  setPoseEditable(editable: boolean): void {
    if (this.canPose === editable) return;
    this.canPose = editable;
    this.redrawOverlay();
  }

  private pickBone(pointer: Phaser.Input.Pointer): PuppetBone | undefined {
    // 감춰둔 관절은 집을 수 없다. 보이는 것만 조작 대상이다.
    if (!this.visibility.bones || this.bones.length === 0) return undefined;

    const camera = this.cameras.main;
    const world = camera.getWorldPoint(pointer.x, pointer.y);
    const radius = PICK_RADIUS / camera.zoom;

    let nearest: PuppetBone | undefined;
    let nearestDistance = radius;
    for (const bone of this.bones) {
      // 보이는 자리를 그대로 집는다. 그려진 곳과 잡히는 곳이 어긋나면 안 된다.
      const at = this.positionOf(bone);
      const distance = Phaser.Math.Distance.Between(world.x, world.y, at.x, at.y);
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
  /**
   * 영향 영역 표시를 갈아 끼운다.
   *
   * `width` · `height`는 이 표시가 그림 위에 덮여야 할 크기다. 표시용 캔버스는
   * 그보다 작게 구워 오므로(큰 그림에서도 칠하는 동안 다시 그릴 수 있게 하려는 것) 여기서 늘린다.
   */
  setWeightOverlay(canvas: HTMLCanvasElement | null, width = 0, height = 0): void {
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
    if (width > 0 && height > 0) this.weightOverlay.setDisplaySize(width, height);
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

  /**
   * 재생 중인 자세를 알려 준다. null이면 기준 자세로 되돌린다.
   * 관절점 · 연결선 · 집기 판정이 모두 이 위치를 따른다.
   */
  setPosedBones(posed: ReadonlyMap<string, { x: number; y: number }> | null): void {
    this.posed = posed;
    this.redrawOverlay();
  }

  /** 지금 화면에 그려지는 관절 위치. 재생 중이면 그 자세, 아니면 기준 자세다. */
  private positionOf(bone: PuppetBone): { x: number; y: number } {
    return this.posed?.get(bone.id) ?? { x: bone.x, y: bone.y };
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

      const from = this.positionOf(parent);
      const to = this.positionOf(bone);
      overlay.lineStyle(3 / zoom, 0x000000, 0.45);
      overlay.lineBetween(from.x, from.y, to.x, to.y);
      overlay.lineStyle(1.5 / zoom, hexToNumber(bone.color), 0.9);
      overlay.lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  private drawBonePoints(overlay: Phaser.GameObjects.Graphics, zoom: number): void {
    const radius = BONE_RADIUS / zoom;
    for (const bone of this.bones) {
      const selected = bone.id === this.selectedBoneId;
      const color = hexToNumber(bone.color);
      const { x, y } = this.positionOf(bone);

      overlay.fillStyle(0x000000, 0.6);
      overlay.fillCircle(x, y, radius + 1.5 / zoom);

      overlay.fillStyle(color, selected ? 1 : 0.85);
      overlay.fillCircle(x, y, radius);

      if (selected) {
        // 선택된 관절만 가운데 점으로 한 번 더 구분한다.
        overlay.fillStyle(0x111113, 1);
        overlay.fillCircle(x, y, radius * 0.34);

        // 바깥 링은 회전 손잡이다. 안쪽 점은 이동, 링은 회전.
        const ring = ROTATE_RADIUS / zoom;
        overlay.lineStyle(1.5 / zoom, 0x000000, 0.5);
        overlay.strokeCircle(x, y, ring);
        overlay.lineStyle(1 / zoom, 0xffffff, this.canPose ? 0.85 : 0.35);
        overlay.strokeCircle(x, y, ring);
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
