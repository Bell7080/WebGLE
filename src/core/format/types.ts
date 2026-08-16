/**
 * PuppetForge 데이터 포맷 정의.
 *
 * 이 파일은 엔진 독립적인 단일 소스(Puppet JSON)의 타입만 담는다.
 * UI, 렌더러, Phaser에 의존하는 코드를 여기에 넣지 않는다.
 */

export const PUPPET_FORMAT = "puppetforge" as const;
/**
 * 3: Bone 변형 방식을 움직임/찌그러짐 조합 4가지로 확장했다.
 * 4: 애니메이션에 hidden 추가. 파일에는 남기되 내보내기에서만 뺀다.
 * 5: 애니메이션에 speed / strength 추가. 없으면 둘 다 1로 본다.
 * 6: 애니메이션에 secondary(따라 흔들림) 추가. 없으면 1로 본다.
 * 7: Track에 stagger(대상별 시간 어긋냄) 추가. 없으면 0으로 본다.
 * 8: Track에 focus / focusOther(동작의 주인공 고르기) 추가. 없으면 전부 똑같이 움직인다.
 * 9: 애니메이션에 deform(관절별 변형 방식 덮어쓰기) 추가. 없으면 Bone의 값을 그대로 쓴다.
 * 10: Mesh의 격자(vertices · indices)를 파일에 적지 않는다. 읽을 때 이미지 크기로 다시 만든다.
 *     칠하지 않은 정점의 가중치는 null로 적는다. 이전 파일은 격자가 있으면 그대로 쓴다.
 * 11: 내보내기에 _readme 한 줄을 붙인다. 읽는 쪽은 무시한다.
 * 12: Bone에 autoWeight 추가. 없으면 false로 본다 — 예전 파일은 전부 손으로 칠한 것이므로
 *     자동 계산이 그 작업을 덮어쓰면 안 된다.
 * 13: character에 facing 추가. 없으면 "right"로 본다.
 * 14: facing을 애니메이션별 mirror로 옮겼다. 캐릭터 전체가 아니라 동작 하나씩 뒤집는다.
 *     v13의 facing:"left"는 읽을 때 모든 애니메이션의 mirror로 옮겨 담는다.
 */
export const PUPPET_VERSION = 14 as const;

/**
 * Bone의 변형 방식. (기획서 19 확장)
 *
 * - soft: 가중치를 섞어 찌그러뜨리고 애니메이션 변환도 적용한다.
 * - rigid: 한 Bone의 변환만 적용해 형태를 유지하며 움직인다.
 * - pinnedSoft: 기준 위치는 고정하되 이웃 Bone과의 경계는 부드럽게 휜다.
 * - fixed: 기준 위치와 형태를 모두 고정한다.
 */
