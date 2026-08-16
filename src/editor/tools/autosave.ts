/**
 * 브라우저에 작업 내용을 자동으로 담아 둔다. (기획서 37)
 *
 * 탭을 닫거나 브라우저가 죽어도 마지막 상태로 돌아올 수 있게 하는 것이 목적이다.
 * 저장 파일(`.puppet.zip`)을 대신하지는 않는다 — 다른 기기로 옮기려면 여전히 저장해야 한다.
 *
 * 의존성을 늘리지 않으려고 IndexedDB를 직접 쓴다. (기획서 63)
 * 저장은 한 칸뿐이다. 여러 프로젝트를 들고 다니는 것은 파일이 할 일이다.
 */
import { parseProject, serializeProject, type PuppetProject } from "@core/format";

const DB_NAME = "puppetforge";
const DB_VERSION = 1;
const STORE = "session";
const KEY = "current";

/** 담아 둔 작업 한 칸. */
export interface SavedSession {
  project: PuppetProject;
  /** 원본 이미지. 없으면 이미지를 불러오기 전에 닫은 것이다. */
  texture: Blob | null;
  savedAt: number;
}

/** IndexedDB에 실제로 들어가는 모양. 프로젝트는 문자열로 담는다. */
interface StoredSession {
  json: string;
  texture: Blob | null;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB를 열지 못했습니다."));
  });

  // 실패하면 다음에 다시 시도할 수 있게 약속을 버린다.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = body(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("저장소 작업에 실패했습니다."));
      }),
  );
}

/** 브라우저가 IndexedDB를 지원하는지. 사생활 보호 모드에서는 없을 수 있다. */
export function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * 지금 상태를 담아 둔다.
 *
 * 이미지는 프로젝트가 바뀔 때마다 다시 담지 않는다 —
 * 같은 이미지를 계속 쓰는 동안에는 `texture`에 `undefined`를 주면 그대로 둔다.
 */
export async function saveSession(
  project: PuppetProject,
  texture: Blob | null | undefined,
): Promise<void> {
  const previous = texture === undefined ? await readRaw() : null;
  await run("readwrite", (store) =>
    store.put(
      {
        json: serializeProject(project, false),
        texture: texture === undefined ? (previous?.texture ?? null) : texture,
        savedAt: Date.now(),
      } satisfies StoredSession,
      KEY,
    ),
  );
}

/** 담아 둔 것을 꺼낸다. 없거나 읽을 수 없으면 null이다. */
export async function loadSession(): Promise<SavedSession | null> {
  const raw = await readRaw();
  if (!raw) return null;

  try {
    return {
      project: parseProject(JSON.parse(raw.json)),
      texture: raw.texture,
      savedAt: raw.savedAt,
    };
  } catch {
    // 포맷이 맞지 않으면 조용히 버린다. 복구하려다 편집기가 열리지 않는 편이 나쁘다.
    await clearSession();
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await run("readwrite", (store) => store.delete(KEY));
}

async function readRaw(): Promise<StoredSession | null> {
  try {
    return (await run<StoredSession | undefined>("readonly", (store) => store.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

/**
 * 잦은 변경을 모아 한 번만 저장한다.
 *
 * 관절을 끌거나 영향 영역을 칠하는 동안에는 상태가 초당 수십 번 바뀐다.
 * 그때마다 저장하면 디스크만 긁으므로 손을 멈춘 뒤에 한 번 담는다. (기획서 37)
 */
export function createAutosave(delayMs = 1200) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => Promise<void>) | null = null;
  let running = false;

  const flush = async (): Promise<void> => {
    const job = pending;
    pending = null;
    if (!job || running) return;

    running = true;
    try {
      await job();
    } catch {
      // 저장에 실패해도 편집을 막지 않는다. 다음 변경 때 다시 시도한다.
    } finally {
      running = false;
    }
  };

  return {
    /** 나중에 저장하도록 예약한다. 예약이 겹치면 마지막 것만 남는다. */
    schedule(job: () => Promise<void>): void {
      pending = job;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, delayMs);
    },

    /** 기다리지 않고 지금 저장한다. 탭을 닫을 때 쓴다. */
    async flushNow(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
    },

    /** 예약을 취소한다. 새 프로젝트로 갈아탈 때 옛 상태가 덮어쓰지 않게 한다. */
    cancel(): void {
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/** "3분 전"처럼 사람이 읽는 시각. 상태줄에 그대로 쓴다. */
export function describeSavedAt(savedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 60) return "방금";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}
