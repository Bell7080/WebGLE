/**
 * 좁은 세로 화면 대응. (모바일)
 *
 * 데스크톱은 캔버스 양옆에 패널을 둘 수 있지만, 세로로 긴 화면에서 그렇게 하면
 * 캔버스가 손톱만 해진다. 기획서 33의 "캔버스가 가장 크게 보인다"를 지키려면
 * 패널을 화면 밖으로 내리고 필요할 때만 아래에서 끌어 올려야 한다.
 *
 * 배치 자체는 CSS가 하고, 여기서는 "지금 어느 시트가 올라와 있는지"만 관리한다.
 * 그 상태는 `#app`의 `data-sheet` 값 하나로 표현된다 — 없으면 둘 다 내려가 있다.
 */

/** 아래에서 올라오는 패널. `null`이면 둘 다 내려가 있다. */
export type Sheet = "left" | "right" | null;

/**
 * 세로형 배치로 바뀌는 조건. `src/style.css`의 media query와 같은 문장이어야 한다.
 *
 * 폭뿐 아니라 높이도 본다 — 휴대폰을 옆으로 눕히면 폭은 넉넉해지지만
 * 세로가 400px대라, 좌우 패널을 두면 캔버스가 화면의 3분의 1로 줄어든다.
 */
export const NARROW_QUERY = "(max-width: 760px), (max-height: 520px)";

export interface MobileShell {
  open(sheet: Sheet): void;
  close(): void;
  get current(): Sheet;
  /** 지금 세로형 배치인지. 화면을 돌리면 값이 달라진다. */
  get isNarrow(): boolean;
}

/**
 * 하단 탭과 시트를 연결한다.
 *
 * 데스크톱에서도 붙여 두지만 탭이 CSS로 숨겨져 있어 아무 일도 하지 않는다.
 * 폭에 따라 코드를 갈라 두면 창 크기를 바꿨을 때 한쪽이 죽는다.
 */
export function setupMobileShell(
  app: HTMLElement,
  tabs: HTMLElement,
  canvasArea: HTMLElement,
): MobileShell {
  const buttons = [...tabs.querySelectorAll<HTMLButtonElement>("button[data-sheet]")];

  const sync = () => {
    const current = (app.dataset.sheet as Sheet) ?? null;
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.sheet === current));
    }
  };

  const open = (sheet: Sheet) => {
    if (sheet === null) delete app.dataset.sheet;
    else app.dataset.sheet = sheet;
    sync();
  };

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const target = button.dataset.sheet as Exclude<Sheet, null>;
      // 같은 탭을 다시 누르면 내려간다.
      open(app.dataset.sheet === target ? null : target);
    });
  }

  // 캔버스를 만지면 시트를 내린다. 그림을 보려고 만진 것이기 때문이다.
  canvasArea.addEventListener(
    "pointerdown",
    () => {
      if (app.dataset.sheet) open(null);
    },
    // 캔버스 자신의 조작을 막지 않도록 잡아채지 않고 흘려 보낸다.
    { capture: true, passive: true },
  );

  sync();

  return {
    open,
    close: () => open(null),
    get current(): Sheet {
      return (app.dataset.sheet as Sheet) ?? null;
    },
    get isNarrow(): boolean {
      return window.matchMedia(NARROW_QUERY).matches;
    },
  };
}
