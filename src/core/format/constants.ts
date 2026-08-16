import type { MeshResolution } from "./types";

/** GUI에서 고를 수 있는 기본 파츠 이름. (기획서 9) */
export const PART_NAMES = [
  "중심",
  "몸통",
  "머리",
  "목",
  "팔",
  "손",
  "다리",
  "발",
  // 늘어져서 뒤늦게 따라오는 것들. 전부 secondary 태그가 기본으로 붙는다.
  "머리카락",
  "갈기",
  "수염",
  "꼬리",
  "촉수",
  "망토",
  "옷자락",
  "지느러미",
  "더듬이",
  "리본",
  // 나머지 부속
  "날개",
  "귀",
  "뿔",
  "눈",
  "입",
  "턱",
  "집게",
  "독침",
  "무기",
  "방패",
  "장식",
  "기타",
  "자유",
] as const;

export type PartName = (typeof PART_NAMES)[number];

/** 태그 묶음. 속성 패널에서 이 순서대로 보여 준다. */
export const TAG_GROUPS = [
  { id: "structure", label: "중심 · 구조" },
  { id: "limb", label: "팔다리" },
  { id: "appendage", label: "부속" },
  { id: "face", label: "얼굴" },
  { id: "role", label: "역할" },
  { id: "motion", label: "움직임 성격" },
  { id: "position", label: "위치 구분" },
] as const;

export type TagGroup = (typeof TAG_GROUPS)[number]["id"];

/**
 * 태그가 실제로 하는 일.
 *
 * - track: 프리셋이 이 태그를 찾아 움직인다. 붙이면 눈에 보이는 변화가 생긴다.
 * - modifier: 움직임의 크기를 {@link TAG_AMPLITUDE}만큼 곱한다. 대상을 고르지는 않는다.
 * - hint: 엔진은 아무것도 하지 않는다. 사람이 알아보기 위한 표시다.
 *
 * 이 구분을 타입으로 둔 이유는 하나다. 예전에는 41개 중 29개가 아무 일도 하지 않았는데,
 * 화면에서는 나머지와 똑같이 생겨서 붙이면 뭔가 될 것처럼 보였다.
 * 이제 `track`으로 적힌 태그는 반드시 어떤 프리셋이 쓰고 있어야 하며, 테스트가 그것을 막는다.
 */
export type TagEffect = "track" | "modifier" | "hint";

export interface TagInfo {
  id: string;
  group: TagGroup;
  effect: TagEffect;
  /** 이 태그를 붙이면 무슨 일이 일어나는지. 버튼 툴팁으로 그대로 보여 준다. */
  description: string;
}

/**
 * 움직임 크기에 곱하는 배율. 태그를 여러 개 붙이면 전부 곱해진다.
 *
 * 대상을 고르는 태그가 아니라 성격을 바꾸는 태그다.
 * `heavy`를 붙였다고 새 동작이 생기지는 않고, 하던 동작이 둔해진다.
 */
export const TAG_AMPLITUDE: Record<string, number> = {
  heavy: 0.55,
  light: 1.6,
  bounce: 1.35,
  stiff: 0.2,
};

/**
 * 기본 태그 목록. (기획서 11)
 *
 * 애니메이션은 오직 태그로 대상을 찾는다. 여기 없는 태그도 직접 적어 넣을 수 있고,
 * 프리셋이 찾는 태그가 캐릭터에 없으면 그 부분만 조용히 건너뛴다. (기획서 64)
 */
