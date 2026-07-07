---
doc_type: adr
title: "RDSM ADR-0003: v2.0.0 재포지셔닝 — 복잡성 은닉과 Two-Track API 분리"
date: 2026-04-06
lastmod: 2026-04-06
author: "Davi"
description: "1128줄 DomainState 과부하를 코어-어댑터 패턴으로 분해하고, SI 구원자·모던 Headless Two-Track 진입점을 코드 레벨에서 분리하며, Idempotency-Key 도입과 v1.1.x~v2.0.0 단계 로드맵을 확정한 전략 재설계."
slug: adr-0003-alignment
section: deep-dive
category: "deep-dive/rest-domain-state-manager"
tags: [adr, architecture, core-adapter, two-track, idempotency-key, repositioning, dsm]

order: 3
series: "REST DSM ADR"
series_order: 3
status: "active"
draft: false
search: true
toc: true

project: "Rest Domain State Manager"
milestone: ~

decision_status: "accepted"
deciders: ["Davi"]
period:
  start: 2026-04-06
  end: ~
related_decisions: [ADR-0000, ADR-0001, ADR-0002]
issue: ~

ai_assistance:
  authorship: human
  role: [research, review]
  model: ["claude-opus-4.7"]
  review: verified
---


# ADR 0003 Alignment

## REST Domain State Manager — v1.1.x → v2.0.0 방향 재설계 리포트

> v1.0.0은 내부 아키텍처(Proxy 최적화, DI 컨테이너, Shadow State, 보상 트랜잭션)가
> 외부 API 설계로 충분히 번역되지 못한 채 릴리즈됐다.
>
> 외부 피드백은 코드 품질에 대한 지적이 아니다.
> **인터페이스 설계와 포지셔닝 전략의 실패**를 지목한 것이다.
> 라이브러리의 복잡성이 '숨겨진 것'이 아니라 '누적된 것'처럼 보이는 게 문제다.
>
> v2.0.0의 목표는 기능 추가가 아니다. 지금 있는 기술을 다시 포장하는 것이다.

---

### 1. 외부 피드백 요약 및 진단

#### 1.1. 피드백 원문

> "기술적 역량 쇼케이스로는 100점 만점에 90점 이상이지만,
> 실무자 관점에서 굳이 이걸 왜 쓰냐는 말이 나올 것 같다."

#### 1.2. DomainState 과부하 — 1128줄의 단일 클래스

`DomainState.js`가 현재 수행하는 역할 목록:

- Proxy 기반 변경 추적 (`changeLog`, `dirtyFields`)
- HTTP 메서드 자동 분기 (`isNew` + `dirtyRatio` + `DIRTY_THRESHOLD`)
- `structuredClone` 기반 스냅샷 & 롤백 (`#snapshot`)
- Shadow State (`subscribe` / `getSnapshot` / Structural Sharing)
- BroadcastChannel 디버그 브로드캐스팅 (`_broadcast`)
- `DomainPipeline` 팩토리 DI 컨테이너 (`_pipelineFactory` 클로저)
- React `useSyncExternalStore` 어댑터 인터페이스 (`#listeners`)

이 모든 역할이 단일 클래스에 밀집되어 있다.
개발자가 `user.data.name = 'Davi'` 한 줄을 쓸 때,
그 뒤에서 위 7가지가 동시에 동작한다는 사실을 인지할 방법이 없다.

> **API가 단순한 것과 복잡성이 숨겨진 것은 다르다.**
> 전자는 "몰라도 된다"이고, 후자는 "알아야 할 때 알 수가 없다"이다.

#### 1.3. `index.js` 진입점이 증명하는 문제

```javascript
// v1.0.0 index.js 최하단
export {
    ApiHandler, DomainState, DomainVO, DomainPipeline,
    DomainRenderer, FormBinder, closeDebugChannel
};
```

