import { createEmptyProject, type EditMode, type PuppetProject } from "@core/format";

export interface EditorState {
  project: PuppetProject;
  /** 불러온 이미지의 Object URL. 이미지가 없으면 null. */
  textureUrl: string | null;
  mode: EditMode;
  selectedBoneId: string | null;
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
      mode: "bone",
      selectedBoneId: null,
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
