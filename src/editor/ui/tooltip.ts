/**
 * 설명 툴팁.
 *
 * 브라우저 기본 `title`은 뜨기까지 오래 걸리고 한 줄뿐이라, 직접 만들어 쓴다.
 * 태그와 변형처럼 "이걸 고르면 무슨 일이 일어나는가"를 설명해야 하는 곳에 붙인다.
 */

export interface TooltipContent {
  title: string;
  body: string;
  /** 아래에 옅게 붙는 한 줄. 예: 이 태그를 쓰는 애니메이션 목록. */
  meta?: string;
}

const SHOW_DELAY = 90;
const MARGIN = 8;

let element: HTMLDivElement | null = null;
let timer: number | null = null;

function ensureElement(): HTMLDivElement {
  if (element) return element;

  element = document.createElement("div");
  element.className = "tooltip";
  element.setAttribute("role", "tooltip");
  document.body.append(element);
  return element;
}

function show(anchor: HTMLElement, content: TooltipContent): void {
  const tip = ensureElement();
  tip.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = content.title;

  const body = document.createElement("span");
  body.textContent = content.body;

  tip.append(title, body);

  if (content.meta) {
    const meta = document.createElement("em");
    meta.textContent = content.meta;
    tip.append(meta);
  }

  tip.classList.add("visible");

  // 앵커 위에 띄우되, 화면 밖으로 나가면 아래나 안쪽으로 접는다.
  const bounds = anchor.getBoundingClientRect();
  const size = tip.getBoundingClientRect();

  let left = bounds.left + bounds.width / 2 - size.width / 2;
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - size.width - MARGIN));

  let top = bounds.top - size.height - MARGIN;
  if (top < MARGIN) top = bounds.bottom + MARGIN;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function hide(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  element?.classList.remove("visible");
}

/** 손가락으로 띄운 설명이 저절로 사라지기까지(ms). */
const TOUCH_LINGER = 2600;

/**
 * 두 걸음 방식으로 설명을 띄워 둔 요소. 두 번째 누름을 알아보기 위한 것이다.
 * 한 번에 하나만 떠 있으므로 하나만 기억한다.
 */
let touchAnchor: HTMLElement | null = null;

export interface TooltipOptions {
  /**
   * 손가락으로 처음 누르면 **설명만 띄우고 실행하지 않는다.** 두 번째 누름에서 실행된다.
   *
   * 고르기 전에 무슨 일이 일어나는지 읽어야 하는 것에만 켠다. 지금은 태그가 그렇다 —
   * 마흔 개가 넘고 이름만으로는 무엇이 움직일지 알 수 없어서, 붙여 보기 전에 읽어야 한다.
   *
   * 켜지 않은 곳(대부분)에서는 손가락으로 눌러도 **평소대로 곧바로 실행되고**,
   * 설명은 그 위에 잠깐 떴다가 사라진다. 이걸 모든 곳에 켰더니 설정 · 변형 · 프리셋까지
   * 전부 두 번씩 눌러야 해서, 휴대폰에서 아무것도 안 눌리는 것처럼 보였다.
   */
  explainOnTouch?: boolean;
}

/**
 * 요소에 툴팁을 붙인다. content를 함수로 주면 뜰 때마다 새로 만든다.
 *
 * 마우스는 올리면 뜨고 비키면 사라진다. 손가락에는 "올리기"가 없으므로,
 * 누를 때 설명을 함께 띄우고 잠시 뒤 스스로 사라지게 한다.
 * 읽고 나서 고르는 것이 중요한 자리는 {@link TooltipOptions.explainOnTouch}로 두 걸음으로 나눈다.
 */
export function attachTooltip(
  anchor: HTMLElement,
  content: TooltipContent | (() => TooltipContent),
  options: TooltipOptions = {},
): void {
  const resolve = () => (typeof content === "function" ? content() : content);

  anchor.addEventListener("pointerenter", (event) => {
    // 손가락은 아래 pointerdown이 맡는다. 여기까지 오면 두 번 뜬다.
    if (event.pointerType === "touch") return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => show(anchor, resolve()), SHOW_DELAY);
  });

  anchor.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") return;
    hide();
  });

  anchor.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") {
      hide();
      return;
    }

    if (!options.explainOnTouch) {
      // 평소 자리 — 누른 것은 그대로 실행되고 설명만 잠깐 곁들인다.
      show(anchor, resolve());
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(hide, TOUCH_LINGER);
      return;
    }

    if (touchAnchor === anchor) {
      // 두 번째 누름 — 설명을 닫고 그대로 흘려 보낸다. 이 누름이 실제 실행이 된다.
      touchAnchor = null;
      hide();
      return;
    }

    // 첫 번째 누름 — 설명만 띄우고 이 누름은 없던 것으로 한다.
    event.preventDefault();
    event.stopPropagation();
    touchAnchor = anchor;
    show(anchor, resolve());
  });

  // 첫 누름을 막았으므로 뒤따르는 click도 함께 막아야 실행되지 않는다.
  if (options.explainOnTouch) {
    anchor.addEventListener(
      "click",
      (event) => {
        if (touchAnchor === anchor) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );
  }

  anchor.addEventListener("focus", () => show(anchor, resolve()));
  anchor.addEventListener("blur", hide);
}

/** 패널을 다시 그리기 전에 떠 있던 툴팁을 정리한다. */
export function hideTooltip(): void {
  touchAnchor = null;
  hide();
}

/**
 * 다른 곳을 누르면 떠 있던 설명을 닫는다.
 *
 * 이걸 두지 않으면 설명을 띄워 둔 채 다른 일을 하다가 그 버튼을 다시 눌렀을 때
 * "두 번째 누름"으로 잘못 세어져 곧바로 실행돼 버린다.
 */
document.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType !== "touch" || !touchAnchor) return;
    if (touchAnchor.contains(event.target as Node)) return;
    touchAnchor = null;
    hide();
  },
  true,
);
