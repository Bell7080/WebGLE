/**
 * 스프라이트 시트 굽기 중 그림을 그리지 않는 부분. (기획서 47)
 * 실제 픽셀은 브라우저에서 확인하고, 여기서는 프레임 시각과 격자 계산만 지킨다.
 */
import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../src/core/format";
import { createGridMesh } from "../src/core/mesh";
import type { PuppetAnimation, PuppetProject } from "../src/core/format";
import {
  exportableAnimations,
  frameTimes,
  sheetBlockReason,
  sheetLayout,
  sheetManifest,
} from "../src/editor/tools/spriteSheet";

function animation(name: string, duration: number, loop: boolean, hidden = false): PuppetAnimation {
  return { name, duration, loop, tracks: [], ...(hidden ? { hidden } : {}) };
}

function project(): PuppetProject {
  const base = createEmptyProject();
  return {
    ...base,
    character: { ...base.character, width: 100, height: 100 },
    mesh: createGridMesh(100, 100, "low"),
    bones: [{
      id: "a", name: "중심", parentId: null, x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1,
      tags: ["root"], motionStrength: 1, deform: "soft", color: "#ffffff",
    }],
    animations: {
      idle: animation("idle", 1.6, true),
      attack: animation("attack", 0.9, false),
      시안: animation("시안", 1, false, true),
    },
  };
}

describe("프레임 시각", () => {
  it("반복은 끝 시각을 넣지 않는다 — 첫 프레임과 겹치기 때문이다", () => {
    const times = frameTimes(animation("idle", 1, true), 10);
    expect(times).toHaveLength(10);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBeCloseTo(0.9);
  });

  it("한 번짜리는 끝 시각까지 넣는다", () => {
    const times = frameTimes(animation("attack", 1, false), 5);
    expect(times).toHaveLength(5);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(1);
  });

  it("아주 짧아도 프레임이 하나는 나온다", () => {
    expect(frameTimes(animation("x", 0.01, false), 1)).toEqual([0]);
  });
});

describe("시트 격자", () => {
  it("되도록 정사각형에 가깝게 놓는다", () => {
    expect(sheetLayout(16, 100)).toEqual({ columns: 4, rows: 4 });
    expect(sheetLayout(10, 100)).toEqual({ columns: 4, rows: 3 });
    expect(sheetLayout(1, 100)).toEqual({ columns: 1, rows: 1 });
  });

  it("칸이 크면 폭 한계를 넘지 않게 줄인다", () => {
    const { columns } = sheetLayout(64, 2000);
    expect(columns).toBe(2);
    expect(columns * 2000).toBeLessThanOrEqual(4096);
  });
});

describe("무엇을 굽는가", () => {
  it("숨긴 것만 빠지고 나머지는 전부 나온다", () => {
    const names = exportableAnimations(project()).map(([name]) => name);
    expect(names).toEqual(["idle", "attack"]);
  });

  it("굽지 못하는 이유를 그때그때 알려 준다", () => {
    expect(sheetBlockReason(project())).toBeNull();
    expect(sheetBlockReason({ ...project(), mesh: null })).toContain("이미지");
    expect(sheetBlockReason({ ...project(), bones: [] })).toContain("관절");
    expect(sheetBlockReason({ ...project(), animations: {} })).toContain("애니메이션");
  });
});

describe("설명 파일", () => {
  it("자르는 데 필요한 값이 전부 들어 있다", () => {
    const sheet = {
      name: "idle", blob: new Blob(), frames: 32, frameWidth: 120, frameHeight: 140,
      columns: 6, rows: 6, fps: 20, duration: 1.6, loop: true, originX: -10, originY: -20,
    };
    const manifest = JSON.parse(sheetManifest(project(), [sheet]));

    expect(manifest.sheets[0]).toMatchObject({
      file: "idle.png", frames: 32, frameWidth: 120, frameHeight: 140,
      columns: 6, rows: 6, fps: 20, loop: true,
    });
    expect(manifest._readme).toContain("PuppetForge");
  });
});
