/**
 * PuppetForge Runtime Core. (기획서 40, 70의 Phase 9)
 *
 * 게임에 들어가는 부분이다. 편집기 코드는 하나도 들어오지 않는다.
 * 렌더링 엔진도 모른다 — "이 순간 정점이 어디 있어야 하는가"까지만 계산하고,
 * 실제로 그리는 것은 `runtime/phaser` 같은 어댑터가 맡는다.
 *
 * ```ts
 * const puppet = await Puppet.load("/monsters/거미.zip");
 * puppet.play("idle");
 * // 매 프레임
 * const vertices = puppet.update(dt);
 * ```
 */
import {
  parseProject,
  type PuppetAnimation,
  type PuppetMesh,
  type PuppetProject,
} from "../core/format";
import { readZip } from "../core/format/zip";
import { toUV } from "../core/mesh";
import { AnimationPlayer, deformModesFor, evaluateAnimation } from "../core/animation";
import { computeSkinMatrices, skinVertices } from "../core/skeleton/transform";
import { SecondaryMotion } from "../core/physics/secondary";

export type {
  PuppetAnimation,
  PuppetBone,
  PuppetMesh,
  PuppetProject,
  VertexWeight,
} from "../core/format";

/** 내보낸 묶음 안의 JSON 파일 이름. */
const JSON_NAME = "puppet.json";

export class PuppetLoadError extends Error {}

/** 재생 시작 옵션. 안 주면 파일에 저장된 값을 쓴다. */
export interface PlayOptions {
  /** 재생 속도 배율. 파일의 `speed`를 덮어쓴다. */
  speed?: number;
  /** 움직임 크기 배율. 파일의 `strength`를 덮어쓴다. */
  strength?: number;
  /** 처음부터 다시 시작할지. 이미 같은 것을 재생 중일 때만 의미가 있다. 기본 true. */
  restart?: boolean;
}

/** 불러온 원본 이미지. 실제 디코딩은 렌더러가 한다. */
export interface PuppetTexture {
  /** 파일 이름. `character.texture`와 같다. */
  name: string;
  data: Uint8Array;
  /** 확장자로 정한 MIME. */
  type: string;
}

/**
 * 캐릭터 하나. 시간을 굴리고 정점을 계산한다.
 *
 * 화면에 그리지 않는다. `update`가 돌려주는 좌표를 렌더러에 넘기는 것은 어댑터의 몫이다.
 */
export class Puppet {
  private readonly player = new AnimationPlayer();
  private readonly secondary = new SecondaryMotion();
  private readonly listeners = new Map<string, Set<(event: string) => void>>();
  /** 매 프레임 새로 만들지 않고 다시 쓴다. */
  private buffer: Float32Array | null = null;
  private playingId: string | null = null;

  /**
   * 이 캐릭터가 왼쪽을 보고 있어서 동작의 좌우를 뒤집어야 하는지.
   * 파일의 `character.facing`이 그대로 들어온다. 게임이 따로 챙길 것은 없다.
   */
  private get mirrored(): boolean {
    return this.project.character.facing === "left";
  }

  private constructor(
    readonly project: PuppetProject,
    readonly texture: PuppetTexture | null,
  ) {
    this.player.onEvent((event) => {
      for (const listener of this.listeners.get(event) ?? []) listener(event);
      for (const listener of this.listeners.get("*") ?? []) listener(event);
    });
  }

  /**
   * 내보낸 묶음을 읽는다.
   *
   * URL 문자열을 주면 가져와서 읽고, 바이트를 주면 그대로 읽는다.
   * `.zip`이 아니라 `puppet.json` 내용을 직접 넘겨도 된다.
   */
  static async load(source: string | ArrayBuffer | Uint8Array): Promise<Puppet> {
    const bytes = await toBytes(source);

    // JSON을 그대로 넘긴 경우. ZIP은 "PK"로 시작한다.
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return new Puppet(readProject(bytes), null);
    }