DOM 렌더링 플러그인, HTTP 핸들러, 도메인 상태 엔진, 디버그 채널 종료 함수가
같은 줄에 나란히 export된다.
설치한 개발자가 처음 이 목록을 보는 순간 "내가 뭘 설치한 거지?"라는 의문이 든다.

#### 1.4. 타겟 유저가 두 명인데 진입점이 하나다

> SI 구원자 트랙과 모던 Headless 트랙은 가치 명제(Value Proposition)부터 다르다.
> 같은 README와 같은 API 문서로 두 타겟에게 동시에 어필하는 건
> 둘 다 설득하지 못하는 가장 확실한 방법이다.

| 구분      | SI 구원자 트랙                          | 모던 Headless 트랙                   |
| --------- | --------------------------------------- | ------------------------------------ |
| 사용자    | JSP + jQuery + Spring 개발자            | React / Vue 개발자                   |
| 핵심 가치 | `fnAddRow()` 보일러플레이트 제거        | 서버 상태 동기화 자동화              |
| 경쟁 상대 | 없음 (레거시 공백)                      | TanStack Query, SWR, Valtio          |
| 도입 방법 | `<template>` + `bindCollection()` 한 줄 | `fromJSON()` + `useDomainState()` 훅 |

---

### 2. 대목표: v2.0.0이 달성해야 할 두 가지

#### 2.1. 기술을 개발자에게서 완전히 숨긴다

Proxy가 뭔지, `structuredClone`이 뭔지, Shadow State가 뭔지
소비자 개발자가 전혀 몰라도 쓸 수 있어야 한다.

**판단 기준:**

- "JSP 신입 개발자가 README 10분 읽고 동작하는 그리드를 만들 수 있는가?"
- "React 중급 개발자가 `useDomainState()` 한 줄로 서버 상태와 컴포넌트를 연결할 수 있는가?"

#### 2.2. Two-Track API 설계를 코드 레벨까지 명시적으로 분리한다

문서 레벨의 "두 개의 트랙"이 아니라,
**npm 패키지 내부에서 두 개의 진입점이 물리적으로 분리**되어 있어야 한다.

---

### 3. 아키텍처 개편: 코어-어댑터 패턴

#### 3.1. Core 분리 기준 확정

Core는 다음 조건을 모두 만족하는 것만 포함한다:

1. 브라우저 / Node.js / Worker 환경 어디서도 동작한다 (DOM 없음, `fetch` 없음)
2. 외부 I/O를 직접 수행하지 않는다 (HTTP 요청 없음, BroadcastChannel 없음)
3. 프레임워크 의존성이 없다

이 기준을 적용하면 Core에 남는 것은 셋이다:

| 모듈            | 역할                                 |
| --------------- | ------------------------------------ |
| `DomainVO.js`   | 스키마 선언 및 검증                  |
| `api-proxy.js`  | Proxy 래핑 + changeLog 기록          |
| `api-mapper.js` | changeLog → RFC 6902 JSON Patch 변환 |

`DomainState`의 현재 역할 중 Core에 속하는 것은 없다.
`DomainState`는 Core를 조합하고 네트워크 레이어와 연결하는 **Orchestrator(조율자) 레이어**다.

#### 3.2. 패키지 구조 재설계

```text
@2davi/rest-domain-state-manager      ← 메인 패키지 (이름 유지)
│
├── Core Engine (내부, 직접 노출 안 함)
│   ├── api-proxy.js          Proxy 래핑, changeLog 기록
│   ├── api-mapper.js         toPatch(), toPayload()
│   └── DomainVO.js           스키마 선언 베이스 클래스
│
├── [어댑터 A] UI 플러그인 — peerDep: 없음 (Vanilla JS)
│   ├── UIComposer.js         DomainState.use(UIComposer)로 설치
│   ├── UILayout.js           화면 단위 UI 계약 선언 베이스 클래스
│   └── src/ui/               <template> 기반 CollectionBinder 등
│       → 진입점: index.js 메인 export에 포함
│
├── [어댑터 B] 모던 프레임워크 어댑터 — peerDep: react (optional)
│   └── adapters/react.js     useDomainState() 커스텀 훅
│       → 진입점: 서브패스 export (기존 유지)
│
└── [Orchestrator] DomainState, DomainPipeline, ApiHandler
    → 두 어댑터가 이 레이어를 공통으로 사용
```

