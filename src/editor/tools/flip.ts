/**
 * 그림과 관절을 통째로 좌우로 뒤집는다.
 *
 * 애니메이션의 `mirror`와는 다른 일이다. 그쪽은 재생할 때 방향만 돌리는 것이고,
 * 이쪽은 **데이터를 실제로 옮긴다** — 그림의 픽셀, 관절의 자리, 칠해 둔 영향 영역까지.
 * 왼쪽을 보는 그림을 받았는데 처음부터 오른쪽을 보게 만들고 싶을 때 쓴다.
 *
 * 실제로 옮기기 때문에 내보내기 · 런타임 · 시트에 아무 표시도 남지 않는다.
 * 포맷에 새 값이 생기지 않고, 게임 쪽에서 알아야 할 것도 없다.
 * 되돌리려면 한 번 더 뒤집으면 된다(Undo도 된다).
 */
import type { PuppetBone, PuppetMesh, PuppetProject } from "@core/format";
import type { WeightMap } from "@core/weight";

/** 관절을 좌우로 옮긴다. 회전은 방향이 뒤집히므로 부호가 바뀐다. */
export function flipBones(bones: readonly PuppetBone[], width: number): PuppetBone[] {
  return bones.map((bone) => ({
    ...bone,
    x: width - bone.x,
    rotation: -bone.rotation,
  }));
}

/**
 * 격자 위의 값 한 줄을 좌우로 뒤집는다.
 *
 * 격자는 `(cols+1) × (rows+1)`개의 점이 줄 단위로 늘어선 배열이다.
 * 줄마다 순서를 뒤집으면 그대로 좌우 반전이 된다.
 */
export function flipChannel(channel: readonly number[], cols: number, rows: number): number[] {
  const stride = cols + 1;
  const flipped = new Array<number>(channel.length).fill(0);

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      flipped[row * stride + col] = channel[row * stride + (cols - col)] ?? 0;
    }
  }
  return flipped;
}

/** 칠해 둔 영향 영역 전체를 좌우로 뒤집는다. */
export function flipWeights(weights: WeightMap, mesh: PuppetMesh): WeightMap {
  const flipped: WeightMap = {};
  for (const [boneId, channel] of Object.entries(weights)) {
    flipped[boneId] = flipChannel(channel, mesh.cols, mesh.rows);
  }
  return flipped;
}

/** Mesh에 저장된 정규화 결과도 같은 방식으로 뒤집는다. */
export function flipMesh(mesh: PuppetMesh): PuppetMesh {
  const stride = mesh.cols + 1;
  const weights = mesh.weights.map((_unused, index) => {
    const row = Math.floor(index / stride);
    const col = index % stride;
    return mesh.weights[row * stride + (mesh.cols - col)] ?? { boneIds: [], weights: [] };
  });
  return { ...mesh, weights };
}

/**
 * 프로젝트의 관절 · Mesh를 뒤집는다. 그림 자체는 호출부가 따로 뒤집는다 —
 * 이미지를 다루는 것은 브라우저 캔버스의 일이라 여기(순수 데이터)에 두지 않는다.
 */
export function flipProject(project: PuppetProject): PuppetProject {
  return {
    ...project,
    bones: flipBones(project.bones, project.character.width),
    mesh: project.mesh ? flipMesh(project.mesh) : null,
  };
}

/**
 * 이미지를 좌우로 뒤집어 새 data URL로 돌려준다.
 *
 * 원본 파일을 건드리지 않고 뒤집은 사본을 만든다. 이 결과가 그대로 저장 · 내보내기에 들어가므로,
 * 다음에 파일을 열면 처음부터 뒤집힌 그림이다.
 */
export async function flipImage(url: string, pixelArt: boolean): Promise<string> {
  const image = new Image();
  image.src = url;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 뒤집지 못했습니다.");

  // 도트 그림은 보간하면 뭉개진다.
  context.imageSmoothingEnabled = !pixelArt;
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(image, 0, 0);

  return canvas.toDataURL("image/png");
}
