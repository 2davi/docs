---
doc_type: adr
title: "RDSM ADR-0001: V8 최적화·RESTful 무결성·ESM 패키징 방향 정렬"
date: 2026-03-26
lastmod: 2026-03-26
author: "Davi"
description: "DomainVO로 V8 히든클래스를 고정하고 Proxy Trap을 경량화하며, RFC 7396 기반 HTTP 메서드 자동 분기의 멱등성을 보장하고, 순수 ESM 패키징과 Framework-Agnostic 데이터 레이어 포지셔닝을 정렬한 설계 결정."
slug: adr-0001-alignment
section: "decisions"
category: "rdsm"
tags: [adr, v8, hidden-class, proxy, rest, idempotency, esm, dsm]

order: 1
series: "REST DSM ADR"
series_order: 1
status: "active"
draft: false
search: true
toc: true

project: "Rest Domain State Manager"
id: RDSM-ADR-0000
milestone: ~

decision_status: "accepted"
deciders: ["Davi"]
period:
  start: 2026-03-26
  end: ~
related_decisions: [RDSM-ADR-0000]
issue: ~

ai_assistance:
  authorship: human
  role: [research, review]
  model: ["claude-opus-4.7"]
  review: verified
---


## 목적: V8 엔진 한계 최적화 및 2026년 아키텍처 동향 반영

## 지적 사항

### 1. 프로젝트 아키텍처 현황 (디렉토리 구조 진단)

> `src/` 하위 디렉토리로 `core`, `handler`, `common`, `constants`, `debug`로 분리해 모듈화의 기본을 갖추려 애는 썼으나,
> NPM 라이브러리로서의 완성도를 생각하면 근본적인 구조에 치명적인 _설계 결함_ 이 존재한다.

- 라이브러리의 핵심 도메인 모델이 되어야 할 `DomainState.js`, `DomainVO.js`, `DomainPipeline.js` 파일들이 `src/` 외부인 루트의 `model/` 디렉토리에 빠져 있다.
- `plugin/` 디렉토리 역시 별도로 분리되어 있는 파편화된 구조를 보인다.
- 모듈의 캡슐화가 제대로 이루어지지 않으면 패키지 번들링 과정에서 **Entry Point** 추적을 복잡하게 한다.
- 2026년 최신 프론트엔드 생태계에서 가장 중요하게 여겨지는 Tree-shaking(사용하지 않는 코드를 빌드 타임에 제거하는 최적화 기법) 효율을 급격히 떨어뜨린다.

### 2. JS Proxy 기반 상태 추적과 V8 엔진의 Inline-Caching

> DTO를 본뜬 JS Object를 Proxy로 감싸서 (1)내부에 그 자체의 상태 변화를 기록하고 (2)HTTP Method를 분기하는 아이디어는 보일러플레이트를 줄이는 측면에서 유용하다.
> 하지만 두 가지 문제를 필연적으로 해결해야 하는데, 하나는 V8 엔진 최적화, 또 하나는 자동 분기로 인한 데이터 무결성 훼손 사고의 철저한 방지책이다.

- JavaScript는 동적 타입 언어이지만, V8 엔진은 내부적으로 C++ 구조체를 따라가는 **히든 클래스(또는 Maps)**를 생성해 객체 프로퍼티에 접근하는 속도를 비약적으로 높였다.
- Inline-Caching: 여러 객체가 동일한 속성을 동일한 순서로 생성되면, 이 골격이 같다는 판단을 하여 프로퍼티의 Memory Offset 위치를 캐싱한다.
- 객체를 동적으로 다루며 프로퍼티를 들쭉날쭉하게 관리하면, V8 최적화 컴파일러인 TurboFan은 _예측 불가능한 코드_ 라고 판단하여 최적화를 포기한다. (`De-optimization`)
- `DomainVO`를 _"객체의 Shape이 생명주기 내내 절대 변하지 않는다"_ 라고 V8에게 제시할 강력한 계약 수단으로 격상하지 않으면 성능 상 이점이 없어진다.

| V8 최적하 저해 요소 | Proxy 기반 상태 관리에서의 문제점                                       | 프로젝트에 적용할 해결 방향                                                                  |
| ------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 히든 클래스 변경    | 런타임에 REST 응답 데이터를 파싱하여 빈 객체에 동적으로 할당할 때 발생. | `DomainVO`를 통해, 객체 생성 시점에 모든 프로퍼티의 Shape을 고정 (필드, 타입, 검증함수 강제) |
| 인라인 캐싱 무력화  | Proxy 내부 트랩에 무거운 검증 또는 상태 변이 로직을 수행할 때 발생.     | Trap을 극도로 경량화 + 실제 값 반환에서 `Reflect.get`을 사용해 V8의 Slow path 진입을 최소화. |
| 메모리 Bloating     | Neasted Obj를 초기화 시점에 재귀적으로 Proxy로 감쌀 때.                 | Lazy Proxying의 시점을 정교하게 최적화.                                                      |

