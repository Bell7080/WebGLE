import {
  OVERLAY_LAYERS,
  PART_NAMES,
  ROOT_PART,
  TAG_CATALOG,
  TAG_DESCRIPTIONS,
  TAG_GROUPS,
  type OverlayLayer,
  type PuppetBone,
} from "@core/format";
import { canReparent } from "@core/skeleton";
import type { BrushState, EditorStore } from "../state/store";
import { createColorWheel } from "./colorWheel";
import { findPreset, PRESETS } from "../../presets";
import { attachTooltip, hideTooltip } from "./tooltip";

/** 이 태그를 실제로 쓰는 애니메이션 이름들. 툴팁 아래에 붙여 준다. */
function animationsUsingTag(tag: string): string {
  const users = PRESETS.filter((preset) =>
    preset.animation.tracks.some(
      (track) => track.target.kind === "tag" && track.target.tag === tag,
    ),
  ).map((preset) => preset.label);

  return users.length > 0
    ? `이 태그를 쓰는 동작: ${users.join(" · ")}`
    : "아직 이 태그를 쓰는 기본 동작은 없습니다";
}

/** 프리셋 id의 한국어 이름. 목록에 없는 것(직접 만든 것)은 id를 그대로 쓴다. */
function presetLabel(id: string): string {
  return findPreset(id)?.label ?? id;
}

/** 길이 · 반복 · 트랙 수를 한 줄로. */
function describeAnimation(animation: { duration: number; loop: boolean; tracks: unknown[] }): string {
  return `${animation.duration}초 · ${animation.loop ? "반복" : "한 번"} · 트랙 ${animation.tracks.length}개`;
}

/** 이 애니메이션이 찾는 태그들. */
function usedTags(animation: { tracks: { target: { kind: string; tag?: string } }[] }): string {
  const tags = new Set<string>();
  for (const track of animation.tracks) {
    if (track.target.kind === "tag" && track.target.tag) tags.add(track.target.tag);
  }
  return [...tags].join(" ");
}

export interface EditorUICallbacks {
  onAddBone(part: string): void;
  onDeleteBone(boneId: string): void;
  onUpdateBone(boneId: string, patch: Partial<PuppetBone>): void;
  /** 목록에서 끌어 옮긴 결과. targetId 앞/뒤로 옮긴다. */
  onReorderBone(boneId: string, targetId: string, place: "before" | "after"): void;
  onMenu(action: string): void;
  onPlay(animationId: string): void;
  onStop(): void;
  onAddAnimation(presetId: string): void;
  onRenameAnimation(animationId: string, name: string): void;
  onRemoveAnimation(animationId: string): void;
  onToggleAnimationHidden(animationId: string): void;
  onExport(): void;
  onBrushChange(patch: Partial<BrushState>): void;
}

/** 변형 방식 선택지. 짧은 이름은 버튼에, 나머지는 툴팁에 쓴다. */
const DEFORM_OPTIONS = [
  {
    id: "soft",
    short: "부드럽게",
    label: "움직이고 휜다",
    help: "이웃 관절과 가중치를 섞어 자연스럽게 휘고 찌그러집니다. 대부분의 살아 있는 부위가 여기 해당합니다.",
    examples: "몸통 · 팔 · 다리 · 꼬리 · 촉수",
  },
  {
    id: "rigid",
    short: "형태 유지",
    label: "움직이되 안 휜다",
    help: "위치 · 회전 · 크기는 따라가지만 형태는 그대로 유지합니다. 찌그러지면 어색해지는 단단한 물건에 씁니다.",
    examples: "검 · 방패 · 왕관 · 안경 · 뿔",
  },
  {
    id: "pinnedSoft",
    short: "위치 고정",
    label: "제자리, 경계는 부드럽게",
    help: "자기와 부모의 움직임을 무시하고 원래 자리를 지킵니다. 다만 이웃이 칠한 부분과의 경계는 부드럽게 휘어 이어집니다.",
    examples: "바닥을 딛은 발 · 벽에 붙은 부위",
  },
  {
    id: "fixed",
    short: "완전 고정",
    label: "위치도 형태도 그대로",
    help: "다른 관절이 겹쳐 칠해도 원래 좌표를 우선합니다. 절대 움직이면 안 되는 곳에만 쓰세요. 가장자리가 딱딱하게 끊겨 보일 수 있습니다.",
    examples: "바닥 접점 · 고정된 받침",
  },
] as const satisfies readonly { id: PuppetBone["deform"]; short: string; label: string; help: string; examples: string }[];

