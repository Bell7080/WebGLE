import {
  createEmptyProject,
  DEFAULT_OVERLAY_VISIBILITY,
  type OverlayVisibility,
  type PuppetProject,
} from "@core/format";
import type { WeightMap } from "@core/weight";

/** 영향 영역 편집 도구. 같은 버튼을 다시 누르면 꺼진다. */
export type PaintTool = "brush" | "eraser";

/** 영향 영역 브러시. 크기와 가중치를 불투명도처럼 쓴다. */
export interface BrushState {
  /** 켜져 있는 도구. null이면 편집 꺼짐(관절 조작). */
  tool: PaintTool | null;
  /** 브러시 반경(이미지 픽셀). */
  size: number;
  /** 한 번 칠할 때 쌓이는 양 1~100. 10이면 열 번 칠해야 가득 찬다. */
  amount: number;
}

export const DEFAULT_BRUSH: BrushState = {
  tool: null,
  // 크기 선택 버튼에 있는 값으로 맞춰 둔다.
  size: 45,
  amount: 25,
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
  /** 정점이 이미지의 그려진 영역 안에 있는지. 칠하기를 실루엣 안으로 제한한다. */
  mask: boolean[] | null;
  brush: BrushState;
  /** 재생 중인 애니메이션 이름. 없으면 null. */
  playing: string | null;
  /** 속도 · 강도를 조절할 대상. 재생을 멈춰도 남아 있다. */
  selectedAnimation: string | null;
  /** 도트 그림인지 자동으로 판정한 근거. 화면에 그대로 보여 준다. */
  pixelArtReason: string | null;
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
      mask: null,
      brush: { ...DEFAULT_BRUSH },
      playing: null,
      selectedAnimation: null,
      pixelArtReason: null,
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