export const TAG_CATALOG: readonly TagInfo[] = [
  // 중심 · 구조
  { id: "root", group: "structure", effect: "track", description: "캐릭터 전체의 기준. 대기의 상하 흔들림, 점프의 도약과 착지가 이 관절을 움직인다. 보통 캐릭터당 하나." },
  { id: "core", group: "structure", effect: "track", description: "몸의 중심. 숨쉬기, 찌그러짐(squash), 피격 반동의 기준이 된다." },
  { id: "body", group: "structure", effect: "track", description: "몸통 부위 표시. core가 '중심점 하나'라면 body는 '몸통 덩어리'다. 몸통 전체를 대상으로 하는 동작이 참고한다." },
  { id: "spine", group: "structure", effect: "track", description: "허리 · 등뼈. 포효처럼 몸을 젖히거나 웅크리는 동작에서 중심과 머리 사이를 이어 준다." },
  { id: "hip", group: "structure", effect: "track", description: "골반 · 하체 시작점. 걷기와 착지에서 상체가 실리는 무게 중심이 된다." },
  { id: "neck", group: "structure", effect: "track", description: "목. 머리와 몸통 사이 완충. 머리 회전을 조금 나눠 받는다." },

  // 팔다리
  { id: "arm", group: "limb", effect: "track", description: "팔. 공격 · 대기의 팔 흔들림 대상." },
  { id: "hand", group: "limb", effect: "track", description: "손. 팔이 움직인 뒤 조금 늦게 따라온다. 무기를 쥔 손이라면 weapon도 함께 붙이면 좋다." },
  { id: "leg", group: "limb", effect: "track", description: "다리. 걷기 · 점프에서 접히고 펴진다." },
  { id: "foot", group: "limb", effect: "track", description: "발. 착지 충격을 받는 지점. 바닥에 붙여 두려면 변형을 위치 고정으로." },
  { id: "claw", group: "limb", effect: "track", description: "발톱 · 갈퀴. 할퀴기에서 가장 크게 휘둘리는 끝점. 보통 attack도 같이 붙인다." },
  { id: "finger", group: "limb", effect: "track", description: "손가락. 공격에서 쥐었다 펴는 끝부분. 없어도 대부분의 동작은 문제없다." },

  // 부속
  { id: "tail", group: "appendage", effect: "track", description: "꼬리. 몸을 따라 늦게 출렁인다." },
  { id: "wing", group: "appendage", effect: "track", description: "날개. 퍼덕임과 활공 동작 대상." },
  { id: "tentacle", group: "appendage", effect: "track", description: "촉수. 물속처럼 느리게 흐느적거린다." },
  { id: "hair", group: "appendage", effect: "track", description: "머리카락 · 갈기. 관성으로 흔들린다." },
  { id: "ear", group: "appendage", effect: "track", description: "귀. 작게 쫑긋거리거나 늦게 따라온다." },
  { id: "horn", group: "appendage", effect: "track", description: "뿔. 머리를 따라 단단히 움직인다." },
  { id: "fin", group: "appendage", effect: "track", description: "지느러미. 물결치듯 흔들린다." },
  { id: "cloth", group: "appendage", effect: "track", description: "천 · 망토 · 옷자락. 몸을 늦게 따라오며 펄럭인다." },
  { id: "antenna", group: "appendage", effect: "track", description: "더듬이. 아주 가볍게 떨린다." },

  // 얼굴
  { id: "head", group: "face", effect: "track", description: "머리. 대기에서 갸웃거리고 피격에서 뒤로 젖혀진다. 여러 개여도 전부 움직인다." },
  { id: "eye", group: "face", effect: "track", description: "눈. 대기에서 한 번씩 깜빡이고 피격에서 찡그린다. 눈만 따로 움직이고 싶을 때 붙인다." },
  { id: "mouth", group: "face", effect: "track", description: "입 · 턱. 물기와 포효 동작이 연다." },
  { id: "jaw", group: "face", effect: "track", description: "아래턱. 포효와 물기에서 벌어지는 쪽이다. 턱이 따로 없는 캐릭터면 붙이지 않아도 된다." },

  // 역할
  { id: "attack", group: "role", effect: "track", description: "공격에 쓰이는 부위. 찌르기 · 할퀴기 같은 동작이 이 태그를 찾아 앞으로 내민다." },
  { id: "weapon", group: "role", effect: "track", description: "무기 · 도구. 보통 형태를 유지해야 하므로 변형을 형태 유지로 두면 좋다." },
  { id: "shield", group: "role", effect: "track", description: "방패 · 막는 파츠. 공격 중에는 몸 앞으로 세워 둔다." },
  { id: "prop", group: "role", effect: "track", description: "들고 있는 소품. 공격에서 손과 함께 나간다. 찌그러지면 안 되니 변형을 형태 유지로 두면 좋다." },
  { id: "decoration", group: "role", effect: "track", description: "장식. 대기에서 몸을 따라 조금씩 흔들린다. 순서대로 시차를 두고 움직인다." },
  { id: "ground", group: "role", effect: "hint", description: "바닥에 닿아 있는 부분. 이 태그 자체는 아무 움직임도 만들지 않는 표시다 — 발을 붙여 두려면 변형을 위치 고정으로 바꿔야 한다." },

  // 움직임 성격
  { id: "secondary", group: "motion", effect: "track", description: "따라 움직이는 부위. 부모보다 한 박자 늦게, 관성으로 흔들린다." },
  { id: "float", group: "motion", effect: "track", description: "떠 있는 느낌. 유령이나 부유 몬스터처럼 천천히 위아래로 흔들리게 할 때." },
  { id: "heavy", group: "motion", effect: "modifier", description: "무겁게. 이 관절이 받는 모든 움직임이 0.55배로 줄어든다. 대상을 고르는 태그가 아니라 성격을 바꾸는 태그다." },
  { id: "light", group: "motion", effect: "modifier", description: "가볍게. 이 관절이 받는 모든 움직임이 1.6배로 커진다. 머리카락 · 옷자락처럼 살랑거려야 하는 곳에." },
  { id: "bounce", group: "motion", effect: "modifier", description: "탄력 있게. 이 관절이 받는 모든 움직임이 1.35배로 커진다. 슬라임처럼 통통 튀어야 하는 곳에." },
  { id: "stiff", group: "motion", effect: "modifier", description: "뻣뻣하게. 이 관절이 받는 모든 움직임이 0.2배로 줄어든다. 뿔 · 갑옷처럼 거의 흔들리면 안 되는 곳에." },

  // 위치 구분 (좌우를 강제하지 않는다 — 기획서 10)
  { id: "front", group: "position", effect: "track", description: "앞쪽. 이동에서 앞다리 쪽이 먼저 나간다. 다리가 여러 쌍일 때 back과 짝지어 쓴다." },
  { id: "back", group: "position", effect: "track", description: "뒤쪽. 이동에서 front와 반대로 젓는다. 앞뒤가 엇갈려 걸음이 자연스러워진다." },
  { id: "upper", group: "position", effect: "track", description: "위쪽. 공격에서 위쪽 팔이 크게 휘두른다. 무기를 쥔 쪽이 있으면 그쪽만 더 크게 움직인다." },
  { id: "lower", group: "position", effect: "track", description: "아래쪽. 공격에서 위쪽보다 작게 거든다. upper와 짝지어 쓴다." },
];

