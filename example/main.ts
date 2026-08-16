/**
 * 게임 쪽 코드 예시. (기획서 41, 43 · Phase 10)
 *
 * 편집기(`src/editor`)를 하나도 쓰지 않는다.
 * 게임 개발자가 실제로 쓰게 될 것은 아래 세 줄이 전부다.
 *
 * ```ts
 * const creature = await PuppetCreature.load(scene, "/monsters/거미.zip");
 * creature.play("idle");
 * creature.onEvent("impact", () => enemy.takeDamage());
 * ```
 */
import Phaser from "phaser";
import { PuppetCreature } from "../src/runtime/phaser";

const log = document.getElementById("log") as HTMLSpanElement;
const anims = document.getElementById("anims") as HTMLSpanElement;
const fileInput = document.getElementById("file") as HTMLInputElement;

let creature: PuppetCreature | null = null;
let scene: Phaser.Scene | null = null;

class DemoScene extends Phaser.Scene {
  create(): void {
    scene = this;
    this.cameras.main.setBackgroundColor("#0b0b0c");

    // 바닥선 하나. 캐릭터가 떠 있지 않다는 것을 눈으로 보기 위한 것이다.
    this.add
      .rectangle(0, this.scale.height * 0.82, this.scale.width * 2, 1, 0x26262b)
      .setOrigin(0, 0);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 720,
  height: 480,
  backgroundColor: "#0b0b0c",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: DemoScene,
});

async function open(file: File): Promise<void> {
  if (!scene) return;
  creature?.destroy();
  creature = null;
  anims.replaceChildren();

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // ── 게임이 하는 일은 여기부터 ──────────────────────────
    creature = await PuppetCreature.load(scene, bytes, {
      x: 360,
      y: 300,
      play: "idle",
    });
    // ──────────────────────────────────────────────────
  } catch (error) {
    log.textContent = error instanceof Error ? error.message : "열지 못했습니다.";
    return;
  }

  // 화면에 적당히 들어오도록 크기만 맞춘다.
  const fit = Math.min(1, 320 / creature.height);
  creature.setScale(fit);

  for (const name of creature.animations) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => {
      creature?.play(name);
      for (const other of anims.querySelectorAll("button")) {
        other.classList.toggle("on", other === button);
      }
      log.textContent = `재생: ${name}`;
    });
    anims.append(button);
  }
  (anims.querySelector("button") as HTMLButtonElement | null)?.classList.add("on");

  // 애니메이션 이벤트 (기획서 42)
  creature.onEvent("*", (event) => {
    log.textContent = `이벤트: ${event} · ${creature?.playing}`;
  });

  log.textContent = `${creature.core.name} · 애니메이션 ${creature.animations.length}개`;

  // 브라우저 확인용 손잡이. 게임에는 필요 없다.
  (window as unknown as Record<string, unknown>).__demo = { creature, game };
}

document.getElementById("pick")?.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void open(file);
});
document.getElementById("flip")?.addEventListener("click", () => {
  if (creature) creature.setFlipX(!creature.flipX);
});