/**
 * 브러시 크기 선택지(이미지 픽셀). 그림 도구처럼 점 크기로 고른다.
 * 한 줄에 일곱 개씩 네 줄, 스물여덟 단계다. 작은 쪽은 촘촘하게, 큰 쪽은 성기게 나눈다.
 */
const BRUSH_SIZES = [
  2, 3, 4, 5, 6, 8, 10,
  12, 15, 18, 22, 27, 33, 40,
  48, 58, 70, 84, 100, 120, 145,
  175, 210, 250, 300, 355, 420, 500,
] as const;

/** 크기 버튼에 그릴 점의 지름 범위(px). */
const DOT_MIN = 4;
const DOT_MAX = 26;

/** 브러시 크기를 0~1로 옮긴다. 선택지가 등비에 가까우므로 로그로 재야 고르게 벌어진다. */
function dotScale(size: number): number {
  const min = Math.log(BRUSH_SIZES[0]);
  const max = Math.log(BRUSH_SIZES[BRUSH_SIZES.length - 1]!);
  return (Math.log(size) - min) / (max - min);
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`UI 요소를 찾을 수 없습니다: #${id}`);
  return element as T;
}

/**
 * DOM 편집기 UI. 모든 문자열은 한국어다. (기획서 33)
 * 상태는 EditorStore에서만 읽고, 변경은 콜백으로 위임한다.
 */
export class EditorUI {
  private readonly layerToggles = requireElement<HTMLDivElement>("layerToggles");
  private readonly boneList = requireElement<HTMLUListElement>("boneList");
  private readonly boneHint = requireElement<HTMLParagraphElement>("boneHint");
  private readonly inspector = requireElement<HTMLDivElement>("inspector");
  private readonly animButtons = requireElement<HTMLDivElement>("animButtons");
  private readonly animPicker = requireElement<HTMLDivElement>("animPicker");
  private readonly statusText = requireElement<HTMLSpanElement>("statusText");
  private readonly dropzone = requireElement<HTMLDivElement>("dropzone");
  private readonly addBoneButton = requireElement<HTMLButtonElement>("addBoneButton");
  private partSelect!: HTMLSelectElement;
  private draggingBoneId: string | null = null;
  /** 원형 팔레트를 펼쳐 둔 관절. */
  private colorOpenBoneId: string | null = null;
  /** 태그 고르기 패널을 펼쳐 둔 관절. */
  private tagPickerBoneId: string | null = null;
  /** 애니메이션 추가 목록을 펼쳤는지. */
  private animPickerOpen = false;
  /** 마지막으로 그린 애니메이션 목록의 모양. 같으면 다시 그리지 않는다. */
  private animSignature = "";

  constructor(
    private readonly store: EditorStore,
    private readonly callbacks: EditorUICallbacks,
  ) {
    this.buildLayerToggles();
    this.buildAnimButtons();
    this.buildPartSelect();
    this.bindMenu();

    this.store.subscribe(() => this.render());
  }

  setStatus(message: string): void {
    this.statusText.textContent = message;
  }

  /** 상단 우측 표시 토글. 기본은 모두 켜짐이고, 끄면 캔버스에서 감춘다. */
  private buildLayerToggles(): void {
    for (const layer of OVERLAY_LAYERS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = layer.label;
      button.dataset.layer = layer.id;
      button.title = `${layer.label} 표시 켜기 / 끄기`;
      button.addEventListener("click", () => this.toggleLayer(layer.id));
      this.layerToggles.append(button);
    }
  }

  private toggleLayer(layer: OverlayLayer): void {
    const visibility = this.store.get().visibility;
    this.store.set({ visibility: { ...visibility, [layer]: !visibility[layer] } });
  }

  private buildAnimButtons(): void {
    requireElement<HTMLButtonElement>("playButton").addEventListener("click", () => {
      const first = Object.keys(this.store.get().project.animations)[0];
      if (first) this.callbacks.onPlay(first);
    });
    requireElement<HTMLButtonElement>("stopButton").addEventListener("click", () =>
      this.callbacks.onStop(),
    );
  }

