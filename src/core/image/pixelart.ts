/**
 * 도트 그림인지 자동으로 알아본다. (기획서 51)
 *
 * 사용자에게 "도트 모드"를 물어보는 대신 이미지를 보고 정한다. (기획서 73 — 자동값 우선)
 * DOM에 의존하지 않도록 RGBA 배열만 받는다.
 */

export interface PixelArtStats {
  /** 반투명(안티앨리어싱) 픽셀 비율. 도트 그림은 거의 0이다. */
  softEdgeRatio: number;
  /** 5비트로 줄여 센 색 가짓수. 도트 그림은 팔레트가 좁다. */
  uniqueColors: number;
  /**
   * 몇 픽셀 안 쓰이는 색의 비율.
   * 안티앨리어싱이 있으면 경계마다 어중간한 색이 잔뜩 생겨 이 값이 커진다.
   * 도트 그림은 팔레트의 모든 색을 넓게 쓰므로 0에 가깝다.
   */
  rareColorRatio: number;
  /**
   * 같은 색으로 채워진 정사각 블록의 한 변. 1이면 블록이 없다.
   * 도트 그림을 확대해 저장한 경우 2 이상이 나온다.
   */
  blockSize: number;
  opaquePixels: number;
}

/** 반투명으로 볼 알파 범위. */
const SOFT_MIN = 8;
const SOFT_MAX = 247;
/** 블록으로 인정할 최대 한 변. */
const MAX_BLOCK = 8;
/** 블록 검사에 쓸 최대 표본 수. 큰 이미지에서도 빨리 끝내기 위한 상한. */
const BLOCK_SAMPLES = 1500;
/** 이 횟수 이하로 쓰인 색을 "드문 색"으로 본다. */
const RARE_USES = 3;
/** 색 세기를 멈출 한계. 이만큼 많으면 어차피 도트가 아니다. */
const COLOR_LIMIT = 20_000;

export function analyzePixels(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): PixelArtStats {
  let soft = 0;
  let opaque = 0;
  const colors = new Set<number>();
  const exact = new Map<number, number>();
  let tooManyColors = false;

  for (let i = 0; i < width * height; i += 1) {
    const alpha = rgba[i * 4 + 3] ?? 0;
    if (alpha < SOFT_MIN) continue;

    opaque += 1;
    if (alpha <= SOFT_MAX) soft += 1;

    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;

    // 5비트로 줄여 센다. 미세한 그라데이션 차이는 무시한다.
    colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));

    // 원래 색 그대로도 세어 둔다. 안티앨리어싱을 찾기 위한 것이다.
    if (!tooManyColors) {
      const key = (r << 16) | (g << 8) | b;
      exact.set(key, (exact.get(key) ?? 0) + 1);
      if (exact.size > COLOR_LIMIT) tooManyColors = true;
    }
  }

  let rare = 0;
  for (const uses of exact.values()) if (uses <= RARE_USES) rare += 1;

  return {
    softEdgeRatio: opaque > 0 ? soft / opaque : 0,
    uniqueColors: colors.size,
    rareColorRatio: tooManyColors ? 1 : exact.size > 0 ? rare / exact.size : 0,
    blockSize: detectBlockSize(rgba, width, height),
    opaquePixels: opaque,
  };
}

/** 이미지 전체가 n×n 블록으로 이뤄져 있는지 큰 n부터 확인한다. */
function detectBlockSize(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): number {
  for (let n = MAX_BLOCK; n >= 2; n -= 1) {
    if (width % n !== 0 || height % n !== 0) continue;
    if (isBlocky(rgba, width, height, n)) return n;
  }
  return 1;
}

function isBlocky(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  n: number,
): boolean {
  const cols = width / n;
  const rows = height / n;
  const total = cols * rows;
  const stride = Math.max(1, Math.floor(total / BLOCK_SAMPLES));

  for (let block = 0; block < total; block += stride) {
    const bx = (block % cols) * n;
    const by = Math.floor(block / cols) * n;
    const base = (by * width + bx) * 4;

    for (let dy = 0; dy < n; dy += 1) {
      for (let dx = 0; dx < n; dx += 1) {
        const index = ((by + dy) * width + bx + dx) * 4;
        if (
          rgba[index] !== rgba[base] ||
          rgba[index + 1] !== rgba[base + 1] ||
          rgba[index + 2] !== rgba[base + 2] ||
          rgba[index + 3] !== rgba[base + 3]
        ) {
          return false;
        }
      }
    }
  }

  return true;
}

export interface PixelArtVerdict {
  pixelArt: boolean;
  /** 왜 그렇게 봤는지. 화면에 그대로 보여 준다. */
  reason: string;
}

/**
 * 도트 그림인지 판정한다.
 *
 * 두 가지 중 하나면 도트로 본다.
 * - 확대해 저장한 흔적(같은 색 블록)이 뚜렷하다
 * - 경계가 칼같이 딱 떨어지고 색 가짓수가 적다
 */
export function judgePixelArt(stats: PixelArtStats): PixelArtVerdict {
  if (stats.opaquePixels === 0) {
    return { pixelArt: false, reason: "그려진 부분이 없습니다" };
  }

  if (stats.blockSize >= 2) {
    return {
      pixelArt: true,
      reason: `${stats.blockSize}배로 확대된 도트 그림으로 보입니다`,
    };
  }

  const hardEdges = stats.softEdgeRatio < 0.04;
  const fewColors = stats.uniqueColors <= 64;
  // 색 경계가 갈려 있는지. 안티앨리어싱된 그림은 어중간한 색이 잔뜩 생긴다.
  const crispColors = stats.rareColorRatio < 0.25;

  if (hardEdges && fewColors && crispColors) {
    return {
      pixelArt: true,
      reason: `경계가 또렷하고 색이 ${stats.uniqueColors}가지뿐입니다`,
    };
  }

  if (!crispColors) {
    return {
      pixelArt: false,
      reason: `색 경계가 부드럽게 섞여 있습니다 (섞인 색 ${Math.round(stats.rareColorRatio * 100)}%)`,
    };
  }

  if (!hardEdges) {
    return {
      pixelArt: false,
      reason: `경계가 부드럽습니다 (반투명 ${Math.round(stats.softEdgeRatio * 100)}%)`,
    };
  }

  return { pixelArt: false, reason: `색이 ${stats.uniqueColors}가지로 많습니다` };
}
