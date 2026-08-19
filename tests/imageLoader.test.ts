import { describe, expect, it } from "vitest";
import { isWebPSmaller, pixelsAreIdentical } from "../src/editor/tools/imageLoader";

describe("PNG → WebP 용량 적용 기준", () => {
  // 같은 크기는 저장 이득이 없으므로 PNG를 유지해야 한다.
  it("같거나 큰 WebP를 거부한다", () => {
    expect(isWebPSmaller(1000, 1000)).toBe(false);
    expect(isWebPSmaller(1000, 1001)).toBe(false);
  });

  // 단 1바이트라도 작으면 사용자의 명시적인 최적화 요청을 따른다.
  it("원본보다 작은 WebP만 적용한다", () => {
    expect(isWebPSmaller(1000, 999)).toBe(true);
  });
});

describe("PNG → WebP 화질 보호", () => {
  // 크기뿐 아니라 투명도를 포함한 RGBA 값이 모두 같아야 무손실로 판단한다.
  it("한 채널의 1단계 차이도 화질 변경으로 거부한다", () => {
    const original = new Uint8ClampedArray([20, 40, 60, 255]);
    expect(pixelsAreIdentical(original, new Uint8ClampedArray([20, 40, 60, 255]))).toBe(true);
    expect(pixelsAreIdentical(original, new Uint8ClampedArray([20, 40, 59, 255]))).toBe(false);
  });

  // 픽셀 수가 달라진 잘못된 디코드 결과도 비교 전에 바로 거부한다.
  it("RGBA 버퍼 길이가 다르면 거부한다", () => {
    expect(pixelsAreIdentical(new Uint8ClampedArray(4), new Uint8ClampedArray(8))).toBe(false);
  });
});
