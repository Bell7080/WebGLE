import type { PuppetMesh } from "@core/format";
import { vertexCount } from "@core/mesh";

/** 이 알파값 이상이면 캐릭터 영역으로 본다. */
const ALPHA_THRESHOLD = 8;

/**
 * 정점이 이미지의 그려진 영역 안에 있는지 표시한다.
 * 투명 배경 PNG를 전제로, 칠하기와 영향 영역 표시를 캐릭터 실루엣 안쪽으로 제한한다.
 * (클리핑 마스크. 배경 제거는 하지 않는다 — 기획서 54)
 */
export function sampleAlphaMask(image: HTMLImageElement, mesh: PuppetMesh): boolean[] {
  const count = vertexCount(mesh);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new Array<boolean>(count).fill(true);

  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);

  // 격자 한 칸의 절반만큼은 여유를 둔다. 실루엣 경계의 정점도 칠할 수 있어야 자연스럽다.
  const marginX = Math.max(1, Math.round(image.width / mesh.cols / 2));
  const marginY = Math.max(1, Math.round(image.height / mesh.rows / 2));

  const isOpaque = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
    return (data[(y * image.width + x) * 4 + 3] ?? 0) >= ALPHA_THRESHOLD;
  };

  return Array.from({ length: count }, (_unused, index) => {
    const x = Math.round(mesh.vertices[index * 2] ?? 0);
    const y = Math.round(mesh.vertices[index * 2 + 1] ?? 0);

    for (let dy = -marginY; dy <= marginY; dy += marginY) {
      for (let dx = -marginX; dx <= marginX; dx += marginX) {
        if (isOpaque(x + dx, y + dy)) return true;
      }
    }
    return false;
  });
}
