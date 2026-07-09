---
title: "히스토리 상태 거버넌스 — 단일 기록 모듈과 뒤로가기 스크롤 복원"
date: 2026-07-03
lastmod: 2026-07-03
author: "Davi"
description: "문서 안에서 앵커 링크로 이동한 뒤 뒤로가기를 누르면 원래 읽던 위치로 돌아오지 못한다. 이 문제의 원인을 라우터 소스에서 확인하고, history.state를 누가·언제·어떤 모양으로 쓰는지에 대한 규칙과 계층 구조를 결정한다."
slug: "docs-adr-0001-history-state-governance"

section: "decisions"
category: "docs"
tags: [vitepress, history-api, scroll-restoration, architecture, ssot]

# ── decisions 전용 필드 ──
id: DOCS-ADR-0001
doc_type: "adr"
decision_status: "proposed"   # 승인하면 accepted로 바꾼다
deciders: ["Davi"]
period:
  start: 2026-07-03
  end: ~
related_decisions: [CORE-ADR-0001]
supersedes: ~
suspended_by: ~

status: "wip"
toc: true
draft: false
search: true

# ── AI 활용 표기 ──────────────────────────────────────
ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "reviewed"        # 검토 후 verified/reviewed로 갱신하고 draft를 해제한다
---

# DOCS-ADR-0001: 히스토리 상태 거버넌스

## 1. 맥락 (Context)

### 1.1 무엇이 일어났는가

문서를 스크롤하며 읽다가 본문 안의 앵커 링크(예: `(→ 08)`)를 클릭하면 같은 문서의 다른 위치로 이동한다. 여기서 뒤로가기를 누르면 화면이 원래 읽던 위치로 한 번 돌아온다. 그리고 곧바로 문서 최상단으로 다시 이동한다. 돌아간 URL에 이전 앵커가 남아 있는 경우에는 최상단 대신 그 앵커 위치로 이동한다.

다른 문서로 이동했다가 뒤로가기로 돌아오는 경우에는 이 증상이 없다. 원래 위치로 정확히 복원된다. 같은 "뒤로가기"인데 경로에 따라 결과가 갈린다는 점이 조사의 출발점이었다.

### 1.2 왜 일어나는가

#### 브라우저가 하는 일

