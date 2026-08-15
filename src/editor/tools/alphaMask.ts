import type { PuppetMesh } from "@core/format";
import { vertexCount } from "@core/mesh";

/** 이 알파값 이상이면 캐릭터 영역으로 본다. */
export const ALPHA_THRESHOLD = 8;

/** 이미지의 알파 채널만 뽑아 둔 것. 칠하기 범위와 영향 영역 표시에 함께 쓴다. */
export interface AlphaMap {
  width: number;
  height: number;
  data: Uint8Array;
}

/** 이미지에서 알파 채널만 읽어 온다. 배경 제거는 하지 않는다. (기획서 54) */
export function buildAlphaMap(image: HTMLImageElement): AlphaMap | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);

  const alpha = new Uint8Array(image.width * image.height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3] ?? 0;

  return { width: image.width, height: image.height, data: alpha };
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

  // 격자 한 칸의 절반만큼은 여유를 둔다. 실루엣 경계의 정점도 칠할 수 있어야 자연스럽다.
  const marginX = Math.max(1, Math.round(map.width / mesh.cols / 2));
  const marginY = Math.max(1, Math.round(map.height / mesh.rows / 2));

  return Array.from({ length: count }, (_unused, index) => {
    const x = Math.round(mesh.vertices[index * 2] ?? 0);
    const y = Math.round(mesh.vertices[index * 2 + 1] ?? 0);

    for (let dy = -marginY; dy <= marginY; dy += marginY) {
      for (let dx = -marginX; dx <= marginX; dx += marginX) {
        if (alphaAt(map, x + dx, y + dy) >= ALPHA_THRESHOLD) return true;
      }
    }
    return false;
  });
}
