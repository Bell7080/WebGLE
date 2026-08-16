/**
 * PuppetForge Phaser Runtime. (기획서 41, 43 · Phase 10)
 *
 * `Puppet`(runtime-core)이 계산한 정점을 Phaser 화면에 그린다.
 * 계산은 전부 core가 하고, 여기서는 Phaser에 얹는 일만 한다.
 *
 * ```ts
 * const 거미 = await PuppetCreature.load(this, "/monsters/거미.zip");
 * 거미.setPosition(400, 300);
 * 거미.play("idle");
 * 거미.on("impact", () => enemy.takeDamage());
 * ```
 *
 * `scene.add.existing`을 따로 부를 필요 없다. `load`가 씬에 붙여 준다.
 */
import Phaser from "phaser";
import { Puppet, type PlayOptions, type PuppetTexture } from "./index";

export { Puppet, PuppetLoadError } from "./index";
export type { PlayOptions, PuppetTexture } from "./index";

/** 같은 캐릭터를 여러 마리 놓아도 텍스처는 한 번만 올린다. */
function textureKey(name: string): string {
  return `puppetforge:${name}`;
}

export interface CreatureOptions {
  x?: number;
  y?: number;
  /** 처음부터 재생할 애니메이션. 없는 이름이면 조용히 넘어간다. */
  play?: string;
  /** 텍스처 키를 직접 정하고 싶을 때. 기본은 캐릭터 이름에서 만든다. */
  key?: string;
}

/**
 * 화면에 세우는 캐릭터 하나.
 *
 * Phaser의 `Mesh`를 감싼 것이라 `setPosition` · `setScale` · `setDepth` 같은
 * 보통의 GameObject 조작이 그대로 통한다.
 */
export class PuppetCreature extends Phaser.GameObjects.Mesh {
  private readonly puppet: Puppet;
  private readonly indices: number[];
  private flipped = false;

