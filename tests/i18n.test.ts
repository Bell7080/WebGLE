import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage, translate } from "../src/editor/i18n";

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
});
