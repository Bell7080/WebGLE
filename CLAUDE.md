# PuppetForge 작업 지침

브라우저에서 실행되는 2D 종이인형 애니메이션 제작 툴.
제품 사양의 최종 근거는 [기획서](./범용%20웹%20종이인형%20애니메이션%20툴%20개발%20기획서.md)다.
판단이 갈리면 기획서를 따르고, 기획서에 없으면 여기 규칙을 따른다.

## 반드시 지킬 작업 규칙

**모든 업데이트마다 [`VERSION.md`](./VERSION.md)에 업데이트 이후 버전을 표기하고 dev 로그를 작성한다.**

- 코드를 변경하고 커밋할 때마다 예외 없이 수행한다.
- 버전은 [유의적 버전](https://semver.org/lang/ko/)을 따른다.
  - PATCH: 버그 수정, 사소한 다듬기
  - MINOR: 기능 추가, Phase 진행
  - MAJOR: Puppet JSON 포맷의 하위 호환이 깨질 때
- `VERSION.md` 최상단에 새 항목을 추가한다. 형식은 파일 안의 기존 항목을 그대로 따른다.
  - 버전, 날짜, 해당하는 기획서 Phase
  - `추가` / `변경` / `수정` / `참고` 구분으로 실제 변경 내용
  - 검증 방법(테스트, 빌드, 브라우저 확인 등)과 알려진 한계
- `package.json`의 `version`을 같은 값으로 맞춘다.
- Puppet JSON 포맷이 바뀌면 `PUPPET_VERSION`과 `docs/puppet-json.md`도 함께 갱신한다.
- 기능이 늘거나 줄면 `README.md`의 "현재 상태"도 갱신한다.

## 명령어

```bash
npm run dev      # 개발 서버
npm run build    # tsc --noEmit + vite build
npm test         # Vitest (코어 로직)
npm run typecheck
```

각 작업을 끝낼 때 최소한 `npm run build`와 `npm test`가 통과해야 한다. (기획서 71)

## 구조

```text
src/core/       # 엔진 독립 로직. DOM · Phaser에 의존하지 않는다.
src/editor/     # 편집기 전용 (UI, 상태, Undo, 도구)
src/renderer/   # Phaser 캔버스
tests/          # 코어 로직 테스트
docs/           # 포맷 문서
```

의존 방향은 `editor → core`, `renderer → core` 한 방향이다. `core`는 아무것도 모른다.

## 설계 원칙 (기획서 62, 63)

- 스켈레톤 타입을 만들지 않는다. 모든 캐릭터는 노드와 부모 관계의 집합이다.
- 특정 Bone 이름에 의존하지 않는다. 애니메이션은 **태그**로 대상을 찾는다.
- 요구한 태그가 없으면 오류 없이 해당 Track만 건너뛴다. (기획서 64)
- Editor와 Runtime, Renderer와 Animation 로직을 분리한다.
- Puppet JSON이 단일 소스다. 엔진별 파일을 따로 원본으로 두지 않는다.
- 애니메이션은 코드가 아니라 데이터(JSON 프리셋)로 추가한다.
- 다음 Phase에 필요한 구조를 미리 과하게 만들지 않는다. 의존성도 함부로 늘리지 않는다.

## UI 원칙 (기획서 33, 72, 74)

- 모든 사용자 문구는 한국어다.
- 어두운 그레이 톤 + 흑백. 색은 위계 표현에만 쓰고 장식하지 않는다.
- 색 값은 `src/style.css`의 CSS 변수만 쓴다. 값을 직접 박아 넣지 않는다.
- 캔버스가 가장 크게 보이고, 선택된 관절이 항상 명확해야 한다.
- 자동으로 정할 수 있는 값은 자동으로 정한다. 꼭 필요한 것만 UI로 노출한다.

## 진행 순서

기획서 70의 Phase 순서를 따른다. 현재 위치와 다음 작업은 `VERSION.md` 최신 항목에 적는다.