브라우저는 히스토리를 오갈 때 스크롤 위치를 스스로 복원한다. `history.scrollRestoration` 값이 기본값 `'auto'`이면, 브라우저는 히스토리 엔트리(Entry)마다 스크롤 오프셋을 저장해 두었다가 뒤로가기·앞으로가기 순간에 그 값으로 되돌린다([MDN — History.scrollRestoration](https://developer.mozilla.org/en-US/docs/Web/API/History/scrollRestoration)). 이 사이트에서 콘솔로 확인한 값도 `'auto'`였다. 증상에서 "한 번 돌아오는" 첫 번째 움직임은 브라우저가 만든 것이다.

#### VitePress가 하는 일

VitePress는 SPA(Single Page Application)라서 페이지를 전면 로드하지 않고 콘텐츠만 갈아 끼운다. 그래서 브라우저의 복원 위에 자기 복원 로직을 한 겹 더 얹는다. `vitepress@1.6.4`의 `dist/client/app/router.js` 전문을 읽고 다음 다섯 가지 동작을 확인했다.

1. **다른 문서로 이동할 때는 좌표를 기록하고 떠난다.** `go()`는 이동 직전에 `history.replaceState({ scrollPosition: window.scrollY }, '')`를 호출한다. 지금 떠나는 엔트리의 state에 현재 스크롤 좌표를 남겨 두고, 그 다음 `pushState({})`로 새 엔트리를 만든다. 크로스 문서 테스트에서 복원이 정상이었던 이유가 이 두 줄이다.
2. **같은 문서 안에서 해시(hash) 앵커로 이동할 때는 기록하지 않는다.** click 핸들러의 같은 pathname 분기는 `pushState({})`만 호출한다. 좌표를 남기는 replaceState가 없다. 그래서 앵커를 눌러 떠난 엔트리에는 읽던 위치가 남지 않는다.
3. **뒤로가기가 오면 코어가 state를 읽고 복원한다.** popstate 핸들러는 `e.state === null`이면 아무것도 하지 않고 빠진다. null이 아니면 `loadPage(href, e.state.scrollPosition || 0)`을 호출한다. state에 scrollPosition이 없으면 0이 들어간다.
4. **`loadPage`는 비동기로 스크롤을 만진다.** 페이지 모듈을 기다린 뒤 nextTick에서 좌표를 적용한다. 이때 받은 좌표가 0이면 두 갈래로 갈린다. 돌아간 URL에 해시가 남아 있으면 그 앵커로 스크롤하고, 해시가 없으면 `window.scrollTo(0, 0)`으로 최상단에 스크롤한다. §1.1에서 관측한 두 변종(최상단 / 이전 앵커)이 정확히 이 분기다.
5. **부트 시점에 코어가 state를 정규화한다.** 클라이언트 앱이 뜰 때 `history.state === null`이면 `{}`로 바꾼다. 콘솔에서 state가 null이었다가 `{}`로 변한 이유가 이것이다. 이 정규화 때문에 첫 엔트리조차 3번의 null 가드를 통과한다.

#### 다섯 가지를 합치면 증상이 재구성된다

앵커를 클릭하면 좌표 없는 엔트리가 생긴다(2). 뒤로가기를 누르면 브라우저가 먼저 동기적으로 올바른 위치를 복원한다(브라우저 층). 그 직후 VitePress의 비동기 핸들러가 도착하는데, 떠났던 엔트리의 state는 `{}`라 null 가드를 통과하고(5→3), scrollPosition이 없으니 0을 들고 loadPage로 들어가(3), 최상단 또는 이전 앵커로 두 번째 스크롤을 쓴다(4). 화면에는 나중에 쓴 값이 남는다. 같은 자원에 두 주체가 순서대로 쓰면 항상 마지막 쓰기가 이기는데, 이런 충돌 양상을 Last-Write-Wins라고 부른다.

#### 부수 관찰 — 0이 두 가지 의미를 겸한다

코어는 `scrollPosition || 0`과 `!scrollPosition` 패턴을 쓴다. 여기서 0은 "복원할 값이 없다"는 신호이면서 동시에 "문서 최상단"이라는 정상 좌표다. 특정 값 하나를 '값 없음' 신호로 정해 두는 기법을 센티널 값(Sentinel Value)이라고 하는데, 그 센티널이 유효한 값 범위 안에 들어 있으면 신호와 실제 값을 구분할 수 없게 된다. 코어가 소유한 코드라 직접 고치지 않는다. 대신 이번 수리는 코어에 0이 아닌 올바른 좌표를 항상 공급해서, 이 모호한 경로를 아예 지나지 않게 만든다.

### 1.3 history.state를 지금 누가 쓰고 있는가

이 사이트에서 history.state에 손을 대는 코드는 세 갈래다.

| 작성자 | 지점 | 무엇을 하는가 |
| --- | --- | --- |
| 코어 | 부트 정규화 | state가 null이면 `{}`로 바꾼다 |
| 코어 | `go()` 출발 기록 | `{ scrollPosition }`만 담은 새 객체로 통째로 갈아 끼운다. 기존에 있던 다른 필드는 이때 사라진다 |
| 코어 | `go()` · 해시 분기 | `pushState({})`로 빈 엔트리를 만든다 |
| 코어 | `loadPage`의 pathname 정규화 | 경로 표기가 어긋나면 `replaceState({}, '', href)`로 state를 통째로 비운다. 아직 밟지 않은 함정이지만 존재한다 |
| 테마 · PhotoSwipe | `openLightbox` | 기존 state를 스프레드로 보존하면서 좌표를 얹고, `{ pswp: true }` 엔트리를 push한다 |
| 테마 · TagCloud | `selectTag` | `location.hash =`로 이동한다. state를 건드리지 않으므로 새 엔트리의 state는 null이다 |

세 주체가 서로 다른 정책 — 통째 교체, 스프레드 병합, 무기록 — 으로 같은 자원을 쓰고 있다. 여기에 로드맵의 플로팅 윈도우 매니저가 네 번째 작성자로 들어올 예정이다. 작성자가 하나 더 늘기 전에 규칙을 정하는 편이 바로잡는 비용이 가장 적다.

### 1.4 무엇을 만들 수 없는가 — 구조적 제약

DOM 표준은 같은 대상(target), 같은 단계(phase)에 등록된 리스너를 등록한 순서대로 실행한다([DOM Standard — Events](https://dom.spec.whatwg.org/#introduction-to-dom-events)). 코어는 click·popstate 리스너를 `createRouter` 안에서 등록하고, 이 함수는 테마의 `enhanceApp`보다 먼저 실행된다(app.js에서 확인 예정 — 논리적 추론에 따른 답). 그래서 테마가 등록하는 리스너는 항상 코어 리스너 뒤에 실행되고, 이 순서를 뒤집을 방법이 없다. 여기서 두 가지가 불가능해진다.

- 테마는 click 시점에 코어보다 먼저 개입해서 pushState를 가로챌 수 없다.
- 테마는 popstate 시점에 코어의 복원을 막을 수 없다. `stopImmediatePropagation`은 자기보다 늦게 등록된 리스너만 멈추기 때문이다. 대안 D를 기각한 이유가 이것이다.

따라서 "모든 내비게이션이 우리 모듈을 통과한다"는 관문(Gatekeeper) 구조는 이 환경에서 세울 수 없다. 세울 수 있는 것은 협조하는 구조다. 코어가 읽는 데이터(scrollPosition)를 우리가 올바르게 채워 주고, 코어가 손대지 않는 영역(null state 엔트리, 우리가 push한 엔트리)을 우리가 관리한다.

## 2. 결정 (Decision)

### 2.1 왜 세 개의 층으로 나누는가

이 시스템은 나중에 VitePress를 떠나 Native JavaScript나 React 환경으로 옮길 수 있어야 한다. 그런데 코드를 통째로 옮길 수는 없다. 이번 수리의 핵심 수단인 press-stamp(§2.4 I5)는 1.6.4 코어가 해시 이동에서 좌표를 안 찍는 빈틈을 밖에서 메우는 우회로이고, react-router처럼 이동 전에 끼어들 수 있는 정식 훅을 제공하는 라우터에서는 이 우회로 자체가 필요 없기 때문이다. 옮겨 가는 것은 코드가 아니라 규칙이다. "모든 문서 엔트리는 떠나기 전에 좌표가 최신이어야 한다"는 규칙은 어디서나 유효하고, pointerdown이라는 구현은 이 환경에서만 쓰는 수단이다.

그래서 "환경을 옮길 때 무엇을 가져가고 무엇을 버리는가"를 기준으로 층을 나눈다.

| 계층 | 내용 | 환경을 옮길 때 |
| --- | --- | --- |
| **L0 프로토콜** | 이 문서가 정의하는 state 스키마·엔트리 분류·불변식. 코드가 아니라 계약(Contract)이다 | 그대로 가져간다 |
| **L1 코어 모듈** | 프로토콜을 코드로 옮긴 것. 상수·타입·쓰기 헬퍼·ephemeral 엔트리 매니저. 브라우저 표준 History API에만 의존하고 Vue나 VitePress를 import하지 않는다 | 그대로 가져간다 |
| **L2 호스트 어댑터** | VitePress 1.6.4의 빈틈을 메우는 환경 전용 코드. press-stamp 설치, 부트 시 고아 정리, enhanceApp 배선 | 버리고 새 환경에 맞춰 다시 쓴다 |

### 2.2 히스토리 엔트리를 세 종류로 분류한다

분류가 필요한 이유는 코어의 popstate가 엔트리를 state 모양으로 구분해서 다르게 취급하기 때문이다. null이면 무시하고, null이 아니면 복원을 시도한다. 이 동작에 맞춰 엔트리를 세 종류로 나누고 종류마다 우리 쪽 책임을 정한다.

| 분류 | 누가 만드는가 | state 모양 | 코어의 popstate 동작 | 우리 책임 |
| --- | --- | --- | --- | --- |
| **document** | 코어의 `go()` · 해시 분기 · 전면 로드 | `{}` 위에 `scrollPosition` | loadPage를 돌리고 좌표로 복원한다 | 떠나기 전에 좌표를 최신으로 만든다 (I5) |
| **ephemeral** | L1 매니저. 라이트박스처럼 "뒤로가기 = 닫기"로 쓰는 일시적 UI 상태 | `{ scrollPosition, dv: { ui } }` | loadPage를 돌리고 승계한 좌표로 복원한다 | 태그를 달고, 정확히 한 번 닫고, 리로드 잔재를 치운다 (I6) |
| **native** | 컴포넌트의 `location.hash =` (TagCloud) | `null` | null 가드에 걸려 아무것도 하지 않는다 | 이 null을 지킨다 — 아무것도 기록하지 않는다 (I4) |

### 2.3 state의 모양을 정한다

최상위에 두 키만 둔다.

- `scrollPosition: number` — **코어가 소유한 키다.** 코어의 popstate가 이 이름을 최상위에서 직접 읽으므로 이름도 위치도 우리가 바꿀 수 없다. 우리 데이터의 모양이 벤더 코드에 묶이는 결합(Coupling)인데, 버전을 1.6.4로 고정했으니 이 결합은 움직이지 않는다. v2 계열 소스도 같은 키를 쓰는 것을 확인했다.
- `dv: object` — **우리가 소유한 네임스페이스다(가칭).** 우리 필드는 전부 이 안에 넣는다. 최상위를 어지럽히지 않아야 코어가 미래에 어떤 키를 추가해도 충돌하지 않는다. PhotoSwipe가 지금 쓰는 최상위 `pswp: true`는 `dv: { ui: 'pswp' }` 형태로 옮긴다.

### 2.4 불변식 (Invariants) — 모든 작성자가 따르는 규칙

- **I1 — 단일 기록.** 테마 코드는 `history.pushState` / `history.replaceState`를 직접 호출하지 않는다. 모든 쓰기는 L1 헬퍼를 거친다. 단일 진실 원천(SSOT)은 파일을 한 곳에 모은다고 생기지 않는다. 모든 쓰기가 한 경로를 지나가도록 강제해야 규칙이 지켜졌는지 검증할 수 있다.
- **I2 — 병합이 기본.** state를 고칠 때는 `{ ...history.state, ...patch }`처럼 기존 값을 보존하면서 얹는다. 지우고 싶을 때는 지우기 전용 함수를 따로 쓴다. 코어의 통째 교체 정책이 커스텀 필드를 날리는 것을 §1.3에서 확인했다. 우리끼리는 같은 사고를 만들지 않는다.
- **I3 — document 엔트리에 오래 살아야 하는 상태를 두지 않는다.** 코어의 `go()` 출발 기록과 pathname 정규화가 state를 통째로 갈아 끼우므로, document 엔트리에 얹은 커스텀 필드는 페이지를 떠나는 순간 사라질 수 있다. 잃어버리면 안 되는 상태는 메모리나 sessionStorage 같은 다른 저장소에 둔다.
- **I4 — null은 신호다.** state가 null이라는 것은 그 엔트리가 pushState/replaceState를 한 번도 거치지 않았다는 뜻이고([MDN — History.state](https://developer.mozilla.org/en-US/docs/Web/API/History/state)), 코어는 이 신호를 보고 손을 뗀다. TagCloud가 native 엔트리를 쓰는 것은 이 계약을 정확히 밟는 선택이다. 그래서 native 엔트리에는 어떤 값도 기록하지 않는다. 한 글자라도 기록하는 순간 state가 null이 아니게 되고, 코어가 개입하기 시작한다.
- **I5 — 떠나기 전에 좌표를 찍는다.** 모든 document 엔트리는 떠나는 시점에 scrollPosition이 최신이어야 한다. 코어는 `go()` 경로에서 이 일을 스스로 하지만 해시 분기에서는 하지 않으므로, L2가 그 빈틈을 메운다. 구현은 이렇다. 문서 전역에서 pointerdown과 keydown(Enter/Space)을 받아, 직전 기록값과 다를 때만 병합 방식으로 좌표를 찍는다. pointerdown을 고른 이유 — 브라우저는 pointerdown을 click보다 항상 먼저 발생시킨다([W3C Pointer Events](https://www.w3.org/TR/pointerevents/#the-pointerdown-event)). 코어의 pushState는 click에서 일어나므로, 우리 기록은 리스너 등록 순서와 무관하게 그보다 앞선 시점에 이미 끝나 있다. 캡처 단계에 다는 이유 — 중간 요소가 이벤트 전파를 멈춰도 기록이 먼저 찍히게 하기 위해서다. 변경 가드를 두는 이유 — Safari는 짧은 시간에 pushState/replaceState를 너무 자주 호출하면 예외를 던지므로([MDN — History.pushState](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState)) 불필요한 호출을 줄인다.
- **I6 — ephemeral 엔트리의 계약.** (a) 만들 때 현재 scrollPosition을 함께 담는다. 담지 않으면 사용자가 앞으로가기로 이 엔트리에 다시 들어왔을 때 코어가 0을 읽어 최상단으로 보낸다. (b) `dv.ui` 태그를 반드시 단다. 이 태그가 "이 엔트리는 문서가 아니라 UI 상태"임을 식별한다. (c) 닫기는 정확히 한 번만 일어난다. 사용자가 UI 버튼으로 닫으면 코드가 `history.back()`으로 엔트리를 걷어내는데, 그 back이 다시 popstate를 발생시킨다. popstate 쪽 닫기 경로가 이것을 또 처리하면 두 번 닫는 셈이 된다. 현재 PhotoSwipe의 viaPop 플래그가 하는 중복 방지를 매니저가 공통으로 제공한다. (d) 앱이 뜰 때 현재 엔트리에 ui 태그가 남아 있으면 지운다. 라이트박스를 연 채 새로고침하면 태그만 남고 UI는 없는 고아 엔트리가 생기는데, 이 잔재를 치우지 않으면 이후의 히스토리 이동이 꼬인다.

### 2.5 기존 코드는 어떻게 되는가

- **PhotoSwipe — 옮긴다.** `openLightbox`가 직접 하던 replaceState·pushState·popstate 처리를 L1 매니저 호출로 바꾼다. 옮기면서 I6-(a)와 I6-(d)를 함께 적용하므로, 지금 잠복해 있는 두 문제 — 앞으로가기로 라이트박스 엔트리에 재진입할 때 최상단으로 튀는 것, 라이트박스를 연 채 리로드하면 생기는 고아 엔트리 — 가 같이 사라진다.
- **TagCloud — 옮기지 않는다.** 코드를 바꾸지 않고, native 분류를 의도적으로 쓴다는 사실과 그 근거(I4)만 이 문서에 남긴다. /tags 진입 엔트리로 되돌아올 때의 복원은 I5의 전역 기록이 함께 해결한다. 아무것도 바꾸지 않는 것도 검토를 거친 결정이므로 기록한다.
- **앵커 뒤로가기(이 문서의 발단) — 새 코드가 필요 없다.** I5가 곧 해법이다. 복원하는 주체는 계속 코어다. 우리는 코어가 두 번째로 쓰는 값이 브라우저가 첫 번째로 복원한 값과 같아지도록 재료만 채운다. 같은 값을 두 번 써도 결과가 한 번 쓴 것과 같은 성질을 멱등(Idempotent)이라고 하는데, 경합을 없애는 대신 경합을 무해하게 만드는 접근이다.

## 3. 검토한 대안과 기각 이유

| 안 | 내용 | 기각 이유 |
| --- | --- | --- |
| B | patch-package로 코어의 해시 분기에 기록 한 줄을 직접 심는다 | 규칙이 그 규칙을 어긴 코드 바로 옆에 살게 되므로 SSOT 관점에서는 가장 깨끗하다. 그러나 벤더 코드를 패치하면 버전을 올릴 때마다 패치가 여전히 맞는지 다시 검증해야 하고 CI에도 postinstall 단계가 붙는다([patch-package](https://github.com/ds300/patch-package)). 현 버전을 고정한 채 유지보수 부담 없이 오래 쓰겠다는 방침과 충돌한다 |
| C | v2 계열로 업그레이드한다 | 업스트림은 라우터를 개편하면서 해시 이동을 포함한 모든 pushState 앞에 좌표 기록을 넣어 이 문제를 이미 고쳤다([router.ts, main](https://github.com/vuejs/vitepress/blob/main/src/client/app/router.ts)). 근본 해결이지만 마이그레이션 비용이 있어 지금은 미룬다. 재상정 조건은 §5.3 |
| D | 테마의 popstate 리스너에서 코어의 복원을 차단한다 | 테마 리스너가 코어 리스너보다 늦게 실행되므로 막을 수 없다(§1.4) |
| E | 자체 라우팅 관문을 세운다 | §1.4와 같은 이유로 성립하지 않고, 범위도 목적에 비해 지나치게 커진다 |

## 4. 결과 (Consequences)

### 얻는 것

- 앵커 왕복에서 뒤로가기가 원래 위치로 돌아온다. 브라우저와 코어가 같은 값을 쓰게 되므로 사용자 눈에는 스크롤이 한 번만 움직인 것으로 보인다.
- 라이트박스의 앞으로가기 재진입 문제와 리로드 고아 문제가 사라진다.
- 테마 쪽 history 쓰기가 한 경로로 모인다. 새 작성자(윈도우 매니저)는 규칙 위에서 시작한다.
- 환경을 옮길 때 무엇을 가져가고 무엇을 버리는지가 문서로 정해져 있다.

### 감수하는 것

- `scrollPosition` 키 이름이 벤더에 묶인다. 버전을 고정했으므로 지금은 움직이지 않는 결합이다.
- pointerdown 시점과 실제 이동 시점 사이에 관성 스크롤이 조금 더 흐를 수 있다. 오차가 픽셀 단위라 감수한다.
- 페이지 안에서 아무 상호작용 없이 브라우저 버튼만으로 떠난 뒤 앞으로가기로 돌아오면, 마지막으로 찍힌 좌표로 복원된다. scrollend 이벤트로 기록을 보강하면 줄일 수 있는 사각이라 후속으로 남긴다([MDN — scrollend](https://developer.mozilla.org/en-US/docs/Web/API/Document/scrollend_event)).
- v2로 올라갈 때 L2는 전부 버리고 다시 쓴다. 층을 나눈 목적이 이 버리기를 싸게 만드는 것이므로 계획된 비용이다.

### 건드리지 않는 것

코어 파일, 검색, 사이드바, TagCloud.

## 5. 후속 (Follow-ups)

1. **코드 순서.** L1(상수 + 쓰기 헬퍼 + ephemeral 매니저) → L2(어댑터) → PhotoSwipe 이관. 끝나면 다섯 가지를 손으로 검증한다. ① 앵커 클릭 후 뒤로가기 ② 크로스 문서 왕복 ③ 태그 선택·해제·뒤로가기 ④ 라이트박스 열기·닫기·앞으로가기 ⑤ 라이트박스를 연 채 리로드한 뒤 뒤로가기.
2. **게시 의존.** `section: decisions`를 로더 glob에 추가하는 작업(기존 오픈 아이템)이 먼저다. `deriveDecisionId`도 손봐야 한다. 현행 정규식 `(adr|cdr|rfc)-(\d+)`는 이 문서의 슬러그에서 스코프가 빠진 `ADR-0001`을 만들어 낸다. explicit `id` 필드를 우선 읽도록 바꾸는 기존 오픈 아이템과 같은 작업이다.
3. **C안 재상정 조건.** v2가 안정되고 마이그레이션 비용을 다시 계산할 때. 채택하면 이 문서를 superseded로 바꾸고 L2만 버린다.
4. **의존 관계.** 플로팅 윈도우 매니저 CHR은 이 문서를 선행 의존으로 참조한다.

## 참고 출처

- vitepress@1.6.4 `dist/client/app/router.js` (로컬 확인, 2026-07-03) · [vuejs/vitepress router.ts (main)](https://github.com/vuejs/vitepress/blob/main/src/client/app/router.ts)
- [MDN — History.state](https://developer.mozilla.org/en-US/docs/Web/API/History/state) · [History.scrollRestoration](https://developer.mozilla.org/en-US/docs/Web/API/History/scrollRestoration) · [History.pushState](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState) · [scrollend](https://developer.mozilla.org/en-US/docs/Web/API/Document/scrollend_event)
- [DOM Standard — Events](https://dom.spec.whatwg.org/#introduction-to-dom-events) · [W3C Pointer Events](https://www.w3.org/TR/pointerevents/#the-pointerdown-event)
- [Alistair Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