**핵심 원칙:**
어댑터 A(UI 플러그인)와 어댑터 B(모던 어댑터)는 서로를 알지 못한다.
두 어댑터 모두 Orchestrator 레이어의 `DomainState`를 통해서만 Core에 접근한다.

#### 3.3. `save()`의 소속 결정 — 확정

> `save()`는 "현재 상태를 저장하면서 백엔드-DB 서버와 동기화하는" 행위다.
> 이 개념적 정의에 따라 `save()`는 `DomainState`(Orchestrator)가 소유한다.

- `DomainState`는 **무엇을 저장할지** (HTTP 메서드 분기, Payload 직렬화)를 결정한다.
- `ApiHandler`는 **어떻게 전송할지** (`fetch` 실행, 헤더 조립, 에러 정규화)를 담당한다.

이 관심사 분리 구조는 현행 유지한다.

Transport-Agnostic 확장(WebSocket, GraphQL 연결)을 위한
`configure({ transportFactory })` 인터페이스는 v2.x 이후 별도 논의한다.

---

### 4. 신규 기능 설계

#### 4.1. Idempotency-Key 인터셉터 (v1.1.x)

##### 4.1.1. 판단 근거

> `api-handler.js`의 `_fetch()`는 지금 요청을 한 번 쏘고 끝이다.
> 타임아웃 또는 네트워크 오류로 클라이언트가 응답을 못 받았을 때,
> 서버가 실제로 처리를 완료했는지 알 방법이 없다.
> 이 상태에서 재시도하면 POST는 리소스를 중복 생성한다.

- HTTP 레이어에서 멱등성(Idempotency)을 보장하는 표준 방법은 `Idempotency-Key` 헤더를 사용하는 것이다.
  - [IETF — The Idempotency-Key HTTP Header Field (draft)](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
  - [Stripe API 문서 — Idempotent Requests](https://stripe.com/docs/api/idempotent_requests)
  - 서버는 동일 UUID의 재요청을 감지하면 중복 처리 없이 이전 응답을 반환한다.
- 자동 재시도는 라이브러리가 담당하지 않는다.
  소비자가 catch 블록에서 `save()`를 다시 호출하면 동일 UUID가 재사용된다.
  이 사실을 README와 API 문서에 명시한다.
- `#csrfToken`의 3-상태 패턴(`undefined` / `null` / `string`)을 그대로 벤치마킹한다.
  이미 검증된 패턴이며, `DomainState`와 `ApiHandler` 양쪽 모두 동일한 설계 언어를 사용하는 일관성을 얻는다.

##### 4.1.2. UUID 생명주기 설계

`DomainState` private field `#idempotencyKey`의 3-상태:

| 상태            | 의미                          | `_fetch()` 동작              |
| --------------- | ----------------------------- | ---------------------------- |
| `undefined`     | 기능 비활성 또는 요청 대기 전 | 헤더 삽입 없음               |
| `string` (UUID) | 요청 진행 중 / 재시도 대기 중 | `Idempotency-Key` 헤더 주입  |
| 성공 직후       | 즉시 `undefined`로 초기화     | 다음 `save()`는 새 UUID 발급 |

```text
save() 진입
  → ApiHandler.idempotent 옵션 확인
  → crypto.randomUUID() 발급 → #idempotencyKey 저장
  → #snapshot 캡처 (기존 동일)
  → _fetch() → Idempotency-Key 헤더 포함
  → 성공 → #idempotencyKey = undefined
  → 타임아웃/오류 → #idempotencyKey 유지
  → catch 블록에서 save() 재호출 → 동일 UUID 재사용
  → 최종 성공 → #idempotencyKey = undefined
```

##### 4.1.3. 실천 과제 (Outline)

###### 4.1.3.A. STEP 1. `ApiHandler` 생성자 옵션 추가

1) 생성자 파라미터에 `idempotent: boolean` 옵션을 추가한다. 기본값 `false`.
2) `this._idempotent` 인스턴스 필드에 저장한다.
3) `DomainState.save()` 내부에서 `handler._idempotent`를 확인하여 UUID 발급 여부를 결정한다.

