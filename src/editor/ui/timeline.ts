/**
 * 타임라인. 고른 애니메이션의 시간 축을 보여 주고 원하는 시점으로 옮긴다.
 *
 * 여기서는 그리기와 조작만 맡는다. 실제로 시각을 옮기는 것은 `AnimationPlayer`이고,
 * 이 파일은 그 값을 받아 그리고 사용자의 조작을 콜백으로 넘긴다. (기획서 62)
 *
 * 특정 시점에 세워 두는 것이 키프레임 편집의 전제다 —
 * 0.6초에서 팔을 돌리려면 먼저 0.6초에 설 수 있어야 한다.
 */
import { setIcon } from "./icons";
import { attachTooltip } from "./tooltip";

/** 한 프레임으로 볼 시간. `←` `→`로 이만큼씩 옮긴다. */
export const FRAME = 1 / 30;

/**
 * 시간 축 양옆에 두는 여백(px).
 * 0초와 끝 시각의 표시가 테두리에 잘리지 않게 하기 위한 것이다.
 * CSS의 `.tl-ticks` · `.tl-keys` · `.tl-head` 위치와 같은 값이어야 한다.
 */
const EDGE = 6;

/** 키를 집을 수 있는 화면상 반경(px). */
const KEY_GRAB = 7;

export interface TimelineCallbacks {
  /** 재생 헤드를 옮긴다. */
  onSeek(time: number): void;
  /** 재생 / 일시정지 토글. */
  onTogglePlay(): void;
  /** 처음으로. */
  onRewind(): void;
  /** 고른 관절의 키를 다른 시각으로 옮긴다. 놓을 때 `done`이 true다. */
  onMoveKey(from: number, to: number, done: boolean): void;
  /** 고른 관절의 그 시각 키를 지운다. */
  onDeleteKey(time: number): void;
}

export interface TimelineState {
  /** 고른 애니메이션 이름. null이면 타임라인을 감춘다. */
  animationId: string | null;
  time: number;
  duration: number;
  playing: boolean;
  /** 키가 찍힌 시각들. 눈금 위에 마름모로 찍는다. */
  keys: readonly number[];
  /** 고른 관절이 움직이는 시각. 프리셋(태그)의 키도 포함된다. */
  boneKeys: readonly number[];
  /** 그중 **직접 찍은** 키. 이것만 끌거나 지울 수 있어서 따로 그린다. */
  ownKeys: readonly number[];
  /** 고른 관절 이름. 없으면 null. */
  boneName: string | null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export class Timeline {
  private readonly playButton = el("button", "tl-play");
  private readonly rewindButton = el("button", "tl-rewind");
  private readonly readout = el("span", "tl-readout");
  private readonly track = el("div", "tl-track");
  private readonly ticks = el("div", "tl-ticks");
  private readonly keyLayer = el("div", "tl-keys");
  private readonly head = el("div", "tl-head");
  private readonly hint = el("span", "tl-hint");

  private duration = 0;
  private scrubbing = false;
  /** 끌고 있는 키의 원래 시각. 없으면 키를 끌고 있지 않다. */
  private draggingKey: number | null = null;
  /** 끌고 있는 키가 지금 가 있는 시각. */
  private draggingTo = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: TimelineCallbacks,
  ) {
    this.build();
  }

  private build(): void {
    this.rewindButton.type = "button";
    setIcon(this.rewindButton, "rewind");
    attachTooltip(this.rewindButton, {
      title: "처음으로",
      body: "재생 헤드를 0초로 되돌립니다.",
      meta: "단축키 Home",
    });
    this.rewindButton.addEventListener("click", () => this.callbacks.onRewind());

    this.playButton.type = "button";
    setIcon(this.playButton, "play");
    attachTooltip(this.playButton, {
      title: "재생 / 일시정지",
      body: "일시정지는 자세를 그대로 둔 채 시간만 멈춥니다. 그 자리에서 이어서 재생됩니다.",
      meta: "단축키 Space · 한 프레임씩은 ← →",
    });
    this.playButton.addEventListener("click", () => this.callbacks.onTogglePlay());

    this.track.append(this.ticks, this.keyLayer, this.head);
    attachTooltip(this.track, {
      title: "시간 축",
      body: "눌러서 그 시점으로 옮기고, 끌어서 훑어봅니다. 마름모는 키가 찍힌 시각입니다.",
      meta: "옮기는 동안에는 애니메이션 이벤트가 울리지 않습니다",
    });

    this.track.addEventListener("pointerdown", (event) => {
      // 왼쪽 버튼만 잡는다. 오른쪽은 키 지우기(contextmenu)의 몫이다.
      if (event.button !== 0) return;
      this.track.setPointerCapture(event.pointerId);

      // 고른 관절의 키를 집었으면 그 키를 옮긴다. 아니면 재생 헤드를 옮긴다.
      const grabbed = this.keyUnder(event);
      if (grabbed !== null) {
        this.draggingKey = grabbed;
        this.draggingTo = grabbed;
        return;
      }

      this.scrubbing = true;
      this.seekFromPointer(event);
    });

    this.track.addEventListener("pointermove", (event) => {
      if (this.draggingKey !== null) {
        this.draggingTo = this.timeFromPointer(event);
        this.callbacks.onMoveKey(this.draggingKey, this.draggingTo, false);
        return;
      }
      if (this.scrubbing) {
        this.seekFromPointer(event);
        return;
      }
      // 키 위에서는 집을 수 있다는 표시를 준다.
      this.track.style.cursor = this.keyUnder(event) !== null ? "grab" : "ew-resize";
    });

    const end = (event: PointerEvent) => {
      if (this.draggingKey !== null) {
        // 집기만 하고 움직이지 않았으면 아무 일도 하지 않는다.
        if (this.draggingTo !== this.draggingKey) {
          this.callbacks.onMoveKey(this.draggingKey, this.draggingTo, true);
        }
        this.draggingKey = null;
      }
      this.scrubbing = false;
      if (this.track.hasPointerCapture(event.pointerId)) {
        this.track.releasePointerCapture(event.pointerId);
      }
    };
    this.track.addEventListener("pointerup", end);
    this.track.addEventListener("pointercancel", end);

    // 키 위에서 오른쪽 버튼을 누르면 지운다.
    this.track.addEventListener("contextmenu", (event) => {
      const time = this.keyUnder(event as PointerEvent);
      if (time === null) return;
      event.preventDefault();
      this.callbacks.onDeleteKey(time);
    });

    this.root.append(this.rewindButton, this.playButton, this.readout, this.track, this.hint);
  }