/** 태그 id → 설명. 툴팁에 쓴다. */
export const TAG_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  TAG_CATALOG.map((tag) => [tag.id, tag.description]),
);

/** 기본 태그 id 목록. */
export const DEFAULT_TAGS = TAG_CATALOG.map((tag) => tag.id);

/**
 * 파츠 이름 → 자동으로 붙일 태그 추천값.
 * 사용자가 수정할 수 있으며, 엔진은 태그만 신뢰한다.
 */
export const SUGGESTED_TAGS: Record<string, string[]> = {
  중심: ["root", "core", "body"],
  몸통: ["body", "core"],
  머리: ["head"],
  목: ["neck"],
  팔: ["arm", "attack"],
  손: ["hand"],
  다리: ["leg"],
  발: ["foot", "ground"],

  // 늘어지는 부속 — 몸이 움직이면 한 박자 늦게 따라 흔들린다
  머리카락: ["hair", "secondary", "light"],
  갈기: ["hair", "secondary"],
  수염: ["hair", "secondary", "light"],
  꼬리: ["tail", "secondary"],
  촉수: ["tentacle", "secondary", "attack"],
  망토: ["cloth", "secondary"],
  옷자락: ["cloth", "secondary", "light"],
  지느러미: ["fin", "secondary"],
  더듬이: ["antenna", "secondary", "light"],
  리본: ["cloth", "decoration", "secondary", "light"],

  날개: ["wing", "secondary"],
  귀: ["ear", "secondary"],
  뿔: ["horn", "stiff"],
  눈: ["eye", "head"],
  입: ["mouth", "head"],
  턱: ["jaw", "mouth"],
  집게: ["arm", "weapon", "attack"],
  // 꼬리 끝에 달려 찌르는 부위. 꼬리를 부모로 두면 꼬리째 휘둘러 찌른다.
  // stiff는 붙이지 않는다 — 움직임을 0.2배로 줄이는 태그라, 찌르는 부위에 붙이면
  // 정작 공격 동작이 죽는다. 형태를 지키는 것은 변형(rigid)의 몫이다.
  독침: ["attack", "weapon"],
  무기: ["weapon", "attack"],
  방패: ["shield"],
  장식: ["decoration", "secondary"],
  기타: [],
  // 아무것도 붙지 않은 맨 뼈대. 필요한 태그를 직접 골라 쓰라는 뜻이다.
  자유: [],
};