###### 4.1.3.B. STEP 2. `DomainState`에 `#idempotencyKey` private field 추가

1) `#idempotencyKey = undefined` 로 선언한다.
2) `save()` 진입 시 `handler._idempotent === true`이면 `crypto.randomUUID()`를 발급하여 저장한다.
3) `_fetch()` 호출 전 `#idempotencyKey`가 `string` 상태이면 `Idempotency-Key` 헤더를 `headers` 객체에 추가한다.
   - `MUTATING_METHODS` 상수를 재사용한다. 적용 범위: POST / PUT / PATCH / DELETE.

###### 4.1.3.C. STEP 3. 성공/실패 분기 처리

1) 성공 경로: `clearChangeLog()` 직후 `#idempotencyKey = undefined` 초기화.
2) 실패 경로 (`catch` 블록): `_rollback(#snapshot)` 수행 후 `#idempotencyKey`를 유지한다.
   소비자가 `save()`를 재호출하면 동일 UUID가 그대로 사용된다.
3) `restore()` 호출 시: `#snapshot`을 `undefined`로 초기화함과 동시에 `#idempotencyKey = undefined`로 초기화한다.
   복원 이후에는 재시도 맥락 자체가 사라진다.

###### 4.1.3.D. STEP 4. Vitest 단위 테스트 작성

1) `idempotent: true` 옵션 활성화 시 `Idempotency-Key` 헤더가 요청에 포함되는지 확인.
2) POST 성공 후 `#idempotencyKey`가 `undefined`로 초기화되는지 확인.
3) 실패 후 `save()` 재호출 시 동일 UUID가 재사용되는지 확인.
4) `idempotent: false`(기본) 상태에서 헤더가 삽입되지 않음을 확인.

---

#### 4.2. `lazy` Tracking Mode + Worker Diff 오프로딩 (v1.2.x)

##### 4.2.1. 판단 근거 — `save()` 스냅샷 오프로딩은 불가

> `save()` 내부의 `structuredClone(this._getTarget())`을 Worker로 오프로딩하면
> clone 완료 전 소비자가 `state.data.name = '다른값'`을 쓸 수 있다.
> 비동기 구간이 생기는 순간 스냅샷의 시점 보장이 깨진다.

- **결론: `save()` 스냅샷의 `structuredClone`은 Worker로 오프로딩하지 않는다.**
- 이미 구현된 `serializer_worker.js`가 올바른 오프로딩의 기준점이다.
  `_stateRegistry` 전체 직렬화는 결과로 상태를 변경할 일이 없기 때문에 안전하다.
  반면 `save()` 스냅샷은 상태 일관성의 기준점이므로, 비동기 구간을 열어서는 안 된다.
- **`lazy` tracking mode의 deep diff 연산이 진짜 오프로딩 대상이다.**
  - `lazy` 모드에서 `save()` 호출 시 diff 연산 중 소비자가 데이터를 변경해도,
    Proxy `set` 트랩은 changeLog 기록을 `save()` 이후로 미루는 구조이므로 타이밍 충돌이 발생하지 않는다.

```text
save() 호출 (lazy 모드)
  → worker.postMessage({ target: current, initial: _initialSnapshot })
  → diff 연산 (Worker에서 수행) — 메인 스레드 비차단
  → changeLog 반환
  → fetch() 실행
```

##### 4.2.2. 두 가지 추적 모드

