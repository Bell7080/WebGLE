/**
 * 한 획으로 칠하기. (기획서 16)
 *
 * 예전에는 포인터가 움직일 때마다 그 자리에 원을 하나씩 얹었다. 두 가지가 어긋났다.
 *
 * 하나, **빠르게 그으면 원 사이가 벌어져** 점선처럼 끊겼다. 브라우저가 포인터 위치를
 * 알려 주는 간격은 손이 움직이는 속도와 상관없이 일정하기 때문이다.
 *
 * 둘, **천천히 그으면 같은 자리에 여러 번 쌓여** 그 부분만 진해졌다. 그림 앱에서
 * 한 획은 속도와 무관하게 고른 한 겹이고, 더 진하게 하고 싶으면 획을 다시 긋는다.
 *
 * 그래서 획을 "한 번의 덧칠"로 다룬다. 획이 지나간 자리의 **가장 진했던 값**만 모아 두었다가
 * 시작할 때의 값 위에 한 번 얹는다. 지나간 자리를 두 번 훑어도 더 진해지지 않고,
 * 손을 뗐다가 다시 그으면 그때 한 겹이 더 쌓인다.
 */
import type { PuppetMesh } from "../format/types";
import { vertexCount } from "../mesh";
import { influenceAt, type Influence, type WeightMap } from "./index";

/** 획 하나가 진행되는 동안의 상태. 손을 떼면 버린다. */
export interface Stroke {
  boneId: string;
  /** 획을 시작할 때의 값. 여기에 획의 결과를 얹는다. */
  base: number[];
  /** 획이 지나가며 남긴 가장 진한 값. 같은 자리를 다시 훑어도 더 진해지지 않는다. */
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
    if (value > (stroke.coverage[i] ?? 0)) stroke.coverage[i] = value;
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
