import type { PuppetMesh } from "@core/format";
import { vertexCount } from "@core/mesh";

/** 이 알파값 이상이면 캐릭터 영역으로 본다. */
export const ALPHA_THRESHOLD = 8;

/** 아주 얇은 반투명 테두리도 영향 영역에서 잘리지 않도록 확보하는 최소 여유(px). */
export const ALPHA_MASK_PADDING = 2;

/** 이미지의 알파 채널만 뽑아 둔 것. 칠하기 범위와 영향 영역 표시에 함께 쓴다. */
export interface AlphaMap {
  width: number;
  height: number;
  data: Uint8Array;
}

/** 이미지의 픽셀을 한 번만 읽어 둔다. 알파 마스크와 도트 판정이 함께 쓴다. */
export function readPixels(image: HTMLImageElement): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

/** 알파 채널만 뽑아 둔다. 배경 제거는 하지 않는다. (기획서 54) */
export function buildAlphaMap(pixels: ImageData | null): AlphaMap | null {
  if (!pixels) return null;

  const alpha = new Uint8Array(pixels.width * pixels.height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = pixels.data[i * 4 + 3] ?? 0;

  return { width: pixels.width, height: pixels.height, data: alpha };
}

export function alphaAt(map: AlphaMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return map.data[y * map.width + x] ?? 0;
}

/**
 * 정점이 이미지의 그려진 영역 안에 있는지 표시한다.
 * 투명 배경 PNG를 전제로, 칠하기를 캐릭터 실루엣 안쪽으로 제한한다. (클리핑 마스크)
 */
export function sampleAlphaMask(map: AlphaMap | null, mesh: PuppetMesh): boolean[] {
  const count = vertexCount(mesh);
  if (!map) return new Array<boolean>(count).fill(true);

  // 격자가 아무리 촘촘해도 2px은 남기고, 성긴 격자는 기존처럼 반 칸까지 둘러본다.
  const marginX = Math.max(ALPHA_MASK_PADDING, Math.round(map.width / mesh.cols / 2));
  const marginY = Math.max(ALPHA_MASK_PADDING, Math.round(map.height / mesh.rows / 2));

  return Array.from({ length: count }, (_unused, index) => {
    const x = Math.round(mesh.vertices[index * 2] ?? 0);
    const y = Math.round(mesh.vertices[index * 2 + 1] ?? 0);

    // 여유 사각형의 모든 픽셀을 확인해야 정점 사이에 낀 1px 윤곽선도 빠뜨리지 않는다.
    for (let dy = -marginY; dy <= marginY; dy += 1) {
      for (let dx = -marginX; dx <= marginX; dx += 1) {
        if (alphaAt(map, x + dx, y + dy) >= ALPHA_THRESHOLD) return true;
      }
    }
    return false;
  });
}
