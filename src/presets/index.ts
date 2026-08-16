import type { PuppetAnimation } from "@core/format";

import idle from "./idle.json";
import walk from "./walk.json";
import attack from "./attack.json";
import hit from "./hit.json";
import death from "./death.json";
import jump from "./jump.json";
import roar from "./roar.json";
import bite from "./bite.json";
import scratch from "./scratch.json";
import swing from "./swing.json";
import stab from "./stab.json";
import slam from "./slam.json";
import cast from "./cast.json";
import run from "./run.json";
import fly from "./fly.json";
import swim from "./swim.json";
import guard from "./guard.json";
import dodge from "./dodge.json";
import stun from "./stun.json";
import victory from "./victory.json";
import charge from "./charge.json";
import spin from "./spin.json";
import stomp from "./stomp.json";

/**
 * 목록에서 묶어 보여 줄 갈래. 화면에 나오는 순서이기도 하다.
 *
 * 화면 쪽에서 갈래를 다시 나열하지 않고 이 배열을 그대로 쓴다.
 * 예전에는 UI가 `["기본", "공격"]`을 직접 적고 있었는데, 갈래를 늘렸을 때
 * 그 줄을 함께 고치지 않아 프리셋 7개가 목록에 아예 나오지 않았다.
 */
export const PRESET_GROUPS = ["기본", "이동", "반응", "공격"] as const;

export type PresetGroup = (typeof PRESET_GROUPS)[number];

export interface PresetInfo {
  id: string;
  label: string;
  group: PresetGroup;
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
  { id: "idle", label: "대기", group: "기본", description: "숨쉬듯 미세하게 흔들린다", animation: idle as unknown as PuppetAnimation },
  { id: "walk", label: "걷기", group: "기본", description: "위아래로 튀며 팔다리를 번갈아 흔든다", animation: walk as unknown as PuppetAnimation },
  { id: "hit", label: "피격", group: "기본", description: "뒤로 튕기며 몸이 눌리고 머리가 반동한다", animation: hit as unknown as PuppetAnimation },
  { id: "death", label: "사망", group: "기본", description: "무릎이 꺾이고 몸이 옆으로 쓰러진다. 바닥에 닿은 뒤 머리가 늦게 떨어지고 눈을 감는다", animation: death as unknown as PuppetAnimation },
  { id: "jump", label: "점프", group: "기본", description: "웅크렸다 도약하고 착지에서 눌린다", animation: jump as unknown as PuppetAnimation },
  { id: "roar", label: "포효", group: "기본", description: "웅크렸다가 몸을 부풀리고 고개를 젖혀 포효한다", animation: roar as unknown as PuppetAnimation },

  { id: "run", label: "달리기", group: "이동", description: "앞으로 기운 자세로 크게 내딛는다. 걷기보다 빠르고 보폭이 크다", animation: run as unknown as PuppetAnimation },
  { id: "fly", label: "비행", group: "이동", description: "날개를 치며 떠 있는다. 날개가 내려갈 때 몸이 떠오른다", animation: fly as unknown as PuppetAnimation },
  { id: "swim", label: "헤엄", group: "이동", description: "몸 전체를 훑고 지나가는 물결. 꼬리 · 지느러미 · 촉수가 순서대로 흐른다", animation: swim as unknown as PuppetAnimation },

  { id: "guard", label: "방어", group: "반응", description: "몸을 낮추고 앞을 막은 채 버틴다. 방패가 있으면 방패를 세운다", animation: guard as unknown as PuppetAnimation },
  { id: "dodge", label: "회피", group: "반응", description: "뒤로 확 빠졌다가 제자리로 돌아온다. 아주 짧다", animation: dodge as unknown as PuppetAnimation },
  { id: "stun", label: "기절", group: "반응", description: "제어를 잃고 느리게 휘청인다. 머리가 크게 흔들리고 눈이 반쯤 감긴다", animation: stun as unknown as PuppetAnimation },
  { id: "victory", label: "승리", group: "반응", description: "튀어 오르며 팔을 들어 올린다", animation: victory as unknown as PuppetAnimation },

  { id: "attack", label: "공격", group: "공격", description: "뒤로 당겼다가 한 번 크게 앞으로 내지른다. 어떤 캐릭터에나 무난하다", animation: attack as unknown as PuppetAnimation },
  { id: "bite", label: "물기", group: "공격", description: "머리째 달려들어 턱을 닫는다. 거미 · 늑대처럼 무는 몬스터용", animation: bite as unknown as PuppetAnimation },
  { id: "scratch", label: "할퀴기", group: "공격", description: "제자리에서 발톱으로 짧게 두 번 긁어내린다. 몸이 앞으로 나가는 공격과 다르다", animation: scratch as unknown as PuppetAnimation },
  { id: "swing", label: "휘두르기", group: "공격", description: "크게 젖혔다가 호를 그리며 후려친다. 검 든 캐릭터용", animation: swing as unknown as PuppetAnimation },
  { id: "stab", label: "찌르기", group: "공격", description: "짧게 당겼다가 곧게 내지른다. 창 · 집게처럼 뾰족한 무기용", animation: stab as unknown as PuppetAnimation },
  { id: "slam", label: "몸통박치기", group: "공격", description: "몸 전체로 부딪친다. 팔다리가 없는 슬라임에게도 통한다", animation: slam as unknown as PuppetAnimation },
  { id: "cast", label: "캐스팅", group: "공격", description: "팔을 들어 힘을 모았다 내린다", animation: cast as unknown as PuppetAnimation },
  { id: "charge", label: "돌진", group: "공격", description: "팔이 아니라 몸 전체가 앞으로 튀어 나간다. 되돌아오지 않고 그 자리에 선다", animation: charge as unknown as PuppetAnimation },
  { id: "spin", label: "회전 베기", group: "공격", description: "제자리에서 한 바퀴 돌며 휘두른다. 사방을 한 번에 치는 동작", animation: spin as unknown as PuppetAnimation },
  { id: "stomp", label: "내려찍기", group: "공격", description: "위로 크게 들었다가 아래로 내리꽂는다. 착지에서 몸이 눌린다", animation: stomp as unknown as PuppetAnimation },
];

export function findPreset(id: string): PresetInfo | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
