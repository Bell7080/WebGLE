import {
  ANIMATION_BUTTONS,
  OVERLAY_LAYERS,
  PART_NAMES,
  type OverlayLayer,
  type PuppetBone,
} from "@core/format";
import { canReparent } from "@core/skeleton";
import type { BrushState, EditorStore } from "../state/store";
import { createColorWheel } from "./colorWheel";

export interface EditorUICallbacks {
  onAddBone(part: string): void;
  onDeleteBone(boneId: string): void;
  onUpdateBone(boneId: string, patch: Partial<PuppetBone>): void;
  /** 목록에서 끌어 옮긴 결과. targetId 앞/뒤로 옮긴다. */
  onReorderBone(boneId: string, targetId: string, place: "before" | "after"): void;
  onMenu(action: string): void;
  onPlay(animationId: string): void;
  onStop(): void;
  onBrushChange(patch: Partial<BrushState>): void;
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
  private readonly statusText = requireElement<HTMLSpanElement>("statusText");
  private readonly dropzone = requireElement<HTMLDivElement>("dropzone");
  private readonly addBoneButton = requireElement<HTMLButtonElement>("addBoneButton");
  private partSelect!: HTMLSelectElement;
  private draggingBoneId: string | null = null;
  /** 원형 팔레트를 펼쳐 둔 관절. */
  private colorOpenBoneId: string | null = null;

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
    for (const animation of ANIMATION_BUTTONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = animation.label;
      button.addEventListener("click", () => this.callbacks.onPlay(animation.id));
      this.animButtons.append(button);
    }
    requireElement<HTMLButtonElement>("playButton").addEventListener("click", () =>
      this.callbacks.onPlay("idle"),
    );
    requireElement<HTMLButtonElement>("stopButton").addEventListener("click", () =>
      this.callbacks.onStop(),
    );
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
    const { project, visibility, selectedBoneId, textureUrl } = this.store.get();

    for (const button of this.layerToggles.querySelectorAll("button")) {
      const on = visibility[button.dataset.layer as OverlayLayer] ?? true;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }

    this.dropzone.classList.toggle("hidden", textureUrl !== null);
    this.addBoneButton.disabled = textureUrl === null;
    this.partSelect.disabled = textureUrl === null;

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
      this.textField("태그", bone.tags.join(", "), (value) =>
        this.callbacks.onUpdateBone(bone.id, {
          tags: value
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      ),
      this.numberField("강도", bone.motionStrength, (value) =>
        this.callbacks.onUpdateBone(bone.id, { motionStrength: value }),
      ),
      this.deformField(bone),
    );

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

    section.append(
      this.sliderField("크기", brush.size, 4, 400, 1, (value) =>
        this.callbacks.onBrushChange({ size: value }),
      ),
      this.sliderField("가중치", brush.amount, 1, 100, 1, (value) =>
        this.callbacks.onBrushChange({ amount: value }),
      ),
    );

    // 아직 어느 관절도 가지지 않은 영역의 비율. 그만큼은 애니메이션에서 움직이지 않는다.
    const { mask } = this.store.get();
    const inside = project.mesh.weights.filter((_weight, index) => !mask || mask[index]);
    const empty = inside.filter((weight) => weight.boneIds.length === 0).length;
    if (inside.length > 0) {
      const coverage = document.createElement("p");
      coverage.className = "hint";
      coverage.textContent =
        empty === 0
          ? "빈 곳 없음 · 전체가 어느 관절엔가 묶여 있습니다."
          : `칠하지 않은 영역 ${Math.round((empty / inside.length) * 100)}% · 그만큼은 움직이지 않습니다.`;
      section.append(coverage);
    }

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

  private sliderField(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const labelElement = document.createElement("label");
    labelElement.textContent = label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    const readout = document.createElement("span");
    readout.className = "readout";
    readout.textContent = String(value);

    input.addEventListener("input", () => {
      readout.textContent = input.value;
      onChange(Number(input.value));
    });

    wrapper.append(labelElement, input, readout);
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

  private deformField(bone: PuppetBone): HTMLDivElement {
    const select = document.createElement("select");
    for (const [value, label] of [
      ["soft", "부드럽게 · 움직임"],
      ["rigid", "형태 유지 · 움직임"],
      ["pinnedSoft", "부드럽게 · 위치 고정"],
      ["fixed", "형태·위치 모두 고정"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = bone.deform;
    select.addEventListener("change", () =>
      this.callbacks.onUpdateBone(bone.id, { deform: select.value as PuppetBone["deform"] }),
    );
    return this.field("변형", select);
  }
}