### 3. HTTP Method 자동 분기 (RESTful 설계 철학 및 상태 추적 메커니즘)

> 상태 변경 이력을 바탕으로 HTTP Method 분기를 자동으로 처리해준다는 발상은 편의성 측면에서 달가우나,
> RESTful Architecture의 멱등성`Idempotency`과 상태 변이`State Mutation` 스펙을 정확히 이해하지 못한 자동화 로직으로는 데이터 무결성이 훼손된다.

- REST API 설계에서 HTTP 메서드는 단순한 '액션'을 넘어서, _리소스에 대한 '의도'와 '부작용의 범위'를 서버-클라이언트 간에 약속하는 규약_ 이다.
- POST(Create, 비멱등성): `DomainState`에 식별자(ID)가 없으면 서버로 요청 전송 시 무조건 POST로 강제해야 한다.
  - 같은 이유로, 서버로부터 넘겨받아 식별자를 확인했을 시, 내부 플래그 `isNew = false`로 전환하여 POST 요청을 원천 차단해야 한다.
- PUT(Replace,멱등성): PUT은 타겟 리소스를 '완벽하게 교체'한다는 뜻이다. PUT 분기를 타면 객체의 모든 필드를 변경 여부와 무관하게 JSON Payload에 담아야 한다.
- PATCH(Modify, 부분/비멱등성): PATCH는 리소스의 '변경된 부분'만을 병합하는 역할이다. `RFC 7396 Merge Patch` 스펙을 완벽하게 준수하는 Payload를 작성해야 한다.
- JAVA Hibernate에서도 사용되는 Dirty Checking 메커니즘 참조.
  1. **상태 플래그 기반 추적:** `DomainState` 내에 `_dirtyFields` 라는 이름으로 Set 객체 혹은 Bitmask 플래그 필드를 둔다. => changeLog와는 다른 개념인지 확인 필요
  2. **스마트 자동 분기 알고리즘:** 변경 감지된 필드가 전체의 일정 비율을 넘어설 때 자동으로 PUT을 선택하도록, 내부 분기 알고리즘을 고도화한다.
  3. **낙관적 업데이트와 롤백:** 서버 응답을 받기 전 프론트엔드의 `DomainState`를 먼저 변경시켜 UI 반응성을 극대화하고, API 호출이 실패(`400 Bad Request`, `500 Server Error` 등)했을 시 이전 스냅샷 상태로 데이터를 즉시 롤백하는 복구 파이프라인이 완벽한 구조로 내장되어야 한다.

### 4. BroadcastChannel API를 활용한 DevTool 동기화의 명암

> `DomainState` 객체의 상태를 시각화하기 위해, 동일 출처 내에서 발행-구독 모델을 통해서 O(1) 브로드캐스팅을 구현한 것은 성능적으로 올바른 방향이다.

- 네트워크 I/O가 없는 브라우저 내부 통신일지라도, `postMessage`의 데이터는 _구조화된 복제 알고리즘_ 을 거치게 된다.
  - 복잡하게 중첩된 거대한 DTO 혹은 무지막지한 배열을 갖는 객체가 쉴새없이 브로드캐스팅될 때, 탭과 탭 사이를 오가는 직렬화/역직렬화로 메인 스레드가 꽉 찰 것이다.
- 팝업이 열려있지 않을 때 보낸 데이터는 증발한다. => 그래서 이거 해결한 것 같은데.

| BroadcastChannel API 최적화 지침 | 세부 설명 및 방안                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Debouncing & Throttling 적용     | 상태가 1ms마다 변하더라도, 디버그 패널로 쏘는 메시지는 `requestAnimationFrame` 혹은 `queueMicrotask`를 통해 Batching하여 주기에 맞춰 보낸다. (UX 별로라고 무시했는데.) |
| Delta 전송 전략                  | `_dirtyFields`를 활용해 변경된 부분만 메시지로 전송한다.                                                                                                               |
| 엄격한 리소스 생명주기 관리      | `chennel.close()`를 호출하는 로직.                                                                                                                                     |
| 네임스페이스 격리                | 한 브라우저에서 여러 프로젝트를 개발할 때 디버깅 메시지가 충돌하지 않도록 방어 로직을 세운다.                                                                          |