export type DeformMode = "soft" | "rigid" | "pinnedSoft" | "fixed";

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

  /**
   * 영향 영역을 자동으로 맡길지. 새 관절은 켜져 있고, 한 번이라도 직접 칠하면 꺼진다.
   *
   * 켜져 있는 동안에는 관절을 옮기거나 더할 때마다 이 관절의 영향 영역이 다시 계산된다.
   * 꺼져 있으면 손으로 칠한 값을 그대로 지킨다. 없으면 꺼진 것으로 본다.
   */
  autoWeight?: boolean;

  /**
   * 편집 화면에서 이 관절을 알아보기 위한 색. `#rrggbb`.
   * 관절점 · 연결선 · 영향 영역 표시가 모두 이 색을 따른다.
   */
  color: string;
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

  /**
   * 대상이 여러 개일 때 시간을 얼마나 벌려서 적용할지. 주기 대비 비율이며 없으면 0(모두 동시).
   *
   * n개의 대상 중 i번째는 `time + duration * stagger * i / n` 시각의 값을 쓴다.
   * 1이면 대상들이 한 주기에 고르게 퍼진다.
   * - 다리 2개 → 반 주기씩 어긋나 좌우가 번갈아 나간다
   * - 지네 다리 20개 → 앞에서 뒤로 흐르는 파도가 된다
   *
   * 순서는 관절 목록 순서다. 좌측 패널에서 끌어 정리하면 파도 방향이 바뀐다.
   */
  stagger?: number;

  /**
   * 이 동작의 주인공을 고르는 태그. 없으면 대상 전부가 똑같이 움직인다.
   *
   * 대상 중 **자기 자신이나 후손이** 이 태그를 가진 쪽만 값을 그대로 받고,
   * 나머지는 `focusOther` 배만 받아 거드는 정도로 움직인다.
   * 팔이 여섯인데 하나만 검을 쥐었다면 그 팔만 크게 휘두르게 하려는 것이다.
   *
   * 대상 중 아무도 해당하지 않으면 아무도 주인공이 아닌 것으로 보고 전부 그대로 움직인다.
   * 무기가 없는 캐릭터가 맨손 공격을 못 하게 되면 안 되기 때문이다. (기획서 64)
   */
  focus?: string;

  /** 주인공이 아닌 대상이 받을 비율. 없으면 0.3이다. 0이면 아예 멈춘다. */
  focusOther?: number;
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
  /**
   * 숨김. 프로젝트 파일에는 그대로 남지만 내보내기 결과에서는 빠진다.
   * 지우기 아까운 시안을 들고 다니되 게임에는 넘기지 않을 때 쓴다.
   */
  hidden?: boolean;

  /**
   * 재생 속도 배율. 1이 원래 속도, 0.5면 두 배 느리게. 없으면 1. (기획서 31)
   * 같은 프리셋으로 굼뜬 골렘과 잽싼 거미를 다르게 만들 때 쓴다.
   */
  speed?: number;

  /**
   * 움직임 크기 배율. 1이 원래 크기, 0이면 아예 움직이지 않는다. 없으면 1.
   * Bone마다의 `motionStrength`와 곱해진다.
   */
  strength?: number;

  /**
   * 따라 흔들림(Secondary Motion) 세기. 0이면 끄고, 1이 기본. 없으면 1. (기획서 29, 31)
   * `secondary` 태그가 붙은 관절이 몸을 한 박자 늦게 따라 흔들리는 정도다.
   */
  secondary?: number;

  /**
   * 이 애니메이션에서만 다르게 쓸 관절별 변형 방식. 키는 Bone의 id다.
   *
   * Bone의 `deform`은 모든 애니메이션이 함께 쓰는 값이고, 여기 적힌 관절만 그 값을 덮어쓴다.
   * 없는 관절은 Bone의 값을 그대로 따른다.
   *
   * 대기에서만 발을 바닥에 묶어 두고 공격에서는 발을 떼게 하려는 것이다.
   */
  deform?: Record<string, DeformMode>;

  /**
   * 이 동작의 좌우를 뒤집을지. 없으면 뒤집지 않는다.
   *
   * 가로 이동(`x`)과 회전의 부호만 바뀐다. 그림도 관절 자리도 그대로다.
   *
   * 캐릭터 전체가 아니라 **동작 하나씩** 정한다. 오른쪽을 보고 걷다가 왼쪽으로 후려치는
   * 캐릭터가 있고, 같은 프리셋을 두 벌 담아 좌우 한 쌍으로 쓰는 경우도 있기 때문이다.
   * 그림 자체를 뒤집고 싶다면 이것이 아니라 설정의 `좌우 뒤집기`를 쓴다 —
   * 그쪽은 관절과 칠한 영역까지 실제로 옮긴다.
   */
  mirror?: boolean;
}

export interface PuppetCharacter {
  name: string;
  /** 프로젝트 내 텍스처 파일명. */
  texture: string;
  width: number;
  height: number;
  /** 도트 모드 여부. (기획서 51) */
  pixelArt: boolean;

  /**
   * @deprecated v13에서만 쓰였다. 읽을 때 각 애니메이션의 `mirror`로 옮겨 담고 버린다.
   * 새로 적지 않는다.
   */
  facing?: "right" | "left";
}

/** 저장/내보내기의 단일 소스. (기획서 7) */
export interface PuppetProject {
  format: typeof PUPPET_FORMAT;
  version: number;

  /**
   * 이 파일이 무엇이고 어떻게 재생하는지 한 줄로 적어 둔다. 내보내기에서만 붙는다.
   *
   * 파일만 열어 본 사람이나 AI가 곧바로 알아보고 쓸 수 있게 하려는 것이다.
   * 읽는 쪽은 이 값을 무시한다. 지워도 동작에는 영향이 없다.
   */
  _readme?: string;
  character: PuppetCharacter;
  bones: PuppetBone[];
  mesh: PuppetMesh | null;
  animations: Record<string, PuppetAnimation>;
}
