/**
 * 한 획으로 칠하기. (기획서 16)
 *
 * 예전에는 포인터가 움직일 때마다 그 자리에 원을 하나씩 얹었다. 두 가지가 어긋났다.
 *
 * 하나, **빠르게 그으면 원 사이가 벌어져** 점선처럼 끊겼다. 브라우저가 포인터 위치를
 * 알려 주는 간격은 손이 움직이는 속도와 상관없이 일정하기 때문이다.
 *
 * 둘, 한 획 안에서도 이미 지나간 곳을 다시 문지르면 수채화처럼 여러 겹이 쌓여야 한다.
 * 그래서 각 포인터 구간의 농도를 누적한다. 같은 자리를 왕복하면 교차한 횟수만큼 진해지되,
 * 진행 중 결과는 언제나 획 시작값에 누적 농도를 더해 계산해 렌더 프레임 때문에 중복되지 않는다.
 */
import type { PuppetMesh } from "../format/types";
import { vertexCount } from "../mesh";
import { influenceAt, type Influence, type WeightMap } from "./index";

/** 획 하나가 진행되는 동안의 상태. 손을 떼면 버린다. */
export interface Stroke {
  boneId: string;
  /** 획을 시작할 때의 값. 여기에 획의 결과를 얹는다. */
  base: number[];
  /** 획의 각 이동 구간이 남긴 누적 농도. 같은 자리를 다시 훑으면 한 겹 더 쌓인다. */
  coverage: number[];
  /** 직전에 지나온 자리. 다음 점까지를 선분으로 이어 칠한다. */
  lastX: number | null;
  lastY: number | null;
}

/** 획을 시작한다. 지금 값을 기준으로 잡아 둔다. */
export function beginStroke(map: WeightMap, boneId: string, mesh: PuppetMesh): Stroke {
  const count = vertexCount(mesh);
  const existing = map[boneId] ?? [];
  const base = new Array<number>(count);
  for (let i = 0; i < count; i += 1) base[i] = existing[i] ?? 0;

  return { boneId, base, coverage: new Array<number>(count).fill(0), lastX: null, lastY: null };
}

/**
 * 획을 한 점 더 끌고 간다.
 *
 * 직전 점과 이 점을 잇는 **선분**으로 칠한다. 점을 찍는 대신 선을 그으므로,
 * 손을 아무리 빨리 움직여도 사이가 벌어지지 않는다.
 * 첫 점은 이을 곳이 없으므로 그 자리에 원 하나로 시작한다.
 */
export function extendStroke(
  stroke: Stroke,
  mesh: PuppetMesh,
  brush: Omit<Influence, "x1" | "y1" | "x2" | "y2">,
  x: number,
  y: number,
  mask?: readonly boolean[] | null,
): void {
  const influence: Influence = {
    x1: stroke.lastX ?? x,
    y1: stroke.lastY ?? y,
    x2: x,
    y2: y,
    ...brush,
  };

  const count = stroke.coverage.length;
  for (let i = 0; i < count; i += 1) {
    if (mask && !mask[i]) continue;
    const value = influenceAt(influence, mesh.vertices[i * 2] ?? 0, mesh.vertices[i * 2 + 1] ?? 0);
    // 포인터 이동 구간 하나를 한 겹으로 본다. 왕복하거나 교차한 부분은 한 획 안에서도 누적한다.
    stroke.coverage[i] = Math.min(1, (stroke.coverage[i] ?? 0) + value);
  }

  stroke.lastX = x;
  stroke.lastY = y;
}

/**
 * 지금까지의 획을 값에 반영한 결과.
 *
 * 획이 진행되는 내내 이걸 다시 불러도 된다 — 언제나 "시작값 + 획 한 겹"이라
 * 중간 결과가 쌓이지 않는다. 그래서 그리는 동안 화면이 실제 결과와 어긋나지 않는다.
 */
export function applyStroke(map: WeightMap, stroke: Stroke, erase = false): WeightMap {
  const count = stroke.coverage.length;
  const channel = new Array<number>(count);

  for (let i = 0; i < count; i += 1) {
    const base = stroke.base[i] ?? 0;
    const laid = stroke.coverage[i] ?? 0;
    channel[i] = erase ? Math.max(0, base - laid) : Math.min(1, base + laid);
  }

  return { ...map, [stroke.boneId]: channel };
}
