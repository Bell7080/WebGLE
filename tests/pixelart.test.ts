import { describe, expect, it } from "vitest";
import { analyzePixels, judgePixelArt } from "../src/core/image/pixelart";

/** 색 몇 가지로 칠한 도트 스프라이트. blockSize배로 확대해 만든다. */
function dotSprite(width: number, height: number, palette: number, block = 1): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = Math.floor(y / block) * 3 + Math.floor(x / block);
      const shade = (cell % palette) * Math.floor(255 / palette);
      const i = (y * width + x) * 4;
      data[i] = shade;
      data[i + 1] = 40;
      data[i + 2] = 200 - shade;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** 가장자리가 부드럽게 흐려지는 일러스트. */
function softIllustration(size: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  const center = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center);
      const edge = Math.max(0, Math.min(1, (center - distance) / 3));
      const i = (y * size + x) * 4;
      data[i] = (x * 255) / size;
      data[i + 1] = (y * 255) / size;
      data[i + 2] = 128 + ((x + y) % 64);
      data[i + 3] = Math.round(edge * 255);
    }
  }
  return data;
}

describe("도트 그림 판정 (기획서 51)", () => {
  it("확대된 도트 그림을 알아본다", () => {
    const stats = analyzePixels(dotSprite(48, 48, 6, 4), 48, 48);
    expect(stats.blockSize).toBe(4);

    const verdict = judgePixelArt(stats);
    expect(verdict.pixelArt).toBe(true);
    expect(verdict.reason).toContain("4배");
  });

  it("확대하지 않은 도트 그림도 색 수와 또렷한 경계로 알아본다", () => {
    const stats = analyzePixels(dotSprite(32, 32, 8), 32, 32);
    expect(stats.blockSize).toBe(1);
    expect(stats.softEdgeRatio).toBe(0);

    expect(judgePixelArt(stats).pixelArt).toBe(true);
  });

  it("부드러운 일러스트는 도트로 보지 않는다", () => {
    const stats = analyzePixels(softIllustration(64), 64, 64);
    expect(stats.softEdgeRatio).toBeGreaterThan(0.04);
    expect(judgePixelArt(stats).pixelArt).toBe(false);
  });

  it("경계는 또렷해도 색이 많으면 도트로 보지 않는다", () => {
    // 안티앨리어싱은 없지만 색이 촘촘히 변하는 그라데이션 그림.
    const size = 64;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        data[i] = x * 4;
        data[i + 1] = y * 4;
        data[i + 2] = (x + y) * 2;
        data[i + 3] = 255;
      }
    }

    const stats = analyzePixels(data, size, size);
    expect(stats.softEdgeRatio).toBe(0);
    expect(stats.uniqueColors).toBeGreaterThan(64);
    expect(judgePixelArt(stats).pixelArt).toBe(false);
    expect(judgePixelArt(stats).reason).toMatch(/색/);
  });

  it("색 경계가 섞인 그림(안티앨리어싱)은 도트로 보지 않는다", () => {
    // 두 색 사이에 중간색이 한 줄씩 깔린, 흔한 벡터풍 그림.
    const size = 64;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const edge = Math.abs(x - size / 2) <= 1;
        // 경계 한 줄만 두 색을 섞은 값 — 픽셀마다 조금씩 다르다
        data[i] = edge ? 120 + y : x < size / 2 ? 200 : 40;
        data[i + 1] = edge ? 90 + y : 40;
        data[i + 2] = edge ? 60 + y : x < size / 2 ? 40 : 200;
        data[i + 3] = 255;
      }
    }

    const stats = analyzePixels(data, size, size);
    expect(stats.softEdgeRatio).toBe(0);
    expect(stats.rareColorRatio).toBeGreaterThan(0.25);
    expect(judgePixelArt(stats).pixelArt).toBe(false);
    expect(judgePixelArt(stats).reason).toContain("섞");
  });

  it("빈 이미지는 판정하지 않는다", () => {
    const stats = analyzePixels(new Uint8ClampedArray(16 * 16 * 4), 16, 16);
    expect(stats.opaquePixels).toBe(0);
    expect(judgePixelArt(stats).pixelArt).toBe(false);
  });

  it("투명한 픽셀은 색 세기에서 뺀다", () => {
    const data = dotSprite(16, 16, 4);
    for (let i = 0; i < 16 * 4; i += 1) data[i * 4 + 3] = 0;
    const stats = analyzePixels(data, 16, 16);
    expect(stats.opaquePixels).toBe(16 * 16 - 16 * 4);
  });
});
