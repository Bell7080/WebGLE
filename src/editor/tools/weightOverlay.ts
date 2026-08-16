import { hexToNumber, type PuppetBone, type PuppetMesh } from "@core/format";
import type { WeightMap } from "@core/weight";
import { ALPHA_THRESHOLD, alphaAt, type AlphaMap } from "./alphaMask";

/**
 * 표시용 캔버스의 긴 변 상한(px).
 *
 * 가중치는 격자(많아야 72칸)에서 보간해 온 부드러운 값이라, 원본 해상도로 칠할 이유가 없다.
 * 여기서 줄여 두면 큰 그림에서도 칠하는 동안 매 프레임 다시 구울 수 있다.
 * 화면에 올릴 때 늘려서 그리므로 오히려 경계가 더 매끄럽다.
 */
const MAX_SIDE = 640;

/** 이 값 아래는 칠하지 않은 것으로 본다. */
const EPSILON = 0.02;

/** 칠한 곳의 불투명도 범위. 가중치가 이 사이로 펼쳐진다. */
const PAINTED_MIN = 0.3;
const PAINTED_MAX = 0.92;

/** 칠하지 않은 곳을 덮는 어둠. 이 대비가 "여기는 안 움직인다"를 말해 준다. */
const BARE_ALPHA = 0.62;

export interface WeightOverlayInput {
  mesh: PuppetMesh;
  bones: readonly PuppetBone[];
  /** 편집 중인 원본 가중치. */
  weights: WeightMap;
  selectedBoneId: string | null;
  /** 모든 관절의 영향 영역을 한 번에 보여줄지. */
  showAll: boolean;
  alpha: AlphaMap | null;
}

