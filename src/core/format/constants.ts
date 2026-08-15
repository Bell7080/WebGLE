import type { MeshResolution } from "./types";

/** GUI에서 고를 수 있는 기본 파츠 이름. (기획서 9) */
export const PART_NAMES = [
  "머리",
  "중심머리",
  "몸통",
  "팔",
  "다리",
  "손",
  "발",
  "꼬리",
  "날개",
  "목",
  "뿔",
  "귀",
  "눈",
  "입",
  "촉수",
  "집게",
  "무기",
  "장식",
  "기타",
] as const;

export type PartName = (typeof PART_NAMES)[number];

/** 기본 태그. 사용자가 자유롭게 추가할 수 있다. (기획서 11) */
export const DEFAULT_TAGS = [
  "root",
  "body",
  "core",
  "head",
  "neck",
  "arm",
  "hand",
  "leg",
  "foot",
  "tail",
  "wing",
  "weapon",
  "attack",
  "secondary",
] as const;

/**
 * 파츠 이름 → 자동으로 붙일 태그 추천값.
 * 사용자가 수정할 수 있으며, 엔진은 태그만 신뢰한다.
 */
export const SUGGESTED_TAGS: Record<string, string[]> = {
  머리: ["head"],
  중심머리: ["head", "core"],
  몸통: ["body", "core"],
  팔: ["arm", "attack"],
  다리: ["leg"],
  손: ["hand"],
  발: ["foot"],
  꼬리: ["tail", "secondary"],
  날개: ["wing", "secondary"],
  목: ["neck"],
  뿔: ["head"],
  귀: ["head", "secondary"],
  눈: ["head"],
  입: ["head"],
  촉수: ["secondary", "attack"],
  집게: ["arm", "weapon", "attack"],
  무기: ["weapon", "attack"],
  장식: ["secondary"],
  기타: [],
};

/** Mesh 해상도별 격자 셀 수. (기획서 15, 49) */
export const MESH_GRID: Record<MeshResolution, number> = {
  low: 16,
  normal: 32,
  high: 64,
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
] as const;

export type OverlayLayer = (typeof OVERLAY_LAYERS)[number]["id"];

export type OverlayVisibility = Record<OverlayLayer, boolean>;

export const DEFAULT_OVERLAY_VISIBILITY: OverlayVisibility = {
  bones: true,
  links: true,
  weights: true,
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

/** 지원 이미지 형식. (기획서 53) */
export const SUPPORTED_IMAGE_TYPES = ["image/png", "image/webp"];
