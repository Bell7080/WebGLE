# Puppet JSON 포맷 (v1)

PuppetForge의 단일 소스. 편집기 · 런타임 · 다른 엔진이 모두 이 파일 하나를 읽는다.
타입 정의는 [`src/core/format/types.ts`](../src/core/format/types.ts)에 있다.

## 최상위

```json
{
  "format": "puppetforge",
  "version": 1,
  "character": { },
  "bones": [],
  "mesh": null,
  "animations": {}
}
```

| 필드 | 설명 |
| --- | --- |
| `format` | 항상 `"puppetforge"`. 다른 값이면 읽기를 거부한다. |
| `version` | 포맷 버전. 읽는 쪽보다 크면 거부하고, 작으면 Migration 대상이다. |
| `character` | 캐릭터 메타 정보 |
| `bones` | 관절 목록. 순서는 의미가 없다. |
| `mesh` | 격자 Mesh. 아직 만들지 않았으면 `null`. |
| `animations` | 애니메이션 이름 → 애니메이션 데이터 |

## character

```json
{
  "name": "언데드 늑대",
  "texture": "character.png",
  "width": 512,
  "height": 512,
  "pixelArt": false
}
```

`texture`는 프로젝트 안의 파일명이다. 좌표는 모두 이 텍스처의 픽셀 좌표계를 쓴다
(좌상단이 원점, y는 아래로 증가).

## bones

```json
{
  "id": "bone_a1b2c3d4",
  "name": "꼬리1",
  "parentId": "bone_0f9e8d7c",
  "x": 240,
  "y": 380,
  "rotation": 0,
  "scaleX": 1,
  "scaleY": 1,
  "tags": ["tail", "secondary"],
  "motionStrength": 1,
  "deform": "soft"
}
```

- `parentId`가 `null`이면 루트다. 부모가 움직이면 자식도 따라간다.
- `rotation`은 라디안이다.
- `tags`는 범용 애니메이션이 대상을 찾는 유일한 수단이다. 이름에 의존하지 않는다.
- `motionStrength`는 애니메이션 움직임 크기에 곱하는 배율이다 (기본 `1`).
- `deform`은 `"soft"`(Mesh 변형) 또는 `"rigid"`(위치 · 회전 · 크기만).

좌우 구분이나 파츠 종류는 포맷에 없다. 필요하면 사용자가 이름이나 태그로 표현한다.

## mesh

```json
{
  "resolution": "normal",
  "cols": 32,
  "rows": 32,
  "vertices": [0, 0, 16, 0],
  "indices": [0, 1, 2],
  "weights": [{ "boneIds": ["bone_a1b2c3d4"], "weights": [1] }]
}
```

`vertices`는 `[x0, y0, x1, y1, ...]` 형태의 평면 배열이고, `weights`는 정점 순서와 1:1로
대응한다. 한 정점의 `weights` 합은 1로 정규화하며, 참조하는 Bone은 최대 4개다.

`boneIds`가 빈 정점은 **어떤 Bone의 영향도 받지 않는다**. 그 정점은 애니메이션 중에도
원래 자리에 그대로 있는다. 아직 칠하지 않은 영역이 여기 해당한다.

`cols` · `rows`는 셀 개수이므로 정점 수는 `(cols + 1) * (rows + 1)`이다.
격자는 이미지 크기에 맞춰 자동으로 만들어지고, 셀이 정사각형에 가깝도록 긴 변을 기준으로 나눈다.

## animations

```json
{
  "idle": {
    "name": "idle",
    "duration": 1.5,
    "loop": true,
    "tracks": [
      {
        "target": { "kind": "tag", "tag": "head" },
        "property": "rotation",
        "keys": [
          { "time": 0, "value": 0 },
          { "time": 0.75, "value": 0.06, "ease": "smooth" },
          { "time": 1.5, "value": 0 }
        ]
      }
    ],
    "events": [{ "time": 0.32, "event": "impact" }]
  }
}
```

- Track의 `target`은 Bone 하나(`{"kind":"bone","boneId":"..."}`) 또는 태그(`{"kind":"tag","tag":"head"}`)다.
- 태그를 대상으로 하면 그 태그를 가진 **모든** Bone에 적용된다. 머리가 셋이면 셋 다 움직인다.
- 해당 태그를 가진 Bone이 하나도 없으면 그 Track만 건너뛴다. 오류를 내지 않고 나머지는 계속 재생한다.
- `time`은 초 단위이며 `0`부터 `duration`까지다.
- `events`는 게임 쪽에서 받는 신호다 (공격 판정, 효과음, 이펙트 등).

값의 의미는 기준 자세로부터의 **변화량**이다.

| property | 뜻 | 기본값 |
| --- | --- | --- |
| `x`, `y` | 기준 위치에서 이동한 픽셀 | 0 |
| `rotation` | 기준에서 회전한 라디안 | 0 |
| `scaleX`, `scaleY` | 기준 크기에 곱할 배율 | 1 |

각 값에는 대상 Bone의 `motionStrength`가 곱해진다. 이동 · 회전은 그대로 곱하고,
크기는 `1 + (값 - 1) × motionStrength`로 계산한다.

프리셋은 `src/presets/*.json`에 둔다. 새 모션을 추가할 때 엔진 코드를 고치지 않는 것이 목표다.

## 버전 관리

포맷이 바뀌면 `version`을 올리고 읽는 쪽에 Migration을 추가한다.
`parseProject()`가 검증과 Migration의 단일 진입점이다.
