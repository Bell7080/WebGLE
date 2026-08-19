import { describe, expect, it } from "vitest";
import { isWebPSmaller, measureWebPQuality } from "../src/editor/tools/imageLoader";

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

describe("WebP 브라우저 표시 품질", () => {
  // 투명 픽셀의 RGB는 화면에 보이지 않으므로 인코더가 정리해도 품질 저하로 세지 않는다.
  it("완전 투명 영역의 숨은 RGB 차이를 무시한다", () => {
    const result = measureWebPQuality(
      new Uint8ClampedArray([255, 0, 0, 0]),
      new Uint8ClampedArray([0, 0, 0, 0]),
    );
    expect(result.psnr).toBe(Number.POSITIVE_INFINITY);
    expect(result.alphaIdentical).toBe(true);
  });

  // 실루엣과 클리핑을 바꾸는 알파 차이는 색상 점수가 높더라도 별도로 검출한다.
  it("알파 채널 변화와 보이는 RGB 오차를 측정한다", () => {
    const result = measureWebPQuality(
      new Uint8ClampedArray([100, 100, 100, 255]),
      new Uint8ClampedArray([101, 100, 100, 254]),
    );
    expect(result.psnr).toBeGreaterThan(50);
    expect(result.alphaIdentical).toBe(false);
  });

  // 잘못된 디코드 크기는 점수를 내지 않고 안전하지 않은 결과로 처리한다.
  it("RGBA 버퍼 길이가 다르면 품질 검증을 거부한다", () => {
    expect(measureWebPQuality(new Uint8ClampedArray(4), new Uint8ClampedArray(8)))
      .toEqual({ psnr: 0, alphaIdentical: false });
  });
});
