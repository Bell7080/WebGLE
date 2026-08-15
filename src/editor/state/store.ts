import {
  createEmptyProject,
  DEFAULT_OVERLAY_VISIBILITY,
  type OverlayVisibility,
  type PuppetProject,
} from "@core/format";
import type { WeightMap } from "@core/weight";

/** 영향 영역 브러시. 크기와 가중치를 불투명도처럼 쓴다. */
export interface BrushState {
  /** 칠하기 모드가 켜져 있는지. */
  active: boolean;
  /** 브러시 반경(이미지 픽셀). */
  size: number;
  /** 한 번 칠할 때 쌓이는 양 1~100. 10이면 열 번 칠해야 가득 찬다. */
  amount: number;
  erase: boolean;
}

export const DEFAULT_BRUSH: BrushState = {
  active: false,
  size: 40,
  amount: 25,
  erase: false,
};

export interface EditorState {
  project: PuppetProject;
  /** 불러온 이미지의 Object URL. 이미지가 없으면 null. */
  textureUrl: string | null;
  /** 캔버스에 무엇을 표시할지. 조작 모드가 아니라 표시 여부다. */
  visibility: OverlayVisibility;
  selectedBoneId: string | null;
  /** 편집 중인 원본 가중치. 저장할 때 정규화해서 mesh.weights에 넣는다. */
  weights: WeightMap;
  brush: BrushState;
  /** 재생 중인 애니메이션 이름. 없으면 null. */
  playing: string | null;
}

type Listener = (state: EditorState) => void;

/**
 * 편집기 전역 상태.
 * UI는 이 스토어만 구독하고, 코어 로직은 스토어를 몰라도 되게 유지한다. (기획서 62)
 */
export class EditorStore {
  private state: EditorState;
  private listeners = new Set<Listener>();

  constructor(initial?: Partial<EditorState>) {
    this.state = {
      project: createEmptyProject(),
      textureUrl: null,
      visibility: { ...DEFAULT_OVERLAY_VISIBILITY },
      selectedBoneId: null,
      weights: {},
      brush: { ...DEFAULT_BRUSH },
      playing: null,
      ...initial,
    };
  }

  get(): Readonly<EditorState> {
    return this.state;
  }

  set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  /** 프로젝트를 불변 갱신한다. */
  update(updater: (project: PuppetProject) => PuppetProject): void {
    this.set({ project: updater(this.state.project) });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
}