> 개발 환경과 운용 환경의 기본값을 라이브러리가 결정하는 것은 비즈니스 차원의 결정이다.
> 라이브러리는 선택지를 제공하고, 결정은 소비자에게 위임한다.

| 모드                | 동작                                                                          | 적합한 상황                                     |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| `'realtime'` (기본) | Proxy `set` 트랩 발화마다 changeLog에 즉시 기록                               | 개발 단계 디버깅, 데이터 흐름 가시성 필요 시    |
| `'lazy'` (신규)     | `save()` 호출 시점에 `_initialSnapshot`과 현재 상태를 diff하여 changeLog 생성 | 운용 환경 성능 최적화, 네트워크 페이로드 최소화 |

`trackingMode`는 각 `DomainState` 인스턴스 생성 시 명시적 플래그로 선택한다.
라이브러리 전역 기본값으로 설정하지 않는다.

```javascript
const user = DomainState.fromJSON(jsonText, api, {
    trackingMode: 'realtime', // 기본값. 개발 단계.
});

const user = DomainState.fromVO(new UserVO(), api, {
    trackingMode: 'lazy',     // save() 시점에 초기값 대비 diff 계산.
});
```

##### 4.2.3. `itemKey` 기반 LCS(Longest Common Subsequence) Diff

- 순수 위치(positional) 기반 Diff는 "행 삭제 후 신규 추가" 케이스에서 잘못된 patch를 생성한다.
  초기 배열 `[{id:1},{id:2}]`에서 `{id:1}`을 삭제하고 `{id:3}`을 추가하면,
  위치 기준 diff는 두 개의 `replace`로 오독한다. 실제 의도는 `remove {id:1}` + `add {id:3}`이다.
- `UILayout.static itemKey`로 지정된 필드를 기준으로 LCS 기반 diff를 수행한다.
- `itemKey`가 없는 경우 신규 항목(`id: null` 또는 `id: ''`)은 무조건 `add`,
  초기 배열에만 있고 현재 배열에 없는 항목은 `remove`로 처리하는 방어 로직을 적용한다.
- [LCS 알고리즘 참조 — cs.columbia.edu](https://www.cs.columbia.edu/~allen/S14/NOTES/lcs.pdf)

##### 4.2.4. 실천 과제 (Outline)

###### 4.2.4.A. STEP 1. `trackingMode` 옵션 추가

1) `DomainState.fromJSON()` / `fromVO()` options에 `trackingMode: 'realtime' | 'lazy'` 추가.
2) `DomainState` 인스턴스 생성 시 `this._trackingMode`에 저장한다.
3) `'lazy'` 모드일 때 `fromJSON()` / `fromVO()` 내부에서 `_initialSnapshot = structuredClone(target)`을 저장한다.

###### 4.2.4.B. STEP 2. Proxy `set` 트랩 분기 추가

1) `api-proxy.js`의 `set` 트랩 내부에서 `_trackingMode === 'lazy'`이면 changeLog 기록 로직을 건너뛴다.
2) `_initialSnapshot` 저장은 `set` 트랩과 무관하게 유지된다.

###### 4.2.4.C. STEP 3. `lazy` diff Worker 구현

1) `src/workers/diff.worker.js`를 신설한다.
2) Worker는 `{ target, initial, itemKey? }` 메시지를 수신하여 deep diff를 수행하고 changeLog 배열을 반환한다.
3) `new Worker(new URL('./diff.worker.js', import.meta.url))`로 동적 임포트하여 번들러 호환성을 확보한다.

###### 4.2.4.D. STEP 4. `src/common/` LCS diff 유틸 구현

1) `src/common/lcs-diff.js`를 신설한다.
2) `itemKey` 지정 시 해당 필드 기준 LCS 알고리즘으로 배열 동일성을 판단한다.
3) `itemKey` 미지정 시 신규/삭제 방어 로직을 적용한다.
4) diff.worker.js 내부에서 이 유틸을 import한다.