    let entries;
    try {
      entries = await readZip(bytes);
    } catch (error) {
      throw new PuppetLoadError(
        `묶음을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const json = entries.find((entry) => entry.name === JSON_NAME);
    if (!json) throw new PuppetLoadError(`묶음 안에 ${JSON_NAME}이 없습니다.`);

    const project = readProject(json.data);
    const image = entries.find((entry) => entry.name === project.character.texture);

    return new Puppet(
      project,
      image ? { name: image.name, data: image.data, type: mimeOf(image.name) } : null,
    );
  }

  /** 이미 읽어 둔 Puppet JSON으로 만든다. 파일을 직접 다루는 경우에 쓴다. */
  static fromProject(project: PuppetProject, texture: PuppetTexture | null = null): Puppet {
    return new Puppet(parseProject(project), texture);
  }

  get name(): string {
    return this.project.character.name;
  }

  get width(): number {
    return this.project.character.width;
  }

  get height(): number {
    return this.project.character.height;
  }

  /** 도트 그림인지. 렌더러가 텍스처 필터를 정할 때 쓴다. */
  get pixelArt(): boolean {
    return this.project.character.pixelArt;
  }

  get mesh(): PuppetMesh | null {
    return this.project.mesh;
  }

  /** 부를 수 있는 애니메이션 이름들. */
  get animations(): string[] {
    return Object.keys(this.project.animations);
  }

  /** 지금 재생 중인 이름. 멈춰 있으면 null. */
  get playing(): string | null {
    return this.playingId;
  }

  hasAnimation(name: string): boolean {
    return name in this.project.animations;
  }

  /** 텍스처 좌표. 정점 순서와 짝이 맞는다. */
  get uv(): number[] {
    const mesh = this.project.mesh;
    return mesh ? toUV(mesh, this.width, this.height) : [];
  }

  /** 변형 전 원본 정점. */
  get restVertices(): number[] {
    return this.project.mesh?.vertices ?? [];
  }

  /**
   * 재생을 시작한다.
   *
   * 없는 이름이면 아무 일도 하지 않고 `false`를 돌려준다. 오류를 던지지 않는 것은
   * 캐릭터마다 가진 동작이 다르기 때문이다 — 없으면 그냥 안 하는 편이 낫다. (기획서 64)
   */
  play(name: string, options: PlayOptions = {}): boolean {
    const animation = this.project.animations[name];
    if (!animation) return false;

    if (options.restart === false && this.playingId === name) return true;

    this.player.play(animation, {
      speed: options.speed ?? animation.speed ?? 1,
      amount: options.strength ?? animation.strength ?? 1,
      mirror: this.mirrored,
    });
    this.playingId = name;
    this.secondary.reset();
    return true;
  }

  stop(): void {
    this.player.stop();
    this.playingId = null;
    this.secondary.reset();
  }

  /** 재생 중에 속도를 바꾼다. */
  setSpeed(speed: number): void {
    this.player.setSpeed(speed);
  }

  /** 재생 중에 움직임 크기를 바꾼다. */
  setStrength(strength: number): void {
    this.player.setAmount(strength);
  }

  /**
   * 애니메이션 이벤트를 듣는다. (기획서 42)
   * `"*"`로 등록하면 모든 이벤트를 받는다. 돌려주는 함수를 부르면 그만 듣는다.
   */
  on(event: string, listener: (event: string) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  /**
   * 시간을 dt초만큼 굴리고 변형된 정점을 돌려준다.
   *
   * Mesh가 없거나 멈춰 있으면 `null`이다. 그 경우 렌더러는 원본 그대로 두면 된다.
   * 돌려주는 배열은 매번 같은 것을 다시 쓴다 — 보관하려면 복사해야 한다.
   */
  update(dt: number): Float32Array | null {
    const mesh = this.project.mesh;
    const current = this.player.current;
    if (!mesh || !current?.playing) return null;

    const { bones } = this.project;
    const animation = current.animation;

    // 1) 애니메이션만 반영한 자세
    const deltas = this.player.update(dt, bones);
    const posed = computeSkinMatrices(bones, deltas);
    // 2) 그 움직임을 입력 삼아 늦게 따라오는 흔들림을 더한다 (기획서 29)
    this.secondary.apply(bones, deltas, posed, dt, animation.secondary ?? 1);
    // 3) 흔들림까지 반영한 최종 자세로 정점을 옮긴다
    const skin = computeSkinMatrices(bones, deltas);

    if (!this.buffer || this.buffer.length !== mesh.vertices.length) {
      this.buffer = new Float32Array(mesh.vertices.length);
    }
    return skinVertices(mesh, skin, this.buffer, deformModesFor(bones, animation));
  }

  /**
   * 재생하지 않고 특정 시각의 정점만 구한다.
   * 스프라이트 시트를 굽거나 한 자세를 그대로 세워 둘 때 쓴다.
   */
  poseAt(name: string, time: number): Float32Array | null {
    const mesh = this.project.mesh;
    const animation: PuppetAnimation | undefined = this.project.animations[name];
    if (!mesh || !animation) return null;

    const { bones } = this.project;
    const deltas = evaluateAnimation(animation, bones, time, animation.strength ?? 1, this.mirrored);
    const skin = computeSkinMatrices(bones, deltas);
    return skinVertices(mesh, skin, undefined, deformModesFor(bones, animation));
  }
}

async function toBytes(source: string | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (typeof source === "string") {
    const response = await fetch(source);
    if (!response.ok) {
      throw new PuppetLoadError(`불러오지 못했습니다 (${response.status}): ${source}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return source instanceof Uint8Array ? source : new Uint8Array(source);
}

function readProject(bytes: Uint8Array): PuppetProject {
  const text = new TextDecoder().decode(bytes);
  try {
    return parseProject(JSON.parse(text));
  } catch (error) {
    throw new PuppetLoadError(
      error instanceof Error ? error.message : "Puppet JSON을 읽지 못했습니다.",
    );
  }
}

function mimeOf(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/png";
}