  /**
   * 하단 애니메이션 목록. 프로젝트가 가진 것만 보여 준다. (기획서 30)
   * 각 칸: 이름을 누르면 재생, `−`는 내보내기에서만 빼기(숨김), `×`는 아예 삭제.
   */
  /** 이름 칸을 입력창으로 바꿔 즉석에서 고친다. */
  private startRename(anchor: HTMLElement, id: string): void {
    hideTooltip();

    const input = document.createElement("input");
    input.type = "text";
    input.className = "anim-rename";
    input.value = id;
    input.size = Math.max(6, id.length);

    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.replaceWith(anchor);
      this.animSignature = "";
      if (commit && value && value !== id) this.callbacks.onRenameAnimation(id, value);
      else this.render();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));

    anchor.replaceWith(input);
    input.focus();
    input.select();
  }

  private renderAnimations(): void {
    const { project, playing } = this.store.get();
    const entries = Object.entries(project.animations);

    // 목록 구성이 그대로면 재생 표시만 바꾼다.
    // 통째로 다시 그리면 그 사이에 눌린 더블클릭이 사라져 이름 바꾸기가 안 된다.
    const signature = `${entries
      .map(([id, animation]) => `${id}:${animation.hidden ? 1 : 0}`)
      .join(",")}|${this.animPickerOpen}`;

    if (signature === this.animSignature) {
      for (const item of this.animButtons.querySelectorAll<HTMLElement>(".anim-item")) {
        item.classList.toggle("playing", item.dataset.animId === playing);
      }
      return;
    }
    this.animSignature = signature;
    this.animButtons.replaceChildren();
    for (const [id, animation] of entries) {
      const item = document.createElement("div");
      item.className = "anim-item";
      item.dataset.animId = id;
      if (animation.hidden) item.classList.add("hidden-anim");
      if (playing === id) item.classList.add("playing");

      const play = document.createElement("button");
      play.type = "button";
      play.className = "anim-play";
      play.textContent = id;
      attachTooltip(play, {
        title: id,
        body: `${describeAnimation(animation)}${
          animation.hidden ? " · 지금은 내보내기에서 제외됨" : ""
        }`,
        meta: "누르면 재생 · 더블클릭하면 이름 변경 (게임에서 부를 이름입니다)",
      });
      play.addEventListener("click", () => this.callbacks.onPlay(id));
      play.addEventListener("dblclick", () => this.startRename(play, id));

      const hide = document.createElement("button");
      hide.type = "button";
      hide.className = "anim-hide";
      hide.textContent = animation.hidden ? "+" : "−";
      hide.title = animation.hidden
        ? "내보내기에 다시 포함"
        : "내보내기에서만 빼기 (파일에는 남는다)";
      hide.setAttribute("aria-label", hide.title);
      hide.addEventListener("click", () => this.callbacks.onToggleAnimationHidden(id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "anim-remove";
      remove.textContent = "×";
      remove.title = `${presetLabel(id)} 삭제`;
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", () => this.callbacks.onRemoveAnimation(id));

      item.append(play, hide, remove);
      this.animButtons.append(item);
    }

    if (entries.length === 0) {
      const empty = document.createElement("span");
      empty.className = "anim-empty";
      empty.textContent = "애니메이션 없음";
      this.animButtons.append(empty);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "anim-add";
    add.textContent = this.animPickerOpen ? "닫기" : "+";
    add.title = "애니메이션 추가";
    add.addEventListener("click", () => {
      this.animPickerOpen = !this.animPickerOpen;
      this.render();
    });
    this.animButtons.append(add);

    this.animPicker.replaceChildren();
    this.animPicker.classList.toggle("open", this.animPickerOpen);
    if (!this.animPickerOpen) return;

    for (const group of ["기본", "공격"] as const) {
      const column = document.createElement("div");
      column.className = "anim-group";

      const title = document.createElement("h4");
      title.textContent = group;
      column.append(title);

      const row = document.createElement("div");
      row.className = "anim-group-items";

      for (const preset of PRESETS.filter((candidate) => candidate.group === group)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "outlined";
        button.textContent = preset.label;
        attachTooltip(button, {
          title: `${preset.label} (${preset.id})`,
          body: preset.description,
          meta: `${describeAnimation(preset.animation)} · 쓰는 태그: ${usedTags(preset.animation)}`,
        });
        button.addEventListener("click", () => {
          this.callbacks.onAddAnimation(preset.id);
          this.animPickerOpen = false;
          this.render();
        });
        row.append(button);
      }

      column.append(row);
      this.animPicker.append(column);
    }
  }

  /** 어떤 파츠를 추가할지 고르는 목록. (기획서 9) */
  private buildPartSelect(): void {
    this.partSelect = document.createElement("select");
    this.partSelect.className = "part-select";
    for (const part of PART_NAMES) {
      const option = document.createElement("option");
      option.value = part;
      option.textContent = part;
      this.partSelect.append(option);
    }
    this.addBoneButton.before(this.partSelect);
    this.addBoneButton.addEventListener("click", () =>
      this.callbacks.onAddBone(this.partSelect.value),
    );
  }

  private bindMenu(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-menu]")) {
      button.addEventListener("click", () => this.callbacks.onMenu(button.dataset.menu ?? ""));
    }
  }

  private render(): void {
    hideTooltip();
    const { project, visibility, selectedBoneId, textureUrl } = this.store.get();

    for (const button of this.layerToggles.querySelectorAll("button")) {
      const on = visibility[button.dataset.layer as OverlayLayer] ?? true;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }

    this.dropzone.classList.toggle("hidden", textureUrl !== null);
    this.addBoneButton.disabled = textureUrl === null;

    // 첫 관절은 캐릭터 전체의 기준이 되므로 `중심`으로 고정한다.
    const firstBone = project.bones.length === 0;
    this.partSelect.disabled = textureUrl === null || firstBone;
    if (firstBone) this.partSelect.value = ROOT_PART;
    this.partSelect.title = firstBone
      ? "첫 관절은 캐릭터 전체의 기준(중심)이 됩니다"
      : "추가할 파츠 고르기";

    this.renderAnimations();
    this.renderBoneList(project.bones, selectedBoneId);
    this.renderInspector(project.bones, selectedBoneId);
  }

  private renderBoneList(bones: readonly PuppetBone[], selectedBoneId: string | null): void {
    this.boneList.replaceChildren();

    const depthOf = (bone: PuppetBone): number => {
      let depth = 0;
      let cursor = bone.parentId;
      const guard = new Set<string>();
      while (cursor && !guard.has(cursor)) {
        guard.add(cursor);
        depth += 1;
        cursor = bones.find((b) => b.id === cursor)?.parentId ?? null;
      }
      return depth;
    };

    for (const bone of bones) {
      this.boneList.append(this.boneRow(bone, depthOf(bone), bone.id === selectedBoneId));
    }

    this.boneHint.textContent =
      bones.length === 0
        ? "이미지를 불러온 뒤 관절을 추가하세요."
        : `관절 ${bones.length}개 · 끌어서 순서 변경`;
  }

  /** 관절 목록의 한 줄. 드래그로 순서를 바꾸고 ×로 삭제한다. */
  private boneRow(bone: PuppetBone, depth: number, selected: boolean): HTMLLIElement {
    const row = document.createElement("li");
    row.className = "bone-row";
    row.dataset.boneId = bone.id;
    row.draggable = true;
    row.title = bone.tags.length > 0 ? bone.tags.join(", ") : "태그 없음";
    row.classList.toggle("selected", selected);
    row.style.paddingLeft = `${10 + depth * 12}px`;
    row.addEventListener("click", () => this.store.set({ selectedBoneId: bone.id }));

    const grip = document.createElement("span");
    grip.className = "grip";
    grip.textContent = "⠿";
    grip.setAttribute("aria-hidden", "true");

    const dot = document.createElement("span");
    dot.className = "bone-color";
    dot.style.background = bone.color;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = bone.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove";
    remove.textContent = "×";
    remove.title = `${bone.name} 삭제`;
    remove.setAttribute("aria-label", `${bone.name} 삭제`);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      this.callbacks.onDeleteBone(bone.id);
    });

    row.append(grip, dot, name, remove);
    this.bindRowDrag(row, bone.id);
    return row;
  }

  private bindRowDrag(row: HTMLLIElement, boneId: string): void {
    row.addEventListener("dragstart", (event) => {
      this.draggingBoneId = boneId;
      row.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", boneId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });

    row.addEventListener("dragend", () => {
      this.draggingBoneId = null;
      this.clearDropMarks();
      row.classList.remove("dragging");
    });

    row.addEventListener("dragover", (event) => {
      if (!this.draggingBoneId || this.draggingBoneId === boneId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

      const bounds = row.getBoundingClientRect();
      const after = event.clientY > bounds.top + bounds.height / 2;
      this.clearDropMarks();
      row.classList.add(after ? "drop-after" : "drop-before");
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = this.draggingBoneId ?? event.dataTransfer?.getData("text/plain");
      const place = row.classList.contains("drop-after") ? "after" : "before";
      this.clearDropMarks();
      if (!draggedId || draggedId === boneId) return;
      this.callbacks.onReorderBone(draggedId, boneId, place);
    });
  }

  private clearDropMarks(): void {
    for (const row of this.boneList.querySelectorAll(".bone-row")) {
      row.classList.remove("drop-before", "drop-after");
    }
  }

  private renderInspector(bones: readonly PuppetBone[], selectedBoneId: string | null): void {
    this.inspector.replaceChildren();
    const bone = bones.find((b) => b.id === selectedBoneId);
    if (!bone) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "선택된 관절이 없습니다.";
      this.inspector.append(hint);
      return;
    }

    this.inspector.append(
      this.textField("이름", bone.name, (value) =>
        this.callbacks.onUpdateBone(bone.id, { name: value }),
      ),
      this.colorField(bone),
      this.parentField(bones, bone),
      this.tagsField(bone),
      this.numberField("강도", bone.motionStrength, (value) =>
        this.callbacks.onUpdateBone(bone.id, { motionStrength: value }),
      ),
      this.deformField(bone),
    );

    if (this.tagPickerBoneId === bone.id) {
      this.inspector.append(this.tagPicker(bone));
    }

    if (this.colorOpenBoneId === bone.id) {
      this.inspector.append(
        createColorWheel(bone.color, (color) =>
          this.callbacks.onUpdateBone(bone.id, { color }),
        ),
      );
    }

    const coords = document.createElement("p");
    coords.className = "hint";
    coords.textContent = `위치 ${Math.round(bone.x)}, ${Math.round(bone.y)}`;
    this.inspector.append(coords, this.weightSection(bone));
  }

  /**
   * 영향 영역 칠하기. (기획서 16, 18)
   * 상단 토글은 표시 여부만 담당하므로, 실제 칠하는 조작은 여기에 둔다.
   */
  private weightSection(bone: PuppetBone): HTMLElement {
    const { brush, project } = this.store.get();
    const section = document.createElement("section");
    section.className = "section";

    const title = document.createElement("h3");
    title.textContent = "영향 영역";
    section.append(title);

    if (!project.mesh) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "이미지를 먼저 불러오세요.";
      section.append(hint);
      return section;
    }

    // 칠하기 / 지우개는 한 줄에 모은 아이콘 토글이다.
    // 같은 것을 다시 누르면 꺼지고, 다른 것을 누르면 그쪽으로 바뀐다.
    const tools = document.createElement("div");
    tools.className = "tool-row";
    tools.append(
      this.toolButton("brush", "✎", "칠하기", brush.tool === "brush"),
      this.toolButton("eraser", "⌫", "지우개", brush.tool === "eraser"),
    );
    section.append(tools);

    // 가중치가 먼저다. 한 번에 얼마나 쌓을지가 크기보다 자주 바뀐다.
    section.append(this.weightMeter(brush.amount), this.brushSizes(brush.size, brush.amount));

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent =
      brush.tool === "brush"
        ? `${bone.name}에 칠하는 중 · 캔버스를 드래그하세요`
        : brush.tool === "eraser"
          ? `${bone.name}에서 지우는 중 · 캔버스를 드래그하세요`
          : "칠하기나 지우개를 켜면 캔버스 드래그가 영역 편집으로 바뀝니다.";
    section.append(hint);

    return section;
  }

  private toolButton(
    tool: "brush" | "eraser",
    icon: string,
    label: string,
    active: boolean,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = active ? "tool active-fill" : "tool";
    button.title = active ? `${label} 끄기` : label;
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", label);

    const glyph = document.createElement("span");
    glyph.className = "glyph";
    glyph.textContent = icon;
    const text = document.createElement("span");
    text.textContent = label;
    button.append(glyph, text);

    button.addEventListener("click", () =>
      this.callbacks.onBrushChange({ tool: active ? null : tool }),
    );
    return button;
  }

  /** 관절 색. 원형 팔레트는 색 견본을 누를 때만 펼친다. */
  private colorField(bone: PuppetBone): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-color";

    const label = document.createElement("label");
    label.textContent = "색";

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.background = bone.color;
    swatch.title = "색 고르기";
    swatch.setAttribute("aria-expanded", String(this.colorOpenBoneId === bone.id));

    swatch.addEventListener("click", () => {
      this.colorOpenBoneId = this.colorOpenBoneId === bone.id ? null : bone.id;
      this.render();
    });

    wrapper.append(label, swatch);
    return wrapper;
  }

  /**
   * 가중치 그래프. 한 번 칠할 때 쌓이는 양이다.
   * 막대를 누르거나 끌어 정한다. 10이면 열 번 칠해야 가득 찬다.
   */
  private weightMeter(value: number): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-meter";

    const label = document.createElement("label");
    label.textContent = "가중치";
    attachTooltip(label, {
      title: "가중치",
      body: "한 번 칠할 때 더해지는 양입니다. 10이면 열 번 겹쳐 칠해야 가득 차고, 100이면 한 번에 최대가 됩니다.",
      meta: "지우개도 같은 값만큼 깎아냅니다",
    });

    const meter = document.createElement("div");
    meter.className = "meter";
    meter.setAttribute("role", "slider");
    meter.setAttribute("aria-valuemin", "1");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(value));

    const fill = document.createElement("div");
    fill.className = "meter-fill";
    fill.style.width = `${value}%`;

    const readout = document.createElement("span");
    readout.className = "readout";
    readout.textContent = String(value);

    const setFromEvent = (event: PointerEvent) => {
      const bounds = meter.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left) / bounds.width;
      const next = Math.max(1, Math.min(100, Math.round(ratio * 100)));
      fill.style.width = `${next}%`;
      readout.textContent = String(next);
      meter.setAttribute("aria-valuenow", String(next));
      this.callbacks.onBrushChange({ amount: next });
    };

    meter.addEventListener("pointerdown", (event) => {
      meter.setPointerCapture(event.pointerId);
      setFromEvent(event);
    });
    meter.addEventListener("pointermove", (event) => {
      if (event.buttons === 1) setFromEvent(event);
    });

    meter.append(fill);
    wrapper.append(label, meter, readout);
    return wrapper;
  }

  /**
   * 브러시 크기. 그림 도구처럼 실제 크기에 맞는 점을 눌러 고른다.
   * 숫자보다 점 크기를 보고 고르는 편이 빠르다.
   */
  private brushSizes(current: number, amount: number): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-sizes";

    const label = document.createElement("label");
    label.textContent = "크기";
    attachTooltip(label, {
      title: "브러시 크기",
      body: "칠하거나 지울 원의 반지름입니다(이미지 픽셀 기준). 캔버스의 흰 원이 실제 크기입니다.",
      meta: "가장자리로 갈수록 옅게 칠해집니다",
    });

    const row = document.createElement("div");
    row.className = "size-row";

    // 저장된 값이 선택지와 정확히 같지 않을 수 있으니 가장 가까운 것을 켠다.
    const nearest = BRUSH_SIZES.reduce((best, size) =>
      Math.abs(size - current) < Math.abs(best - current) ? size : best,
    );

    for (const size of BRUSH_SIZES) {
      const selected = size === nearest;
      const button = document.createElement("button");
      button.type = "button";
      button.className = selected ? "size-option selected" : "size-option";
      button.setAttribute("aria-pressed", String(selected));

      const dot = document.createElement("span");
      dot.className = "size-dot";
      // 지름은 로그 눈금으로 매긴다. 제곱근이나 실제 비율로 하면 작은 쪽이 뭉쳐 구분이 안 된다.
      const diameter = Math.round(DOT_MIN + dotScale(size) * (DOT_MAX - DOT_MIN));
      dot.style.width = `${diameter}px`;
      dot.style.height = `${diameter}px`;
      // 가중치가 낮으면 점도 옅게. 한 번 칠했을 때 얼마나 묻는지를 그대로 보여 준다.
      // 가장 낮을 때도 어느 크기인지는 보여야 하므로 0.35 아래로는 내리지 않는다.
      dot.style.opacity = String(0.35 + (amount / 100) * 0.65);

      button.append(dot);
      attachTooltip(button, {
        title: `${size}px`,
        body:
          size <= 10
            ? "아주 가는 브러시. 격자 한두 칸만 건드린다. 경계를 미세하게 고칠 때."
            : size <= 40
              ? "가는 브러시. 손 · 발 · 귀처럼 작은 부위에."
              : size <= 145
                ? "보통 브러시. 팔 · 다리 · 머리 같은 부위에."
                : "굵은 브러시. 몸통을 한 번에 덮을 때.",
        meta: selected
          ? `지금 쓰는 크기 · 점 진하기는 가중치 ${amount}를 나타냅니다`
          : "눌러서 이 크기로 바꾸기",
      });
      button.addEventListener("click", () => this.callbacks.onBrushChange({ size }));
      row.append(button);
    }

    wrapper.append(label, row);
    return wrapper;
  }

  private field(label: string, control: HTMLElement): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    wrapper.append(labelElement, control);
    return wrapper;
  }

  private textField(
    label: string,
    value: string,
    onChange: (value: string) => void,
  ): HTMLDivElement {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("change", () => onChange(input.value));
    return this.field(label, input);
  }

  private numberField(
    label: string,
    value: number,
    onChange: (value: number) => void,
  ): HTMLDivElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = String(value);
    input.addEventListener("change", () => {
      const parsed = Number.parseFloat(input.value);
      if (Number.isFinite(parsed)) onChange(parsed);
    });
    return this.field(label, input);
  }

  private parentField(bones: readonly PuppetBone[], bone: PuppetBone): HTMLDivElement {
    const select = document.createElement("select");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "(없음)";
    select.append(none);

    for (const candidate of bones) {
      if (!canReparent(bones, bone.id, candidate.id)) continue;
      const option = document.createElement("option");
      option.value = candidate.id;
      option.textContent = candidate.name;
      select.append(option);
    }
    select.value = bone.parentId ?? "";
    select.addEventListener("change", () =>
      this.callbacks.onUpdateBone(bone.id, { parentId: select.value || null }),
    );
    return this.field("부모", select);
  }

  /**
   * 태그 편집. (기획서 11, 12)
   * 붙어 있는 태그는 칩으로 보여 주고, 목록에서 눌러 추가한다.
   * 각 버튼에 마우스를 올리면 그 태그가 애니메이션에서 무슨 일을 하는지 알려 준다.
   */
  private tagsField(bone: PuppetBone): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-tags";

    const label = document.createElement("label");
    label.textContent = "태그";
    label.title = "애니메이션은 관절 이름이 아니라 태그로 대상을 찾는다.";

    const body = document.createElement("div");
    body.className = "tag-body";

    const chips = document.createElement("div");
    chips.className = "tag-chips";

    for (const tag of bone.tags) {
      chips.append(this.tagChip(bone, tag));
    }

    if (bone.tags.length === 0) {
      const empty = document.createElement("span");
      empty.className = "tag-empty";
      empty.textContent = "없음 · 이 관절은 어떤 애니메이션에도 반응하지 않습니다";
      chips.append(empty);
    }

    const more = document.createElement("button");
    more.type = "button";
    more.className = "tag-add";
    more.textContent = this.tagPickerBoneId === bone.id ? "닫기" : "+ 태그";
    more.title = "붙일 태그 고르기";
    more.addEventListener("click", () => {
      this.tagPickerBoneId = this.tagPickerBoneId === bone.id ? null : bone.id;
      this.render();
    });
    chips.append(more);

    body.append(chips);
    wrapper.append(label, body);
    return wrapper;
  }

  private tagChip(bone: PuppetBone, tag: string): HTMLSpanElement {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    attachTooltip(chip, {
      title: tag,
      body:
        TAG_DESCRIPTIONS[tag] ??
        "목록에 없는 태그입니다. 이 태그를 찾는 애니메이션을 만들면 그때부터 쓰입니다.",
      meta: animationsUsingTag(tag),
    });

    const name = document.createElement("span");
    name.textContent = tag;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "tag-remove";
    remove.textContent = "×";
    remove.title = `${tag} 떼기`;
    remove.setAttribute("aria-label", `${tag} 떼기`);
    remove.addEventListener("click", () =>
      this.callbacks.onUpdateBone(bone.id, {
        tags: bone.tags.filter((candidate) => candidate !== tag),
      }),
    );

    chip.append(name, remove);
    return chip;
  }

  /** 태그 고르기 패널. 묶음별로 나열하고, 이미 붙은 태그는 켜진 상태로 보인다. */
  private tagPicker(bone: PuppetBone): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "tag-picker";

    for (const group of TAG_GROUPS) {
      const tags = TAG_CATALOG.filter((tag) => tag.group === group.id);
      if (tags.length === 0) continue;

      const title = document.createElement("h4");
      title.textContent = group.label;
      picker.append(title);

      const row = document.createElement("div");
      row.className = "tag-options";

      for (const tag of tags) {
        const on = bone.tags.includes(tag.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = on ? "tag-option active-fill" : "tag-option";
        button.textContent = tag.id;
        button.setAttribute("aria-pressed", String(on));
        attachTooltip(button, {
          title: on ? `${tag.id} — 붙어 있음 (누르면 뗍니다)` : tag.id,
          body: tag.description,
          meta: animationsUsingTag(tag.id),
        });
        button.addEventListener("click", () =>
          this.callbacks.onUpdateBone(bone.id, {
            tags: on
              ? bone.tags.filter((candidate) => candidate !== tag.id)
              : [...bone.tags, tag.id],
          }),
        );
        row.append(button);
      }

      picker.append(row);
    }

    // 목록에 없는 태그도 직접 만들 수 있다. (기획서 11)
    const custom = document.createElement("div");
    custom.className = "tag-custom";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "직접 입력";

    const add = document.createElement("button");
    add.type = "button";
    add.className = "outlined";
    add.textContent = "추가";
    add.title = "목록에 없는 태그를 직접 만든다";

    const submit = () => {
      const value = input.value.trim();
      if (!value || bone.tags.includes(value)) return;
      input.value = "";
      this.callbacks.onUpdateBone(bone.id, { tags: [...bone.tags, value] });
    };
    add.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });

    custom.append(input, add);
    picker.append(custom);
    return picker;
  }

  /**
   * 변형 방식. 네 가지를 한눈에 비교할 수 있게 버튼으로 두고,
   * 각각 어떤 파츠를 위한 것인지 툴팁으로 설명한다. (기획서 19)
   */
  private deformField(bone: PuppetBone): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field field-deform";

    const label = document.createElement("label");
    label.textContent = "변형";
    attachTooltip(label, {
      title: "변형 방식",
      body: "이 관절이 칠한 영역을 어떻게 다룰지 정합니다. 휘게 둘지, 형태를 지킬지, 아예 제자리에 묶어 둘지.",
      meta: "마우스를 각 버튼에 올리면 어떤 파츠에 맞는지 설명이 나옵니다",
    });

    const grid = document.createElement("div");
    grid.className = "deform-grid";

    for (const option of DEFORM_OPTIONS) {
      const on = bone.deform === option.id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = on ? "deform-option active-fill" : "deform-option";
      button.textContent = option.short;
      button.setAttribute("aria-pressed", String(on));
      attachTooltip(button, {
        title: `${option.short} — ${option.label}`,
        body: option.help,
        meta: `예: ${option.examples}`,
      });
      button.addEventListener("click", () =>
        this.callbacks.onUpdateBone(bone.id, { deform: option.id }),
      );
      grid.append(button);
    }

    wrapper.append(label, grid);
    return wrapper;
  }

}