###### 4.2.4.E. STEP 5. Vitest 단위 테스트 작성

1) `'realtime'` / `'lazy'` 분기 정확성: 각 모드에서 `save()` 이전 changeLog 상태 확인.
2) `'lazy'` diff 정확성: 항목 삭제 + 신규 추가 케이스에서 `replace` 대신 `remove` + `add`가 생성되는지 확인.
3) `itemKey` 기반 LCS: 위치 이동이 아닌 동일성 기준으로 diff가 수행되는지 확인.

---

#### 4.3. `DomainCollection` 클래스 + `saveAll({ strategy: 'batch' })` (v1.3.x)

> adr-0002-extensions.md 5부의 설계 원칙과 adr-0002-alignment.md 5.1.2의 실천 과제를
> 기준 문서로 삼는다. 여기서는 v1.3.x 맥락에서 확정된 결정 사항만 기록한다.

##### 4.3.1. 판단 근거 — 확정 사항

- **`batch` 전략 단독 구현:** SI 레거시 환경에서 1:N 배열 저장 시 백엔드는 대부분
  리스트 전체를 한 번에 덮어쓰는 방식으로 처리한다.
  `sequential` / `parallel`은 `DomainPipeline` 보상 트랜잭션 완성 이후 v2.x에서 연계한다.
- **`Nested Array` 선언 방식 — 런타임 연결 채택:**
  `DomainVO.static fields`에 `type: DomainCollection`을 선언하면 순환 참조 문제가 재발한다.
  `DomainVO`는 `static fields`에 배열 기본값(`default: []`)만 선언하고,
  `bindCollection()` 호출 시점에 라이브러리가 런타임에 해당 필드를 `DomainCollection`과 연결한다.
- **`lazy` 모드에서 배열 전체 Diff의 정확성은 `itemKey`에 달려있다.**
  이는 4.2.4.D에서 구현하는 LCS diff 유틸을 재사용한다.
- **`saveAll()` MVP는 `batch` 전략 단독 구현이다.**

---

### 5. Two-Track DX 설계 — 코드 레벨 구체화

#### 5.1. SI 구원자 트랙 진입 시나리오

```html
<!-- JSP 화면 — 개발자가 작성하는 것 전부 -->
<template id="certRowTemplate">
    <tr>
        <td><input type="checkbox" class="dsm-checkbox"></td>
        <td><input type="text" data-field="certName"></td>
        <td><select data-field="certType"></select></td>
    </tr>
</template>

<table>
    <tbody id="certGrid"></tbody>
</table>
<button id="btnAdd">행 추가</button>
<button id="btnRemove">선택 삭제</button>
<button id="btnSave">저장</button>
```

```javascript
// JSP 인라인 스크립트 — 개발자가 작성하는 것 전부
import { DomainState, UIComposer } from '@2davi/rest-domain-state-manager';

DomainState.use(UIComposer);

const certState = await api.get('/api/certificates');

const { addEmpty, removeChecked } = certState.bindCollection('#certGrid', {
    templateSelector: '#certRowTemplate',
    columns: {
        certName: { selector: '[data-field="certName"]', required: true },
        certType: { selector: '[data-field="certType"]' },
    },
});

document.getElementById('btnAdd').onclick    = addEmpty;
document.getElementById('btnRemove').onclick = removeChecked;
document.getElementById('btnSave').onclick   = () => certState.save('/api/certificates');
```

> 이 시나리오에서 개발자가 직접 작성한 코드: HTML 11줄 + JS 16줄.
> 기존 `fnAddRow()`, `fnRemoveRow()`, `fnReindexRows()`, `fnSelectAll()` — 전부 사라진다.

---

#### 5.2. 모던 Headless 트랙 진입 시나리오