### 5. Framework-Agnostic (프레임워크 불가지론 - 상태 관리(State Management)의 패러다임)

> Vanila JS는 물론이고, 사용자가 원한다면 React의 `useSyncExternalStore`나 Vue의 `customRef`와 매끄럽게 연결될 수 있어야 하며,
> 그러기 위해 외부 구독 API(`subscribe`, `getSnapshot` 등)를 인터페이스로 열어두는 _Adapter 패턴_을 구상할 필요가 있다.

- 현대의 애플리케이션은 극도로 세분화된 반응성(Fine-grained reactivity)을 요구하며, 이에 따라 Signals(시그널) 기반의 아키텍처와 Zustand, Jotai 같은 경량화된 로컬/모듈 단위 스토어가 시장을 지배하고 있다.
- Signals는 주로 UI 컴포넌트의 가시성 혹은 로컬 상태를 원시 값 수준에서 추적하고 렌더링을 최적화하는 데에 탁월한 성능을 발휘한다.
- `REST Domain State Management`의 지향점은 백엔드와 통신하는 DTO라는 거대하고 복잡한 객체를 다룬다는 데에 있다.
  - 백엔드에서 날아온 깊게 중첩된 JSON 구조를 온전히 유지하면서 그 내부의 프로퍼티 변화를 추적하고 HTTP 메서드를 분기하려면, 아키텍처적으로도 Proxy 패턴이 합리적인 선택이다.
  - Vue 3의 반응형 시스템이 Proxy를 핵심 엔진으로 사용 중인 이유.
- `REST Domain State Management`가 프론트엔드 UI 프레임워크를 대신하려는 것이 아니라면,
  - 클라이언트 상태(Client State)와 서버 상태(Server State)의 동기화 불일치 문제를 해결하려는 데이터 계층(Data Layer)의 솔루션이란 포지셔닝을 분명히 밀고 가야 한다.

### 6. NPM Publishing (순수 ESM 구조와 2026년 NPM 패키징 전략)

- Node.js(22, 23)에서는 CommonJS 모듈이 ESM 모듈을 `require()`할 수 있도록 네이티브 지원이 추가되었다.
- Dual Packaging의 필요성이 급격히 줄어들었다.
  - 패키지 설정이 꼬일 경우, 두 개의 모듈 인스턴스가 한 애플리케이션 내에 생성되어 서로 상태 공유도 안 되는 Dual Package Hazard를 유발할 수 있다.
  - 전역적으로 BroadcastChannel이나 내부 캐시를 다루는 모듈이 두 번 로드되는 것은 치명적인 버그이다.
- 과감하게 CJS 빌드를 버리고 ESM-only로 밀고 나가는 철판을 깔아보는 것도 고민고민.
  - `"type": "module"`을 명시해 순수 ESM 패키지 딱지를 붙인다.
  - `"sideEffect": false` 선언으로 "내 라이브러리는 임포트만으론 외부 상태를 오염시키지 않으니, 사용하지 않는 코드는 Tree-shaking으로 날려버리라"는 허락을 내린다.

### 7. VitePress 기반 문서화 고도화 전략 (WebDoc 서비스와 GitPages 병행)

- VitePress는 Markdown 내부에 Vue Component를 직접 삽입해 실행할 수 있는 기능을 제공한다.
  - 문서를 그저 텍스트를 읽게만 두지 말고, 사용자가 문서 페이지 안에서 `DomainState`를 직접 조작할 수 있도록 **`대화형 플레이그라운드(Interactive Playground)`**를 박아 넣어 같이 제공한다.
  - `::: row` 컨테이너를 사용하면 라이브러리 CSS가 VitePress 테마와 충돌하는 것을 피해 내부의 스타일 고립 환경을 만들어준다.
- JSDoc을 세세히 작성하고, 프로젝트의 모든 코드가 WebDoc 문서와 상시 일치하도록 최신 버전으로 동기화한다. _문서와 코드가 따로 노는 순간 라이브러리의 신뢰도는 박살 난다._

## 개선 방향

### A. 최적화된 코드로 Refactoring

- Proxy 로직이 V8 엔진의 심기를 거스르지 않게 만드는 것이 1순위 목표.
- 동적 프로퍼티 할당을 멈추라.
  - `DomainVO`는 단순 유효성 검사기가 아니라, 메모리상에서 객체의 형태(Shape)를 조각하는 거푸집이 되어야 한다.
  - 데이터가 비어 있더라도, 스키마에 정의된 KEY의 VALUE는 무조건 `null`로 초기화 -> V8 엔진이 히든 클래스(`Maps`)를 고정할 수 있어야 한다.
  - Proxy Trap 내부에서 정규식 검사나 루프를 도는 무거운 연산은 금물
  - 상태 변경은 가볍게 이력으로 남기고, 무거운 유효성 검사는 `DomainPipeline`의 미들웨어로 밀어내서 비동기적으로 처리하도록 아키텍처를 갈아 엎는다.

