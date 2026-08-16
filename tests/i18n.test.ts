import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatAnimationSummary,
  formatPresetMeta,
  formatTagMultiplier,
  formatTagUsage,
  LANGUAGES,
  setLanguage,
  translate,
  translatePresetDescription,
  translateTagDescription,
} from "../src/editor/i18n";
import { TAG_DESCRIPTIONS } from "../src/core/format";

/** Node 테스트에 브라우저와 같은 최소 localStorage를 두어 언어 선택을 검증한다. */
const values = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
});
vi.stubGlobal("navigator", { language: "en-US" });

afterEach(() => values.clear());

describe("tooltip translations", () => {
  it("translates timeline tooltip text in the selected language", () => {
    setLanguage("en");
    expect(translate("재생 / 일시정지")).toBe("Play / Pause");

    setLanguage("ja");
    expect(translate("시간 축")).toBe("タイムライン");

    setLanguage("fr");
    expect(translate("처음으로")).toBe("Aller au début");
  });

  /** 동적 패널의 대표 버튼들이 어느 언어에서도 한국어로 남지 않는지 검증한다. */
  it.each(LANGUAGES.filter(({ code }) => code !== "ko"))(
    "translates dynamic controls in $name",
    ({ code }) => {
      setLanguage(code);
      for (const source of ["애니메이션 없음", "영향 영역", "칠하기", "지우개", "변형"]) {
        expect(translate(source), source).not.toBe(source);
      }
    },
  );

  /** 사용자가 지적한 격자·전체 보기·태그 툴팁의 영어 누락을 직접 회귀 검증한다. */
  it("translates mesh controls, show-all, presets, and tag descriptions to English", () => {
    setLanguage("en");
    expect(["최소", "낮음", "보통", "높음"].map(translate)).toEqual([
      "Minimum", "Low", "Medium", "High",
    ]);
    expect(translate("전체 보기")).toBe("Show all");
    expect(translate("숨쉬듯 미세하게 흔들린다")).toBe("Sways subtly as if breathing.");
    expect(translateTagDescription("root", TAG_DESCRIPTIONS.root!)).not.toMatch(/[가-힣]/);
  });

  /** 카탈로그의 고정·동적 설명이 지원 언어 어느 쪽에서도 한국어로 되돌아가지 않게 한다. */
  it.each(LANGUAGES.filter(({ code }) => code !== "ko"))(
    "localizes catalog tooltips and dynamic values in $name",
    ({ code }) => {
      setLanguage(code);
      const localized = [
        translate("걷기"),
        translate("중심 · 구조"),
        translatePresetDescription(translate("걷기"), "위아래로 튀며 팔다리를 번갈아 흔든다"),
        translateTagDescription("root", TAG_DESCRIPTIONS.root!),
        translateTagDescription("heavy", TAG_DESCRIPTIONS.heavy!),
        formatTagMultiplier(1.6),
        formatTagUsage([translate("걷기")]),
        formatAnimationSummary(1, true, 3),
        formatPresetMeta("summary", false, "root leg"),
      ];
      for (const text of localized) expect(text).not.toMatch(/[가-힣]/);
    },
  );
});