  private constructor(scene: Phaser.Scene, puppet: Puppet, key: string, x: number, y: number) {
    const mesh = puppet.mesh;
    if (!mesh) throw new Error("Mesh가 없는 캐릭터는 그릴 수 없습니다.");

    super(scene, x, y, key);
    this.puppet = puppet;
    this.indices = mesh.indices;

    const { width, height } = puppet;
    const uv = puppet.uv;
    const positions: number[] = [];
    const uvs: number[] = [];
    // Phaser Mesh는 원점이 가운데이고 y축이 위로 향한다. 이미지 좌표를 거기 맞춘다.
    for (const index of mesh.indices) {
      positions.push(
        (mesh.vertices[index * 2] ?? 0) - width / 2,
        height / 2 - (mesh.vertices[index * 2 + 1] ?? 0),
      );
      uvs.push(uv[index * 2] ?? 0, uv[index * 2 + 1] ?? 0);
    }

    this.setSize(width, height);
    this.setOrtho(width, height);
    // 뒤집으면 삼각형이 반대로 감기므로 뒷면을 버리지 않는다.
    this.hideCCW = false;
    this.addVertices(positions, uvs);

    scene.add.existing(this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.step, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.step, this);
    });
  }

  /**
   * 내보낸 묶음을 읽어 씬에 세운다.
   *
   * 텍스처가 아직 없으면 여기서 올린다. 같은 캐릭터를 여러 마리 만들어도 한 번만 올라간다.
   */
  static async load(
    scene: Phaser.Scene,
    source: string | ArrayBuffer | Uint8Array,
    options: CreatureOptions = {},
  ): Promise<PuppetCreature> {
    return PuppetCreature.fromPuppet(scene, await Puppet.load(source), options);
  }

  /** 이미 읽어 둔 `Puppet`으로 만든다. 한 파일로 여러 마리를 세울 때 쓴다. */
  static async fromPuppet(
    scene: Phaser.Scene,
    puppet: Puppet,
    options: CreatureOptions = {},
  ): Promise<PuppetCreature> {
    const key = options.key ?? textureKey(puppet.name);
    if (!scene.textures.exists(key)) {
      if (!puppet.texture) throw new Error(`묶음에 이미지가 없습니다: ${puppet.name}`);
      await uploadTexture(scene, key, puppet.texture, puppet.pixelArt);
    }

    const creature = new PuppetCreature(
      scene,
      puppet,
      key,
      options.x ?? 0,
      options.y ?? 0,
    );
    if (options.play) creature.play(options.play);
    return creature;
  }

  /** 밑에서 도는 runtime-core. 이벤트나 자세를 직접 다룰 때 쓴다. */
  get core(): Puppet {
    return this.puppet;
  }

  get animations(): string[] {
    return this.puppet.animations;
  }

  /** 지금 재생 중인 이름. 멈춰 있으면 null. */
  get playing(): string | null {
    return this.puppet.playing;
  }

  /**
   * 재생을 시작한다. 없는 이름이면 아무 일도 하지 않고 `false`다. (기획서 64)
   * 캐릭터마다 가진 동작이 다르므로 오류를 던지지 않는다.
   */
  play(name: string, options?: PlayOptions): boolean {
    return this.puppet.play(name, options);
  }

  stopAnimation(): this {
    this.puppet.stop();
    this.resetVertices();
    return this;
  }

  setAnimationSpeed(speed: number): this {
    this.puppet.setSpeed(speed);
    return this;
  }

  setAnimationStrength(strength: number): this {
    this.puppet.setStrength(strength);
    return this;
  }

  /**
   * 애니메이션 이벤트를 듣는다. (기획서 42)
   * `"*"`로 등록하면 모든 이벤트를 받는다. 돌려주는 함수를 부르면 그만 듣는다.
   */
  onEvent(event: string, listener: (event: string) => void): () => void {
    return this.puppet.on(event, listener);
  }

  /** 좌우 뒤집기. 왼쪽을 보게 하려면 `true`. (기획서 43) */
  setFlipX(flip: boolean): this {
    this.flipped = flip;
    this.scaleX = Math.abs(this.scaleX) * (flip ? -1 : 1);
    return this;
  }

  get flipX(): boolean {
    return this.flipped;
  }

  /** 특정 시각의 자세로 세워 둔다. 재생하지는 않는다. */
  poseAt(name: string, time: number): boolean {
    const posed = this.puppet.poseAt(name, time);
    if (!posed) return false;
    this.applyVertices(posed);
    return true;
  }

  /** 씬의 update마다 불린다. 직접 부를 필요는 없다. */
  private step(_time: number, deltaMs: number): void {
    const moved = this.puppet.update(deltaMs / 1000);
    if (moved) this.applyVertices(moved);
  }

  private resetVertices(): void {
    this.applyVertices(this.puppet.restVertices, false);
  }

  private applyVertices(source: ArrayLike<number>, deforming = true): void {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;

    for (let slot = 0; slot < this.indices.length; slot += 1) {
      const index = this.indices[slot]!;
      const vertex = this.vertices[slot];
      if (!vertex) continue;
      vertex.x = (source[index * 2] ?? 0) - halfWidth;
      vertex.y = halfHeight - (source[index * 2 + 1] ?? 0);
    }

    // Phaser는 Mesh 자신의 변환이 그대로면 정점 투영을 건너뛴다.
    // 움직이는 동안에는 매 프레임 다시 계산하게 두고, 멈추면 한 번만 갱신하고 되돌린다.
    this.ignoreDirtyCache = deforming;
    if (!deforming) (this as unknown as { dirtyCache: number[] }).dirtyCache[10] = 1;
  }
}

/** 묶음 안의 이미지 바이트를 Phaser 텍스처로 올린다. */
async function uploadTexture(
  scene: Phaser.Scene,
  key: string,
  texture: PuppetTexture,
  pixelArt: boolean,
): Promise<void> {
  const blob = new Blob([texture.data as unknown as BlobPart], { type: texture.type });
  const url = URL.createObjectURL(blob);

  try {
    const image = await loadImage(url);
    scene.textures
      .addImage(key, image)
      ?.setFilter(
        pixelArt ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR,
      );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    image.src = url;
  });
}
