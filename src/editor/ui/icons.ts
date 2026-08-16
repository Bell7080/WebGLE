/**
 * 아이콘. 전부 여기서 직접 그린다. (기획서 74)
 *
 * 글꼴에 들어 있는 기호(▶ ■ ↩ × ⠿ …)는 쓰지 않는다. 기기마다 모양과 크기가 제각각이고,
 * 어떤 글꼴에서는 컬러 이모지로 바뀌어 흑백 톤을 깨뜨리며, 세로 정렬도 글꼴마다 다르다.
 * 직접 그린 16×16 SVG면 어디서나 같은 굵기 · 같은 자리다.
 *
 * 규칙 세 가지.
 * - 좌표계는 16×16 하나로 통일한다. 굵기가 서로 어긋나지 않는다.
 * - 색은 언제나 `currentColor`다. 버튼의 글자색을 그대로 따라가므로 상태(꺼짐 · 강조)가 저절로 맞는다.
 * - 면으로 볼 것(재생 · 정지)은 채우고, 획으로 볼 것(＋ × 화살표)은 선으로 그린다.
 */

/** 선으로 그리는 아이콘의 굵기. 이 값 하나로 전체 인상이 정해진다. */
const STROKE = 1.6;

interface IconShape {
  /** 채워서 그릴 path. */
  fill?: string;
  /** 선으로 그릴 path. */
  stroke?: string;
  /** 선 아이콘 중 끝을 둥글게 하지 않을 것. 기본은 둥글다. */
  sharp?: boolean;
}

export const ICONS = {
  /** 실행 취소 — 왼쪽으로 돌아가는 화살표. */
  undo: { stroke: "M4 6.5h5.2a3.3 3.3 0 1 1 0 6.6H5.6M6.7 4 4 6.5 6.7 9" },
  /** 다시 실행 — undo를 좌우로 뒤집은 것. */
  redo: { stroke: "M12 6.5H6.8a3.3 3.3 0 1 0 0 6.6h3.6M9.3 4 12 6.5 9.3 9" },

  /** 재생 — 오른쪽을 가리키는 삼각형. */
  play: { fill: "M5.2 3.4 12.6 8l-7.4 4.6z" },
  /** 일시정지 — 두 개의 기둥. */
  pause: { fill: "M5 3.6h2.1v8.8H5zM8.9 3.6H11v8.8H8.9z" },
  /** 정지 — 정사각형. */
  stop: { fill: "M4.6 4.6h6.8v6.8H4.6z" },
  /** 처음으로 — 벽에 부딪힌 삼각형. */
  rewind: { fill: "M3.8 3.6h1.7v8.8H3.8zM12.4 3.6 6.6 8l5.8 4.4z" },

  /** 더하기. */
  plus: { stroke: "M8 3.8v8.4M3.8 8h8.4" },
  /** 빼기 — 내보내기에서만 제외. */
  minus: { stroke: "M3.8 8h8.4" },
  /** 닫기 · 삭제. */
  close: { stroke: "M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2" },

  /** 칠하기 — 펜촉. */
  brush: { stroke: "M11.1 2.9 13.1 4.9 6.2 11.8 3.4 12.6 4.2 9.8zM9.6 4.4l2 2" },
  /** 지우개 — 기울인 지우개와 바닥선. */
  eraser: {
    stroke: "M6.4 12.4 2.9 8.9a.9.9 0 0 1 0-1.3l5-5a.9.9 0 0 1 1.3 0l3.5 3.5a.9.9 0 0 1 0 1.3l-4 4zM5.3 12.4h7.8",
  },

  /** 목록 손잡이 — 끌어서 옮길 수 있다는 표시. */
  grip: {
    fill: "M5.6 3.2a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1zM10.4 3.2a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1zM5.6 6.95a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1zM10.4 6.95a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1zM5.6 10.7a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1zM10.4 10.7a1.05 1.05 0 1 1 0 2.1 1.05 1.05 0 0 1 0-2.1z",
  },
} as const satisfies Record<string, IconShape>;

export type IconName = keyof typeof ICONS;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * 아이콘 하나를 만든다.
 *
 * 버튼 안에 넣어 쓴다. 읽어 주는 이름은 버튼 쪽 `aria-label`이 맡으므로
 * 아이콘 자체는 보조 기기에서 숨긴다 — 같은 것을 두 번 읽으면 방해가 된다.
 */
export function icon(name: IconName): SVGSVGElement {
  const shape: IconShape = ICONS[name];
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  if (shape.fill) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", shape.fill);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
  }

  if (shape.stroke) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", shape.stroke);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", String(STROKE));
    path.setAttribute("stroke-linecap", shape.sharp ? "butt" : "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }

  return svg;
}

/**
 * 버튼의 내용을 아이콘 하나로 갈아 끼운다.
 *
 * 재생 ↔ 일시정지처럼 상태에 따라 그림이 바뀌는 자리에 쓴다.
 * 같은 아이콘이면 아무것도 하지 않는다 — 매 프레임 다시 그리는 자리가 있기 때문이다.
 */
export function setIcon(element: HTMLElement, name: IconName): void {
  if (element.dataset.icon === name) return;
  element.dataset.icon = name;
  element.replaceChildren(icon(name));
}

/** 아이콘만 든 버튼. 읽어 주는 이름과 툴팁 제목은 `label` 하나로 맞춘다. */
export function iconButton(name: IconName, label: string, className?: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  if (className) button.className = className;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.dataset.icon = name;
  button.append(icon(name));
  return button;
}