  /** 포인터가 가리키는 시각. */
  private timeFromPointer(event: { clientX: number }): number {
    const box = this.track.getBoundingClientRect();
    const width = box.width - EDGE * 2;
    if (width <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left - EDGE) / width));
    return ratio * this.duration;
  }

  private seekFromPointer(event: PointerEvent): void {
    this.callbacks.onSeek(this.timeFromPointer(event));
  }

  /**
   * 포인터 아래에 있는 **고른 관절의** 키 시각. 없으면 null.
   * 다른 관절의 키는 집히지 않는다 — 안 보고 있던 것을 실수로 옮기면 곤란하다.
   */
  private keyUnder(event: { clientX: number }): number | null {
    if (this.myKeys.length === 0 || this.duration <= 0) return null;

    const box = this.track.getBoundingClientRect();
    const width = box.width - EDGE * 2;
    if (width <= 0) return null;

    const at = this.timeFromPointer(event);
    let nearest: number | null = null;
    let best = (KEY_GRAB / width) * this.duration;
    for (const time of this.myKeys) {
      const distance = Math.abs(time - at);
      if (distance <= best) {
        best = distance;
        nearest = time;
      }
    }
    return nearest;
  }

  /** 타임라인을 붙잡고 있는 중인지. 붙잡은 동안에는 재생을 멈춰 둔다. */
  get isScrubbing(): boolean {
    return this.scrubbing;
  }

  /** 직접 찍은 키 시각. 이것만 집을 수 있다. */
  private myKeys: readonly number[] = [];

  render(state: TimelineState): void {
    this.myKeys = state.ownKeys;
    const visible = state.animationId !== null && state.duration > 0;
    this.root.hidden = !visible;
    document.getElementById("app")?.classList.toggle("has-timeline", visible);
    if (!visible) return;

    this.duration = state.duration;
    setIcon(this.playButton, state.playing ? "pause" : "play");
    this.playButton.setAttribute("aria-pressed", String(state.playing));

    const frame = Math.round(state.time / FRAME);
    this.readout.textContent = `${state.time.toFixed(2)} / ${state.duration.toFixed(2)}초 · ${frame}F`;

    const ratio = state.duration > 0 ? state.time / state.duration : 0;
    // 양옆 여백을 뺀 폭 안에서 움직인다.
    this.head.style.left = `calc(${EDGE}px + ${(ratio * 100).toFixed(3)}% - ${(ratio * EDGE * 2).toFixed(2)}px)`;

    this.renderTicks(state.duration);
    this.renderKeys(state);

    this.hint.textContent = state.boneName
      ? `${state.boneName}: 내 키 ${state.ownKeys.length} / 전체 ${state.boneKeys.length}`
      : `키 ${state.keys.length}개`;
  }

  /** 0.1초마다 작은 눈금, 1초마다 큰 눈금과 숫자. */
  private renderTicks(duration: number): void {
    const signature = duration.toFixed(3);
    if (this.ticks.dataset.signature === signature) return;
    this.ticks.dataset.signature = signature;
    this.ticks.replaceChildren();

    // 눈금이 너무 촘촘해지지 않게 길이에 따라 간격을 키운다.
    const step = duration <= 3 ? 0.1 : duration <= 10 ? 0.5 : 1;
    for (let time = 0; time <= duration + 1e-6; time += step) {
      const major = Math.abs(time - Math.round(time)) < 1e-6;
      const tick = el("div", major ? "tl-tick major" : "tl-tick");
      tick.style.left = `${((time / duration) * 100).toFixed(3)}%`;
      if (major) tick.dataset.label = `${Math.round(time)}`;
      this.ticks.append(tick);
    }
  }

  /**
   * 마름모 세 갈래.
   * - 흐림: 다른 관절의 키
   * - 중간: 고른 관절이 움직이지만 프리셋(태그)이 만든 키 — 손댈 수 없다
   * - 밝음: 직접 찍은 키 — 끌어서 옮기고 우클릭으로 지울 수 있다
   */
  private renderKeys(state: TimelineState): void {
    const signature = [state.duration, state.keys, state.boneKeys, state.ownKeys].join("|");
    if (this.keyLayer.dataset.signature === signature) return;
    this.keyLayer.dataset.signature = signature;
    this.keyLayer.replaceChildren();

    const affects = new Set(state.boneKeys);
    const own = new Set(state.ownKeys);

    for (const time of state.keys) {
      const kind = own.has(time) ? "tl-key mine" : affects.has(time) ? "tl-key affects" : "tl-key";
      const key = el("div", kind);
      key.style.left = `${((time / state.duration) * 100).toFixed(3)}%`;
      key.title = own.has(time)
        ? `${time.toFixed(2)}초 · 끌어서 옮기고 우클릭으로 지웁니다`
        : `${time.toFixed(2)}초 · 프리셋의 키라 손댈 수 없습니다`;
      this.keyLayer.append(key);
    }
  }
}
