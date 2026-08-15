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

/** 요소에 툴팁을 붙인다. content를 함수로 주면 뜰 때마다 새로 만든다. */
export function attachTooltip(
  anchor: HTMLElement,
  content: TooltipContent | (() => TooltipContent),
): void {
  const resolve = () => (typeof content === "function" ? content() : content);

  anchor.addEventListener("pointerenter", () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => show(anchor, resolve()), SHOW_DELAY);
  });

  anchor.addEventListener("pointerleave", hide);
  anchor.addEventListener("pointerdown", hide);
  anchor.addEventListener("focus", () => show(anchor, resolve()));
  anchor.addEventListener("blur", hide);
}

/** 패널을 다시 그리기 전에 떠 있던 툴팁을 정리한다. */
export function hideTooltip(): void {
  hide();
}
