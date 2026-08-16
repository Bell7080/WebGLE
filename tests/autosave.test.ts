/**
 * 자동 저장의 순수한 부분. (기획서 37)
 *
 * IndexedDB 자체는 브라우저에서 확인하고, 여기서는 모아 저장하는 규칙과
 * 시각 표시만 본다. 이 둘이 틀리면 저장이 너무 잦거나 아예 안 된다.
 */
import { describe, expect, it, vi } from "vitest";
import { createAutosave, describeSavedAt } from "../src/editor/tools/autosave";

describe("모아 저장하기", () => {
  it("연달아 바뀌면 마지막 것 한 번만 저장한다", async () => {
    vi.useFakeTimers();
    const done: number[] = [];
    const autosave = createAutosave(100);

    for (const n of [1, 2, 3]) {
      autosave.schedule(async () => {
        done.push(n);
      });
      await vi.advanceTimersByTimeAsync(40);
    }
    await vi.advanceTimersByTimeAsync(200);

    expect(done).toEqual([3]);
    vi.useRealTimers();
  });

  it("손을 멈추기 전에는 저장하지 않는다", async () => {
    vi.useFakeTimers();
    let saved = false;
    const autosave = createAutosave(100);
    autosave.schedule(async () => {
      saved = true;
    });

    await vi.advanceTimersByTimeAsync(60);
    expect(saved).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    expect(saved).toBe(true);
    vi.useRealTimers();
  });

  it("기다리지 않고 바로 저장할 수 있다", async () => {
    let saved = false;
    const autosave = createAutosave(10_000);
    autosave.schedule(async () => {
      saved = true;
    });

    await autosave.flushNow();
    expect(saved).toBe(true);
  });

  it("취소하면 저장하지 않는다", async () => {
    let saved = false;
    const autosave = createAutosave(10_000);
    autosave.schedule(async () => {
      saved = true;
    });

    autosave.cancel();
    await autosave.flushNow();
    expect(saved).toBe(false);
  });

  it("저장에 실패해도 편집을 막지 않는다", async () => {
    const autosave = createAutosave(1);
    autosave.schedule(async () => {
      throw new Error("저장소가 가득 찼습니다");
    });

    await expect(autosave.flushNow()).resolves.toBeUndefined();

    // 다음 저장은 정상으로 돌아온다.
    let saved = false;
    autosave.schedule(async () => {
      saved = true;
    });
    await autosave.flushNow();
    expect(saved).toBe(true);
  });

  it("아무것도 예약하지 않았으면 아무 일도 없다", async () => {
    await expect(createAutosave(1).flushNow()).resolves.toBeUndefined();
  });
});

describe("저장 시각 표시", () => {
  const 지금 = 1_700_000_000_000;
  const 전 = (seconds: number) => describeSavedAt(지금 - seconds * 1000, 지금);

  it("1분 안이면 방금이다", () => {
    expect(전(0)).toBe("방금");
    expect(전(45)).toBe("방금");
  });

  it("분 · 시간 · 일로 올라간다", () => {
    expect(전(60 * 3)).toBe("3분 전");
    expect(전(3600 * 2)).toBe("2시간 전");
    expect(전(86400 * 3)).toBe("3일 전");
  });

  it("시계가 어긋나 미래로 보여도 방금으로 둔다", () => {
    expect(describeSavedAt(지금 + 5000, 지금)).toBe("방금");
  });
});