/**
 * Mesh 해상도별 격자 셀 수. (기획서 15, 49)
 * 영향 영역을 촘촘하게 칠할 수 있도록 기본값을 넉넉히 잡았다.
 */
export const MESH_GRID: Record<MeshResolution, number> = {
  low: 24,
  normal: 48,
  high: 72,
};

/**
 * 캔버스 표시 레이어. (기획서 35의 편집 모드를 표시 토글로 대체)
 * 조작은 좌우 패널과 캔버스 드래그로 모두 되므로, 상단은 "무엇을 보여줄지"만 정한다.
 * 기본은 전부 켜짐이며, 끄면 이미지 위에서 해당 표시가 사라진다.
 */
export const OVERLAY_LAYERS = [
  { id: "bones", label: "관절" },
  { id: "links", label: "연결" },
  { id: "weights", label: "영향 영역" },
  /** 선택한 관절 대신 모든 관절의 영향 영역을 한 번에 본다. 빈 곳도 드러난다. */
  { id: "weightsAll", label: "전체 보기" },
] as const;

export type OverlayLayer = (typeof OVERLAY_LAYERS)[number]["id"];

export type OverlayVisibility = Record<OverlayLayer, boolean>;

export const DEFAULT_OVERLAY_VISIBILITY: OverlayVisibility = {
  bones: true,
  links: true,
  weights: true,
  weightsAll: false,
};

/** 하단 패널에 노출할 기본 애니메이션. (기획서 30) */
export const ANIMATION_BUTTONS = [
  { id: "idle", label: "대기" },
  { id: "walk", label: "이동" },
  { id: "attack", label: "공격" },
  { id: "hit", label: "피격" },
  { id: "death", label: "사망" },
  { id: "jump", label: "점프" },
] as const;

/**
 * 관절 색. 편집 화면에서 관절을 구분하기 위한 것이며, 위계를 뜻하지 않는다.
 * 황금각(137.5°)으로 색상환을 돌아가며 뽑아 서로 최대한 멀어지게 한다.
 */
export function generateBoneColor(index: number): string {
  const hue = (index * 137.508) % 360;
  const saturation = 0.62;
  const lightness = index % 2 === 0 ? 0.62 : 0.72;
  return hslToHex(hue, saturation, lightness);
}

export function hslToHex(h: number, s: number, l: number): string {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = ((h % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const m = l - chroma / 2;

  const [r, g, b] = (
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]
  ) as [number, number, number];

  const toHex = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** `#rrggbb` → 0xrrggbb. 렌더러에 넘길 때 쓴다. */
export function hexToNumber(color: string): number {
  const parsed = Number.parseInt(color.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : 0xffffff;
}

/** 지원 이미지 형식. (기획서 53) */
export const SUPPORTED_IMAGE_TYPES = ["image/png", "image/webp"];
