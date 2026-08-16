/**
 * 스프라이트 시트 굽기. (기획서 47)
 *
 * 메시로 실시간 변형하는 것이 이 툴의 본래 방식이지만, 그것을 쓸 수 없는 곳도 있다 —
 * 스프라이트만 받는 엔진, 도트 게임, 아이콘이나 미리보기 이미지.
 * 그래서 재생 결과를 프레임마다 구워서 격자 이미지 한 장으로 내놓는다.
 *
 * 굽는 방식은 게임에서 도는 것과 완전히 같은 경로다. 런타임이 쓰는
 * `evaluateAnimation → computeSkinMatrices → skinVertices`를 그대로 부르고,
 * 그 결과를 WebGL로 그린다. 화면에서 본 것과 시트가 달라지지 않게 하기 위한 것이다.
 */
import type { PuppetAnimation, PuppetProject } from "@core/format";
import { deformModesFor, evaluateAnimation } from "@core/animation";
import { computeSkinMatrices, skinVertices } from "@core/skeleton/transform";
import { SecondaryMotion } from "@core/physics/secondary";
import { toUV } from "@core/mesh";

/** 초당 프레임 수 기본값. 30은 파일이 너무 커지고, 12는 뚝뚝 끊긴다. */
export const DEFAULT_FPS = 20;

/** 시트 한 장의 최대 폭(px). 오래된 모바일 GPU의 텍스처 한계에 맞춘 값이다. */
const MAX_SHEET_WIDTH = 4096;

/** 프레임 가장자리 여백(px). 이웃 칸의 색이 번져 들어오지 않게 한다. */
const PADDING = 2;

export interface SheetOptions {
  fps?: number;
}

/** 시트 한 장. 게임 쪽에서 잘라 쓰는 데 필요한 값이 전부 들어 있다. */
export interface SpriteSheet {
  /** 애니메이션 이름. 파일 이름이 된다. */
  name: string;
  blob: Blob;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  fps: number;
  duration: number;
  loop: boolean;
  /**
   * 원본 이미지 좌표계에서 이 시트의 (0,0)이 어디였는지.
   * 시트를 원래 자리에 겹쳐 놓고 싶을 때 쓴다.
   */
  originX: number;
  originY: number;
}

export class SpriteSheetError extends Error {}

/** 굽기 전에 확인한다. 이유를 알려 주지 않으면 사용자는 왜 안 되는지 알 수 없다. */
export function sheetBlockReason(project: PuppetProject): string | null {
  if (!project.mesh) return "이미지를 먼저 불러오세요.";
  if (project.bones.length === 0) return "관절이 없어 움직임을 구울 수 없습니다.";
  if (exportableAnimations(project).length === 0) {
    return "내보낼 애니메이션이 없습니다. 숨김을 해제하거나 애니메이션을 추가하세요.";
  }
  return null;
}

/**
 * 시트로 구울 애니메이션들.
 *
 * 숨김으로 표시한 것만 빠진다. 나머지는 하나도 빠짐없이 각각 한 장씩 나온다 —
 * 어떤 것을 뽑을지 고르는 화면을 또 만들면 그만큼 느려지기 때문이다.
 */
export function exportableAnimations(project: PuppetProject): [string, PuppetAnimation][] {
  return Object.entries(project.animations).filter(([, animation]) => !animation.hidden);
}

/** 프레임 시각들. 반복 애니메이션은 끝 시각을 빼야 첫 프레임과 겹치지 않는다. */
export function frameTimes(animation: PuppetAnimation, fps: number): number[] {
  const duration = Math.max(0.0001, animation.duration);
  const count = Math.max(1, Math.round(duration * fps));

  if (animation.loop) {
    return Array.from({ length: count }, (_unused, i) => (i * duration) / count);
  }
  if (count === 1) return [0];
  return Array.from({ length: count }, (_unused, i) => (i * duration) / (count - 1));
}

