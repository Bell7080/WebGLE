/**
 * PuppetForge 데이터 포맷 정의.
 *
 * 이 파일은 엔진 독립적인 단일 소스(Puppet JSON)의 타입만 담는다.
 * UI, 렌더러, Phaser에 의존하는 코드를 여기에 넣지 않는다.
 */

export const PUPPET_FORMAT = "puppetforge" as const;
export const PUPPET_VERSION = 1 as const;

/** Bone의 변형 방식. (기획서 19) */
export type DeformMode = "soft" | "rigid";

/** 관절 하나. 스켈레톤 타입 개념은 존재하지 않는다. (기획서 1.1, 8) */
export interface PuppetBone {
  id: string;
  name: string;

  /** 루트 Bone이면 null. */
  parentId: string | null;

  /** 텍스처 좌표계 기준 위치(px). */
  x: number;
  y: number;

  /** 라디안. */
  rotation: number;

  scaleX: number;
  scaleY: number;

  /** 범용 애니메이션이 참조하는 태그 목록. (기획서 11, 12) */
  tags: string[];

  /** 애니메이션 움직임 크기에 곱해지는 배율. (기획서 28) */
  motionStrength: number;

  deform: DeformMode;
}

/** Mesh 해상도 프리셋. (기획서 15) */
export type MeshResolution = "low" | "normal" | "high";

/** 격자 Mesh. 정점/인덱스는 Mesh 단계에서 채운다. */
export interface PuppetMesh {
  resolution: MeshResolution;
  /** 가로/세로 셀 개수. */
  cols: number;
  rows: number;
  /** [x0, y0, x1, y1, ...] 텍스처 좌표계 기준. */
  vertices: number[];
  /** 삼각형 인덱스. */
  indices: number[];
  /**
   * 정점별 Bone 가중치. 정점 순서와 1:1 대응한다.
   * 각 항목의 weight 합은 1로 정규화된다. (기획서 17)
   */
  weights: VertexWeight[];
}

export interface VertexWeight {
  boneIds: string[];
  weights: number[];
}

/** 애니메이션 Track의 대상 지정 방식. (기획서 20) */
export type TrackTarget =
  | { kind: "bone"; boneId: string }
  | { kind: "tag"; tag: string };

export type TrackProperty =
  | "x"
  | "y"
  | "rotation"
  | "scaleX"
  | "scaleY";

export type Interpolation = "linear" | "step" | "smooth";

export interface Keyframe {
  time: number;
  value: number;
  ease?: Interpolation;
}

export interface AnimationTrack {
  target: TrackTarget;
  property: TrackProperty;
  keys: Keyframe[];
}

/** 게임 이벤트. (기획서 42) */
export interface AnimationEvent {
  time: number;
  event: string;
}

export interface PuppetAnimation {
  name: string;
  duration: number;
  loop: boolean;
  tracks: AnimationTrack[];
  events?: AnimationEvent[];
}

export interface PuppetCharacter {
  name: string;
  /** 프로젝트 내 텍스처 파일명. */
  texture: string;
  width: number;
  height: number;
  /** 도트 모드 여부. (기획서 51) */
  pixelArt: boolean;
}

/** 저장/내보내기의 단일 소스. (기획서 7) */
export interface PuppetProject {
  format: typeof PUPPET_FORMAT;
  version: number;
  character: PuppetCharacter;
  bones: PuppetBone[];
  mesh: PuppetMesh | null;
  animations: Record<string, PuppetAnimation>;
}