### B. Architecture를 설계하는 눈으로 Library 개발

- 현재 파편화된 디렉토리 tree를 `src/` 중심으로 완벽하게 재결합한다.
- 코어 계층(`core`), 네트워크 계층(`network`), 부가 기능 계층(`plugins`)으로 패키지 내부 결합도(응집도)를 높이는 방향
- `DomainPipeline`을 Heavy User를 지원하기 위한 _제어의 역전`IoC`_ 패턴으로 구축한다.
- 라이브러리가 모든 걸 다 해주지 않는다.
  - 사용자가 중간 Hook을 직접 걸어 자신만의 비즈니스 로직(e.g., 토큰 갱신, 에러 로깅, 강제 데이터 변환)을 끼워넣을 수 있는 미들웨어 파이프라인 구조로 설계

### C. Frontend Framework의 V8 수준 원리 이해

- Proxy를 사용해서 상태 변화를 추적하는 것 자체가 이미 반응성(`Reactivity`) 원리에 첫 발을 담근 것이다.
- 마이크로테스트 큐(`queueMicrotask` || `Promise.resolve()`)를 활용해 한 틱(`Tick`) 안에 일어난 상태 변화를 하나로 뭉뚱그린다(`Batching`).
  - 상태가 10번 바뀌어도, API 업데이트 요구나 렌더링 플러그인 업데이트는 단 한 번의 후속 작업으로 트리거되도록 스케쥴러(`Scheduler`) 로직을 구현
  - 비동기 일괄 처리 메커니즘을 구현하면, 렌더링 엔진의 빠른 성능을 체감할 수 있게 된다.

### D. 공통 문서화를 체계적으로 병행해 WebDoc 고도화

- VitePress의 강점을 살려, 문서 내부에 라이브러리가 직접 동작하는 컴포넌트를 이식한다.
- 사용자가 튜토리얼을 읽으며 마크다운 문서 내의 Form을 수정하면,
  - 문서 하단에 배치된 브로드캐스트 디버그 패널이 즉각적으로 변하는 것을 시각적으로 보여준다.
  - 직관적인 포트폴리오 어필 방식
- 문서화 레포지토리(`lab.the2davi.dev`) 관리 워크플로우도 GitHub Actions로 자동화하여 커밋/푸시만으로 배포가 끝나게 만든다.

### E. NPM을 통한 라이브러리 빌드/배포 관리

- 구형 레거시를 품기 위해 코드를 더럽히지 않는다.
- 패키지는 순수 ESM(`"type": "module"`)로 밀고 나가고, CJS 환경 지원은 과감히 끊는다.
- 완벽한 `exports` 필드 매핑과 `sideEffect: false` 설정을 통해 사용자 환경에서 최적의 번들 사이즈를 보장한다.
- JSDoc 기반으로 타입 관리를 꼼꼼히 하고, `d.ts` 파일을 릴리즈에 포함시켜 개발자의 IDE 내에서 경이로운 수준의 자동 완성(`Auto-completion`)과 에러 체킹을 경험하게 만든다.

### F. 앞세울 수 있는 지향점

- 남들의 인정을 받는 라이브러리는 '디테일'과 '안정성'에서 승부를 봐야 한다.
  - REST API 자동 분기 로직에서 HTTP 표준 스펙(_PATCH와 PUT을 구분하는 멱등성 규칙_)을 완벽히 준수
  - 네트워크 에러 발생 시 원래 상태로 복구하는 낙관적 업데이트(`Optimistic Update`) 롤백 메커니즘을 추가
  - BroadcastChennel을 사용하는 디버그 툴은 반드시 메모리 누수를 막을 클린업(Cleanup) 로직을 강제
- `Edge Case`를 모두 틀어막고, 가볍고 조용하게 제 일을 수행하도록 최적화를 수행한다.

## 지침 반영 계획

1. `Hidden Class` 고정
2. 상태 변경 배칭(`Batching`)과 마이크로테스트 큐(`Microtask Queue`)
3. `Dual Package Hazard` 타파 (순수 ESM 선언)
4. 파편화된 디렉토리 구조의 응집도(`Cohesion`) 확보
5. REST API의 멱등성(`Idempotency`)에 기반한 라우팅 알고리즘 확보
6. BroadcastChannel 메모리 누수 방어