```javascript
// React 컴포넌트 — 개발자가 작성하는 것 전부
import { useDomainState } from '@2davi/rest-domain-state-manager/adapters/react';

function UserProfile({ api }) {
    const user = useDomainState(() => api.get('/api/users/me'));

    if (!user) return <div>Loading...</div>;

    return (
        <div>
            <input
                value={user.snapshot.name}
                onChange={e => { user.state.data.name = e.target.value; }}
            />
            <button onClick={() => user.state.save('/api/users/me')}>저장</button>
        </div>
    );
}
```

> 이 시나리오에서 개발자가 직접 작성한 코드:
> `fetch` 없음, `useState` 없음, `useEffect` 없음, 롤백 로직 없음.

---

#### 5.3. README 분기 구조

두 트랙을 README 최상단에서 즉시 분기한다:

```markdown
## 어떤 환경에서 쓰시나요?

### JSP / 레거시 환경 → [빠른 시작: 그리드 UI](#si-quickstart)
Spring Boot + JSP + jQuery 환경에서 1:N 폼 그리드를 10줄로 만드세요.

### React / Vue → [빠른 시작: 훅 연동](#modern-quickstart)
useDomainState() 한 줄로 GET → 수정 → PATCH 사이클을 자동화하세요.
```

---

### 6. v2.0.0 이전 필수 해결 항목

> 아래 세 항목은 `UIComposer` 구현 착수 이전에 반드시 확정해야 하는 선행 의사결정이다.
> 열어둔 채로 `CollectionBinder` 구현에 진입하면 인터페이스가 뒤에서 뜯겨나간다.

#### 6.1. `configure({ transportFactory })` 설계 범위 결정

**결정: v2.0.0 범위에서는 설계만 문서화하고 구현하지 않는다.**

- `save()`는 `DomainState`(Orchestrator)가 소유하고,
  HTTP 전송은 `ApiHandler`에 위임하는 현재 구조를 공식 확정한다.
- v2.x 이후 `configure({ transportFactory })` 인터페이스를 열어두되,
  이 결정을 API 문서에 명시하여 소비자가 WebSocket 연결을 시도하다가 막히는 상황을 사전에 방지한다.

#### 6.2. `UILayout mode: 'read'` 처리 방식 결정

두 가지 선택지를 검토했다:

>
> **Option A — 동일 템플릿 내 `input` → `disabled` / `textContent` 치환:**

- 단점: SI 환경에서 `<input class="form-control">` 패딩·보더가 `<span>`으로 바뀌면 레이아웃 붕괴.
  라이브러리가 DOM 구조를 통제하지 않는다는 설계 원칙과 충돌.

>
> **Option B — `readonlyTemplateSelector` 별도 선언:**

- 장점: 개발자가 읽기 전용 레이아웃을 완전히 통제. "통제권은 HTML 작성자에게" 설계 원칙 유지.
- 단점: 템플릿 파일이 두 개로 늘어남.

**결정: Option B 채택.**

`UILayout`의 `static readonlyTemplateSelector`를 선택적으로 선언할 수 있게 한다.
미선언 시 `mode: 'read'`로 `bindCollection()` 호출하면 즉시 에러를 throw한다.
조용히 잘못된 레이아웃을 렌더링하는 Silent Failure를 허용하지 않는다.

```javascript
class CertificateReadLayout extends UILayout {
    static templateSelector         = '#certRowTemplate';     // 편집 모드
    static readonlyTemplateSelector = '#certRowReadTemplate'; // 읽기 모드 (선택)
    static itemKey  = 'certId';
    static columns  = { ... };
}
```

#### 6.3. CollectionBinder 권장 최대 행 수 및 guard 수치

> 실측 테스트 없이 수치를 박으면 임의적인 제약이 된다.

`UIComposer` 구현 완료 후 아래 두 케이스를 `performance.measure()`로 실측하여 수치를 결정한다:

| 측정 대상                                 | 측정 지점                                |
| ----------------------------------------- | ---------------------------------------- |
| `addEmpty()` 100회 연속 실행 시 누적 시간 | DOM 삽입 + `DomainCollection.add()` 포함 |
| `save()` 직전 `structuredClone` 시간      | 행 100개 × 필드 10개 기준                |

