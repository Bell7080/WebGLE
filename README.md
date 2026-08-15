# PuppetForge

브라우저에서 실행되는 개인용 2D 종이인형 애니메이션 제작 툴.

한 장짜리 PNG 캐릭터에 관절을 찍고 영향 영역을 칠한 뒤, 범용 애니메이션을 입혀
게임에서 바로 쓸 수 있는 가벼운 애니메이션 데이터를 만드는 것이 목표다.
자세한 내용은 [기획서](./범용%20웹%20종이인형%20애니메이션%20툴%20개발%20기획서.md)를 참고한다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview  # 빌드 결과 미리보기
npm test         # 코어 로직 테스트
```

Chromium 계열 브라우저 + WebGL 환경을 기준으로 한다.

## 현재 상태 (v0.2.0)

기획서 70의 Phase 1 · 2와 Phase 3 일부(관절 편집)까지 되어 있다.
변경 내역은 [`VERSION.md`](./VERSION.md)를 참고한다.

- Vite + TypeScript + Phaser 기반 프로젝트 설정
- 한국어 편집기 레이아웃 (상단 메뉴 / 관절 · 속성 패널 / 애니메이션 바 / 편집 모드 탭)
- PNG · WebP 드래그 앤 드롭 및 `이미지 불러오기`
- 캔버스 Zoom(마우스 휠) / Pan(우클릭 또는 휠클릭 드래그)
- 관절 추가 · 삭제, 이름 · 부모 · 태그 · 강도 · 변형 방식 편집
- 캔버스에서 관절점을 직접 집어서 위치 이동
- 관절 목록 드래그로 순서 정리, `×`로 삭제
- 관절점과 부모 연결선 표시
- Undo / Redo (`Ctrl+Z`, `Ctrl+Y` 또는 `Ctrl+Shift+Z`)
- Puppet JSON 타입 정의, 생성 · 검증 · 직렬화

아직 없는 것: 캔버스 클릭으로 관절 생성, 연결 모드, Mesh, Weight, 애니메이션 재생,
프로젝트 저장 · 불러오기, Runtime 패키지. 순서는 기획서 70을 따른다.

## 폴더 구조

```text
src/
 ├ core/            # 엔진 독립 로직 (렌더러 · UI에 의존하지 않는다)
 │  ├ format/       # Puppet JSON 타입, 상수, 생성 · 검증
 │  └ skeleton/     # Bone 조회 · 계층 정렬 · 부모 변경 검사
 ├ editor/          # 편집기 전용 코드
 │  ├ ui/           # DOM UI
 │  ├ tools/        # 이미지 불러오기 등 편집 도구
 │  ├ state/        # 편집기 상태 스토어
 │  └ history/      # Undo / Redo
 ├ renderer/
 │  └ phaser/       # 편집 캔버스 (Phaser Scene)
 ├ main.ts          # 조립 지점
 └ style.css
tests/              # 코어 로직 테스트 (Vitest)
docs/               # 포맷 문서
```

## 설계 원칙

- 스켈레톤 타입(인간형 · 4족보행 등)을 만들지 않는다. 모든 캐릭터는 노드와 부모 관계의 집합이다.
- 애니메이션은 Bone 이름이 아니라 **태그**를 대상으로 한다. 없는 태그는 조용히 건너뛴다.
- Editor와 Runtime, Renderer와 Animation 로직을 분리한다.
- Puppet JSON이 단일 소스다. 엔진별 파일을 따로 원본으로 두지 않는다.

## 배포

`main` 브랜치가 갱신되면 Vercel이 정적 사이트로 자동 배포한다 (`vercel.json`).
서버와 데이터베이스는 사용하지 않는다.
