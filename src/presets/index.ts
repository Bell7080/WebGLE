import type { PuppetAnimation } from "@core/format";

import idle from "./idle.json";
import walk from "./walk.json";
import attack from "./attack.json";
import hit from "./hit.json";
import death from "./death.json";
import jump from "./jump.json";
import roar from "./roar.json";

export interface PresetInfo {
  id: string;
  label: string;
  /** 이 동작이 어떤 태그를 쓰는지. 없는 태그는 그냥 건너뛴다. */
  description: string;
  animation: PuppetAnimation;
}

/**
 * 기본 애니메이션 프리셋. (기획서 21, 26)
 *
 * 새 모션을 늘릴 때 엔진 코드는 건드리지 않는다. JSON 하나를 만들고 여기 한 줄만 더한다.
 * 프리셋이 찾는 태그가 캐릭터에 없으면 그 Track만 조용히 건너뛴다. (기획서 64)
 */
export const PRESETS: readonly PresetInfo[] = [
  { id: "idle", label: "대기", description: "숨쉬듯 미세하게 흔들린다", animation: idle as unknown as PuppetAnimation },
  { id: "walk", label: "이동", description: "위아래로 튀며 팔다리를 번갈아 흔든다", animation: walk as unknown as PuppetAnimation },
  { id: "attack", label: "공격", description: "뒤로 당겼다가 attack 부위를 앞으로 내지른다", animation: attack as unknown as PuppetAnimation },
  { id: "roar", label: "포효", description: "웅크렸다가 몸을 부풀리고 고개를 젖혀 포효한다", animation: roar as unknown as PuppetAnimation },
  { id: "hit", label: "피격", description: "뒤로 튕기며 몸이 눌리고 머리가 반동한다", animation: hit as unknown as PuppetAnimation },
  { id: "death", label: "사망", description: "아래로 무너지며 머리와 부속이 늦게 처진다", animation: death as unknown as PuppetAnimation },
  { id: "jump", label: "점프", description: "웅크렸다 도약하고 착지에서 눌린다", animation: jump as unknown as PuppetAnimation },
];

export function findPreset(id: string): PresetInfo | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
