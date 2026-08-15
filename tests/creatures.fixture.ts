import { createBone as make } from "../src/core/format";
import type { PuppetBone } from "../src/core/format";

type Part = [part: string, x: number, y: number, parentIndex: number | null];

/** 파츠 목록을 관절 트리로 만든다. 첫 항목이 루트(중심)다. */
export function build(parts: Part[]): PuppetBone[] {
  const bones: PuppetBone[] = [];
  for (const [part, x, y, parentIndex] of parts) {
    const parentId = parentIndex === null ? null : bones[parentIndex]!.id;
    bones.push(make(part, x, y, bones, parentId));
  }
  return bones;
}

export const createBone = make;

const 사팔사다리: Part[] = [
  ["중심", 100, 200, null],
  ["몸통", 100, 150, 0],
  ["머리", 100, 90, 1],
  ["팔", 60, 130, 1],
  ["팔", 140, 130, 1],
  ["팔", 55, 165, 1],
  ["팔", 145, 165, 1],
  ["다리", 80, 230, 0],
  ["다리", 120, 230, 0],
  ["다리", 70, 240, 0],
  ["다리", 130, 240, 0],
];

const 뱀: Part[] = [
  ["중심", 100, 200, null],
  ["몸통", 100, 170, 0],
  ["머리", 100, 130, 1],
  ["꼬리", 100, 240, 0],
  ["꼬리", 100, 280, 3],
  ["꼬리", 100, 320, 4],
];

const 유령: Part[] = [
  ["중심", 100, 160, null],
  ["몸통", 100, 130, 0],
  ["머리", 100, 90, 1],
  ["팔", 65, 125, 1],
  ["팔", 135, 125, 1],
  ["옷자락", 85, 220, 0],
  ["옷자락", 115, 220, 0],
];

const 지네: Part[] = [
  ["중심", 100, 200, null],
  ["몸통", 100, 180, 0],
  ["머리", 100, 120, 1],
  ["더듬이", 100, 100, 2],
  ...Array.from({ length: 20 }, (_u, i): Part => {
    const side = i % 2 === 0 ? -30 : 30;
    return ["다리", 100 + side, 140 + Math.floor(i / 2) * 18, 1];
  }),
];

const 전갈: Part[] = [
  ["중심", 100, 220, null],
  ["몸통", 100, 200, 0],
  ["머리", 100, 170, 1],
  ["집게", 60, 165, 1],
  ["집게", 140, 165, 1],
  ["꼬리", 100, 250, 0],
  ["꼬리", 110, 290, 5],
  ["독침", 120, 320, 6],
  ...Array.from({ length: 6 }, (_u, i): Part => {
    const side = i % 2 === 0 ? -35 : 35;
    return ["다리", 100 + side, 215 + Math.floor(i / 2) * 16, 0];
  }),
];

const 도적: Part[] = [
  ["중심", 100, 200, null],
  ["몸통", 100, 150, 0],
  ["머리", 100, 95, 1],
  ["팔", 130, 135, 1],
  ["손", 155, 165, 3],
  ["무기", 180, 190, 4],
  ["망토", 100, 175, 1],
  ["다리", 85, 235, 0],
  ["다리", 115, 235, 0],
];

const 팔척귀신: Part[] = [
  ["중심", 100, 260, null],
  ["몸통", 100, 180, 0],
  ["머리", 100, 90, 1],
  ["머리카락", 100, 70, 2],
  ["팔", 40, 150, 1],
  ["팔", 160, 150, 1],
  ["옷자락", 100, 300, 0],
];

export const CREATURES: Record<string, [PuppetBone[], string[]]> = {
  "팔4·다리4 몬스터": [build(사팔사다리), ["idle", "walk", "attack", "swing"]],
  "뱀 (팔다리 없음)": [build(뱀), ["idle", "walk", "bite", "death"]],
  "유령 (다리 없음)": [build(유령), ["idle", "walk", "cast", "hit"]],
  "지네 (다리 20)": [build(지네), ["idle", "walk", "bite"]],
  "전갈 (꼬리 독침)": [build(전갈), ["idle", "walk", "stab", "attack"]],
  "도적 (단검)": [build(도적), ["idle", "walk", "swing", "stab"]],
  "팔척귀신 (긴 팔)": [build(팔척귀신), ["idle", "swing", "roar"]],
};