/**
 * 한 애니메이션의 모든 프레임 정점.
 *
 * 따라 흔들림은 시간을 따라 쌓이는 물리라 프레임을 건너뛰어 계산할 수 없다.
 * 반복 애니메이션은 한 바퀴를 미리 돌려 흔들림이 자리를 잡은 뒤의 두 번째 바퀴를 쓴다 —
 * 그래야 시트의 마지막 프레임과 첫 프레임이 이어진다.
 */
function poseFrames(
  project: PuppetProject,
  animation: PuppetAnimation,
  times: readonly number[],
): Float32Array[] {
  const mesh = project.mesh;
  if (!mesh) return [];

  const { bones } = project;
  const modes = deformModesFor(bones, animation);
  const amount = animation.strength ?? 1;
  const swing = animation.secondary ?? 1;
  const secondary = new SecondaryMotion();

  const step = times.length > 1 ? (times[1] ?? 0) - (times[0] ?? 0) : 1 / DEFAULT_FPS;
  const frames: Float32Array[] = [];

  // 반복이면 한 바퀴를 버리고 두 번째 바퀴를 담는다.
  const passes = animation.loop ? 2 : 1;
  for (let pass = 0; pass < passes; pass += 1) {
    const keep = pass === passes - 1;
    for (const time of times) {
      const deltas = evaluateAnimation(animation, bones, time, amount);
      const posed = computeSkinMatrices(bones, deltas);
      secondary.apply(bones, deltas, posed, step, swing);
      const skin = computeSkinMatrices(bones, deltas);
      if (keep) frames.push(skinVertices(mesh, skin, undefined, modes));
    }
  }

  return frames;
}

/** 모든 프레임을 담는 사각형. 팔을 크게 휘두르면 원본 크기를 벗어나기 때문이다. */
function boundsOf(frames: readonly Float32Array[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += 2) {
      const x = frame[i] ?? 0;
      const y = frame[i + 1] ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform vec2 u_origin;
uniform vec2 u_size;
out vec2 v_uv;
void main() {
  vec2 local = (a_pos - u_origin) / u_size;
  // 텍스처 좌표는 아래로 자라고 클립 좌표는 위로 자란다.
  gl_Position = vec4(local.x * 2.0 - 1.0, 1.0 - local.y * 2.0, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 color;
void main() {
  color = texture(u_texture, v_uv);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new SpriteSheetError("셰이더를 만들지 못했습니다.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new SpriteSheetError(gl.getShaderInfoLog(shader) ?? "셰이더 컴파일에 실패했습니다.");
  }
  return shader;
}

/**
 * 프레임들을 격자 한 장에 그린다.
 *
 * 칸마다 다시 그리지 않고 뷰포트만 옮겨 가며 한 캔버스에 직접 그린다.
 * 프레임 수만큼 이미지를 복사하는 것보다 훨씬 싸다.
 */
async function drawSheet(
  frames: readonly Float32Array[],
  uv: readonly number[],
  indices: readonly number[],
  texture: TexImageSource,
  pixelArt: boolean,
  layout: {
    columns: number;
    rows: number;
    frameWidth: number;
    frameHeight: number;
    originX: number;
    originY: number;
    spanX: number;
    spanY: number;
  },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = layout.columns * layout.frameWidth;
  canvas.height = layout.rows * layout.frameHeight;

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    // 투명도를 곱해 두지 않은 그대로 받는다. PNG로 내보낼 때 색이 어두워지지 않게 하기 위한 것이다.
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: !pixelArt,
  });
  if (!gl) throw new SpriteSheetError("이 브라우저에서 WebGL2를 쓸 수 없습니다.");

  const program = gl.createProgram();
  if (!program) throw new SpriteSheetError("셰이더 프로그램을 만들지 못했습니다.");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new SpriteSheetError(gl.getProgramInfoLog(program) ?? "셰이더 연결에 실패했습니다.");
  }
  gl.useProgram(program);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
  const filter = pixelArt ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, "u_texture"), 0);

  const posBuffer = gl.createBuffer();
  const posLocation = gl.getAttribLocation(program, "a_pos");
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.enableVertexAttribArray(posLocation);
  gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

  const uvBuffer = gl.createBuffer();
  const uvLocation = gl.getAttribLocation(program, "a_uv");
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform2f(gl.getUniformLocation(program, "u_size"), layout.spanX, layout.spanY);

  frames.forEach((frame, index) => {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);

    // WebGL의 뷰포트는 왼쪽 **아래**가 원점이라 행 순서를 뒤집는다.
    gl.viewport(
      column * layout.frameWidth,
      canvas.height - (row + 1) * layout.frameHeight,
      layout.frameWidth,
      layout.frameHeight,
    );

    gl.uniform2f(gl.getUniformLocation(program, "u_origin"), layout.originX, layout.originY);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, frame, gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new SpriteSheetError("이미지를 만들지 못했습니다.");
  return blob;
}