측정 결과가 **50ms(Long Task 기준)** 를 초과하는 행 수를 guard 임계값으로 설정한다.

>
> guard 발동 시 동작:

- `throw`가 아닌 `console.warn`으로 처리한다.
- 라이브러리가 소비자의 렌더링을 강제로 차단하는 것은 과도한 개입이다.
- 경고만 출력하고 동작은 계속 진행한다.

---

### 7. 구현 순서 (v1.1.x → v2.0.0)

```text
v1.0.0  ── 현재 릴리즈 (CSRF, DI, Rollup, Shadow State, 보상 트랜잭션)
  │
  ├── v1.1.x  Idempotency-Key 인터셉터
  │           ApiHandler { idempotent } 옵션
  │           DomainState #idempotencyKey private field
  │           save() UUID 생명주기 구현
  │           Vitest: 중복 방지 + 재시도 동일 UUID 검증
  │
  ├── v1.2.x  lazy tracking mode + Worker diff 오프로딩
  │           trackingMode: 'realtime' | 'lazy' 옵션
  │           _initialSnapshot (인스턴스 생성 시점 저장)
  │           src/workers/diff.worker.js 신설
  │           src/common/lcs-diff.js 신설 (itemKey 기반 LCS)
  │           Vitest: 모드 분기 정확성 + LCS diff 케이스
  │
  ├── v1.3.x  DomainCollection + saveAll({ strategy: 'batch' })
  │           adr-0002-extensions 5.1.2 실천 과제 진행
  │           saveAll() batch 전략 단독 구현
  │           sequential / parallel은 v2.x 이후 연계
  │
  ├── v1.4.x  UIComposer + UILayout + src/ui/ 레이어 신설
  │           선행 확정: 6.2 readonlyTemplateSelector 결정 완료 상태에서 착수
  │           HTML <template> 기반 CollectionBinder
  │           bindCollection() 컨트롤 함수 반환 패턴
  │           sourceKey + sources 옵션 주입 완성
  │           FormBinder, DomainRenderer 공식 deprecated
  │           plugins/ 레이어 프레임워크 어댑터 공간으로 재정의
  │           6.3 실측 테스트 완료 → guard 수치 확정
  │
  ├── v1.5.x  디버깅 및 미반영 주석 확인
  │           v1.1.x ~ v1.4.x 전체 구간의 JSDoc 누락/불일치 점검
  │           Vitest 커버리지 전수 확인
  │           엣지 케이스 및 Silent Failure 방어 로직 보강
  │           콘솔 출력 레벨 재검토 (warn / error / devWarn 일관성)
  │
  ├── v1.6.x  WebDoc rebuild
  │           VitePress 문서 전면 갱신
  │           README Two-Track 분기 구조 (5.3) 반영
  │           TypeDoc 재생성 + subpath export 문서화
  │           SI 트랙 / 모던 트랙 Quick Start 예제 페이지 작성
  │           VitePress Interactive Playground 컴포넌트 갱신
  │
  └── v2.0.0  --allow-empty 릴리즈 커밋
              v1.x.x 전체 사이클 완료 선언
              CHANGELOG 통합 정리
              configure({ transportFactory }) 설계 명세 문서 게시
```

---

### 8. 미결 사항 (v2.x 이후 논의)

아래 항목은 이 문서의 논의 범위를 벗어난다. 향후 구현 단계에서 별도 논의한다.

1. **`configure({ transportFactory })`** — WebSocket / GraphQL 연결 인터페이스 상세 설계 (v2.x 이후)
2. **`plugins/` 프레임워크 어댑터 상세 설계** — Vue용 `useCollection()` composable, React용 `useDomainCollection()` hook (v2.x 이후)
3. **`sequential` / `parallel` saveAll 전략** — `DomainPipeline` 보상 트랜잭션 완성 이후 연계 (v2.x 이후)