/** 이 표시가 그림 위에 얼마나 크게 깔려야 하는지. 캔버스는 이보다 작을 수 있다. */
export interface WeightOverlay {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * 영향 영역을 **채운 면**으로 구워 낸다. (기획서 74 — Weight가 색/투명도로 보일 것)
 *
 * 예전에는 촘촘한 점을 찍었다. 점 사이로 그림이 비쳐서 어디까지 칠했는지 눈으로 재기 어려웠고,
 * 가중치 50과 100의 차이도 점 하나의 진하기라 알아보기 힘들었다.
 * 지금은 픽셀마다 값을 읽어 면으로 덮고, **가중치를 그대로 불투명도**로 쓴다.
 * 옅으면 조금만 따라오고 진하면 통째로 따라온다는 뜻이라, 보이는 대로 움직인다.
 */
export function renderWeightOverlay(input: WeightOverlayInput): WeightOverlay | null {
  const { mesh, bones, weights, selectedBoneId, showAll, alpha } = input;
  const sourceWidth = alpha?.width ?? 0;
  const sourceHeight = alpha?.height ?? 0;
  if (!alpha || sourceWidth === 0 || sourceHeight === 0) return null;

  // 긴 변을 기준으로 줄인다. 원본보다 크게 만들 일은 없다.
  const scale = Math.min(1, MAX_SIDE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(width, height);
  const pixels = image.data;

  const selected = selectedBoneId ? weights[selectedBoneId] : undefined;
  const rgbOf = new Map(bones.map((bone) => [bone.id, toRgb(bone.color)]));
  const selectedRgb = (selectedBoneId ? rgbOf.get(selectedBoneId) : undefined) ?? [255, 255, 255];

  // 전체 보기에서는 정점마다 "가장 많이 가진 관절"과 "가중치 합"을 미리 구해 둔다.
  const owners = showAll ? dominantPerVertex(weights, mesh) : null;

  for (let y = 0; y < height; y += 1) {
    // 원본 좌표로 되돌려 알파와 격자를 읽는다.
    const sourceY = (y + 0.5) / scale;
    for (let x = 0; x < width; x += 1) {
      const sourceX = (x + 0.5) / scale;
      const offset = (y * width + x) * 4;

      // 그림이 없는 곳은 아무것도 덮지 않는다.
      if (alphaAt(alpha, Math.round(sourceX), Math.round(sourceY)) < ALPHA_THRESHOLD) continue;

      const cell = locate(mesh, sourceX, sourceY, sourceWidth, sourceHeight);

      let red = 5;
      let green = 5;
      let blue = 10;
      let opacity = BARE_ALPHA;

      if (showAll && owners) {
        const total = sample(owners.total, mesh, cell);
        if (total > EPSILON) {
          const ownerId = owners.ids[nearestVertex(mesh, cell)] ?? null;
          const rgb = (ownerId ? rgbOf.get(ownerId) : undefined) ?? [255, 255, 255];
          [red, green, blue] = rgb;
          opacity = ramp(total);
        }
      } else {
        const value = selected ? sample(selected, mesh, cell) : 0;
        if (value > EPSILON) {
          [red, green, blue] = selectedRgb;
          opacity = ramp(value);
        }
      }

      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = Math.round(opacity * 255);
    }
  }

  context.putImageData(image, 0, 0);
  return { canvas, width: sourceWidth, height: sourceHeight };
}

/** 가중치 0~1을 불투명도로. 낮은 값도 보이도록 바닥을 두고 위로 펼친다. */
function ramp(value: number): number {
  return PAINTED_MIN + Math.min(1, value) * (PAINTED_MAX - PAINTED_MIN);
}

/** `#rrggbb` → [r, g, b]. */
function toRgb(color: string): [number, number, number] {
  const value = hexToNumber(color);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

interface Cell {
  col: number;
  row: number;
  fx: number;
  fy: number;
}

/** 이미지 좌표가 격자의 어느 칸 어디쯤인지. */
function locate(mesh: PuppetMesh, x: number, y: number, width: number, height: number): Cell {
  const u = (x / (width || 1)) * mesh.cols;
  const v = (y / (height || 1)) * mesh.rows;
  const col = Math.min(mesh.cols - 1, Math.max(0, Math.floor(u)));
  const row = Math.min(mesh.rows - 1, Math.max(0, Math.floor(v)));
  return { col, row, fx: u - col, fy: v - row };
}

/** 네 꼭짓점 값을 이중 선형 보간한다. 격자가 성겨도 면이 부드럽게 이어진다. */
function sample(channel: readonly number[], mesh: PuppetMesh, cell: Cell): number {
  const stride = mesh.cols + 1;
  const topLeft = cell.row * stride + cell.col;
  const a = channel[topLeft] ?? 0;
  const b = channel[topLeft + 1] ?? 0;
  const c = channel[topLeft + stride] ?? 0;
  const d = channel[topLeft + stride + 1] ?? 0;

  const top = a + (b - a) * cell.fx;
  const bottom = c + (d - c) * cell.fx;
  return top + (bottom - top) * cell.fy;
}

function nearestVertex(mesh: PuppetMesh, cell: Cell): number {
  const col = cell.col + (cell.fx > 0.5 ? 1 : 0);
  const row = cell.row + (cell.fy > 0.5 ? 1 : 0);
  return row * (mesh.cols + 1) + col;
}

/** 정점마다 가장 큰 영향을 준 관절과 가중치 합. */
function dominantPerVertex(
  weights: WeightMap,
  mesh: PuppetMesh,
): { ids: (string | null)[]; total: number[] } {
  const count = (mesh.cols + 1) * (mesh.rows + 1);
  const ids = new Array<string | null>(count).fill(null);
  const total = new Array<number>(count).fill(0);
  const best = new Array<number>(count).fill(0);

  for (const [boneId, channel] of Object.entries(weights)) {
    for (let i = 0; i < count; i += 1) {
      const value = channel[i] ?? 0;
      if (value <= 0) continue;
      total[i] = (total[i] ?? 0) + value;
      if (value > (best[i] ?? 0)) {
        best[i] = value;
        ids[i] = boneId;
      }
    }
  }

  return { ids, total };
}

/** 렌더러에 넘길 때 쓰는 색 변환을 여기서도 그대로 쓴다. */
export { hexToNumber };