/** 프레임 수에 맞는 격자 모양. 되도록 정사각형에 가깝게 잡되 폭 한계를 넘지 않는다. */
export function sheetLayout(
  frames: number,
  frameWidth: number,
): { columns: number; rows: number } {
  const fit = Math.max(1, Math.floor(MAX_SHEET_WIDTH / Math.max(1, frameWidth)));
  const columns = Math.max(1, Math.min(frames, fit, Math.ceil(Math.sqrt(frames))));
  return { columns, rows: Math.ceil(frames / columns) };
}

/**
 * 숨기지 않은 애니메이션을 전부 시트로 굽는다. 하나에 한 장씩이다.
 *
 * `texture`는 이미 디코딩된 이미지여야 한다 — 이 함수는 파일을 읽지 않는다.
 */
export async function bakeSheets(
  project: PuppetProject,
  texture: TexImageSource,
  options: SheetOptions = {},
): Promise<SpriteSheet[]> {
  const blocked = sheetBlockReason(project);
  if (blocked) throw new SpriteSheetError(blocked);

  const mesh = project.mesh!;
  const fps = Math.max(1, Math.round(options.fps ?? DEFAULT_FPS));
  const uv = toUV(mesh, project.character.width, project.character.height);

  const sheets: SpriteSheet[] = [];
  for (const [name, animation] of exportableAnimations(project)) {
    const times = frameTimes(animation, fps);
    const frames = poseFrames(project, animation, times);
    if (frames.length === 0) continue;

    const bounds = boundsOf(frames);
    const originX = Math.floor(bounds.minX) - PADDING;
    const originY = Math.floor(bounds.minY) - PADDING;
    const frameWidth = Math.max(1, Math.ceil(bounds.maxX) + PADDING - originX);
    const frameHeight = Math.max(1, Math.ceil(bounds.maxY) + PADDING - originY);

    const { columns, rows } = sheetLayout(frames.length, frameWidth);
    const blob = await drawSheet(frames, uv, mesh.indices, texture, project.character.pixelArt, {
      columns,
      rows,
      frameWidth,
      frameHeight,
      originX,
      originY,
      spanX: frameWidth,
      spanY: frameHeight,
    });

    sheets.push({
      name,
      blob,
      frames: frames.length,
      frameWidth,
      frameHeight,
      columns,
      rows,
      fps,
      duration: animation.duration,
      loop: animation.loop,
      originX,
      originY,
    });
  }

  return sheets;
}

/** 시트와 함께 넣을 설명. 게임 쪽에서 이 값만 보고 잘라 쓸 수 있어야 한다. */
export function sheetManifest(project: PuppetProject, sheets: readonly SpriteSheet[]): string {
  return JSON.stringify(
    {
      _readme:
        "PuppetForge 스프라이트 시트입니다. 각 png는 frameWidth×frameHeight 칸이 " +
        "columns×rows로 놓인 격자이며, 프레임은 왼쪽 위에서 오른쪽으로 읽습니다. " +
        "fps로 재생하면 원본과 같은 속도가 됩니다.",
      character: project.character.name,
      sheets: sheets.map((sheet) => ({
        name: sheet.name,
        file: `${sheet.name}.png`,
        frames: sheet.frames,
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        columns: sheet.columns,
        rows: sheet.rows,
        fps: sheet.fps,
        duration: sheet.duration,
        loop: sheet.loop,
        originX: sheet.originX,
        originY: sheet.originY,
      })),
    },
    null,
    2,
  );
}
