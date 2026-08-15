import { hexToNumber, type PuppetBone, type PuppetMesh } from "@core/format";
import type { WeightMap } from "@core/weight";
import { ALPHA_THRESHOLD, alphaAt, type AlphaMap } from "./alphaMask";

/** 점 사이 간격(이미지 픽셀). 격자 해상도와 무관하게 촘촘하게 깔기 위한 값이다. */
const DOT_STEP = 3;
/** 점 하나의 반지름. 간격보다 살짝 작아 서로 붙지 않는다. */
const DOT_RADIUS = 1.05;
/**
 * 점 개수 상한. 칠하는 동안 매 프레임 다시 구울 수 있어야 하므로 너무 늘리지 않는다.
 * 큰 이미지에서는 간격을 자동으로 벌린다.
 */
const MAX_DOTS = 45_000;

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

/**
 * 영향 영역을 촘촘한 점 패턴으로 구워 낸다. (기획서 74 — Weight가 색/투명도로 보일 것)
 *
 * 점을 Mesh 정점이 아니라 고정 간격으로 찍고 가중치를 보간해서 읽기 때문에,
 * 격자가 성겨도 칠한 영역이 면처럼 보인다.
 * 매 프레임 그리지 않고 가중치가 바뀔 때만 다시 만든다.
 */
export function renderWeightOverlay(input: WeightOverlayInput): HTMLCanvasElement | null {
  const { mesh, bones, weights, selectedBoneId, showAll, alpha } = input;
  const width = alpha?.width ?? 0;
  const height = alpha?.height ?? 0;
  if (!alpha || width === 0 || height === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  // 이미지가 아주 크면 점 간격을 늘려 개수를 억제한다.
  const step = Math.max(DOT_STEP, Math.ceil(Math.sqrt((width * height) / MAX_DOTS)));
  const radius = DOT_RADIUS * (step / DOT_STEP);

  const selected = selectedBoneId ? weights[selectedBoneId] : undefined;
  const colorOf = new Map(bones.map((bone) => [bone.id, bone.color]));

  // 전체 보기에서는 정점마다 "가장 많이 가진 관절"과 "가중치 합"을 미리 구해 둔다.
  const owners = showAll ? dominantPerVertex(weights, mesh) : null;

  for (let y = step / 2; y < height; y += step) {
    for (let x = step / 2; x < width; x += step) {
      if (alphaAt(alpha, Math.round(x), Math.round(y)) < ALPHA_THRESHOLD) continue;

      const cell = locate(mesh, x, y, width, height);

      if (showAll && owners) {
        // 전체 보기: 칠한 곳은 그 관절 색으로 또렷하게, 칠하지 않은 곳은 어둡게 덮는다.
        // 어두운 부분이 곧 "애니메이션에서 움직이지 않는 곳"이다.
        const total = sample(owners.total, mesh, cell);
        if (total > 0.02) {
          const ownerId = owners.ids[nearestVertex(mesh, cell)] ?? null;
          const color = ownerId ? (colorOf.get(ownerId) ?? "#ffffff") : "#ffffff";
          dot(context, x, y, radius * 1.15, color, 0.35 + Math.min(1, total) * 0.6);
        } else {
          dot(context, x, y, radius * 1.15, "#05050a", 0.72);
        }
        continue;
      }

      // 기본: 고른 관절이 가진 영역만 그 색으로 드러내고, 나머지는 옅게 눌러 둔다.
      const value = selected ? sample(selected, mesh, cell) : 0;
      if (value > 0.02) {
        const color = selectedBoneId ? (colorOf.get(selectedBoneId) ?? "#ffffff") : "#ffffff";
        dot(context, x, y, radius * 1.15, color, 0.3 + Math.min(1, value) * 0.65);
      } else {
        dot(context, x, y, radius * 0.8, "#05050a", 0.4);
      }
    }
  }

  return canvas;
}

function dot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
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

/** 네 꼭짓점 값을 이중 선형 보간한다. 점 간격이 격자보다 촘촘해도 부드럽게 이어진다. */
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
