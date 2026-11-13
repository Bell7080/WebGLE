import type { PuppetMesh } from "@core/format";
import { alphaVertexMask, MESH_ALPHA_PADDING, MESH_ALPHA_THRESHOLD, vertexCount } from "@core/mesh";

/** 안티앨리어싱으로 거의 투명해진 픽셀도 월드에 남지 않도록 알파가 하나라도 있으면 캐릭터로 본다. */
export const ALPHA_THRESHOLD = MESH_ALPHA_THRESHOLD;

/** 아주 얇은 반투명 테두리도 영향 영역에서 잘리지 않도록 확보하는 최소 여유(px). */
export const ALPHA_MASK_PADDING = MESH_ALPHA_PADDING;

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
 * 정점이 이미지의 그려진 영역에 닿아 있는지 표시한다.
 * 투명 배경 PNG를 전제로, 칠하기를 캐릭터 실루엣 쪽으로 제한한다. (클리핑 마스크)
 *
 * 판정은 셀 단위다. 그림이 한 픽셀이라도 걸친 셀(여유 포함)의 꼭짓점 네 개를 모두 넣는다.
 * 예전처럼 정점 주변 반 칸만 보면 셀 한쪽 모서리에 걸친 테두리 픽셀의 반대편 꼭짓점이
 * 빠져서, 그 셀이 늘어나 찢어져 보였다.
 */
export function sampleAlphaMask(map: AlphaMap | null, mesh: PuppetMesh): boolean[] {
  if (!map) return new Array<boolean>(vertexCount(mesh)).fill(true);
  return alphaVertexMask(map.data, map.width, map.height, mesh);
}

/**
 * v0.42.0 이전의 마스크 판정. 옛 파일을 열 때 "그때는 칠할 수 없던" 정점을 가려내는 데만 쓴다.
 * 이 차이만 메우면 사용자가 일부러 비워 둔 곳은 건드리지 않는다.
 */
export function legacyAlphaMask(map: AlphaMap | null, mesh: PuppetMesh): boolean[] {
  const count = vertexCount(mesh);
  if (!map) return new Array<boolean>(count).fill(true);

  const marginX = Math.ceil(map.width / mesh.cols / 2) + ALPHA_MASK_PADDING;
  const marginY = Math.ceil(map.height / mesh.rows / 2) + ALPHA_MASK_PADDING;
  return Array.from({ length: count }, (_unused, index) => {
    const x = Math.round(mesh.vertices[index * 2] ?? 0);
    const y = Math.round(mesh.vertices[index * 2 + 1] ?? 0);
    for (let dy = -marginY; dy <= marginY; dy += 1) {
      for (let dx = -marginX; dx <= marginX; dx += 1) {
        if (alphaAt(map, x + dx, y + dy) >= ALPHA_THRESHOLD) return true;
      }
    }
    return false;
  });
}
