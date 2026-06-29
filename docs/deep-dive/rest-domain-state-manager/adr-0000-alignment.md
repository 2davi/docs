---
doc_type: adr
title: "RDSM ADR-0000: 초기 설계 정렬 및 개선 로드맵"
date: 2026-03-23
lastmod: 2026-03-23
author: "Davi"
description: "초기 RDSM 구현의 SSOT 타협·V8 비최적화·동시성 무결성·CSRF 부재 등을 식별하고 7개 개선 목표를 정렬한 설계 결정"
slug: adr-0000-alignment
section: deep-dive
category: "deep-dive/rest-domain-state-manager"
tags: [adr, v8, proxy, reactivity, csrf, broadcast-channel, dsm]

order: 0
series: "REST DSM ADR"
series_order: 0
status: "active"
draft: false
search: true
toc: true

project: "Rest Domain State Manager"
milestone: ~

decision_status: "accepted"
deciders: ["Davi"]
period:
  start: 2026-03-23
  end: ~
related_adrs: ~
issue: ~

ai_assistance:
  authorship: human
  role: [research, review]
  model: ["claude-opus-4.7"]
  review: verified
---


# 지적 사항

## 단일 진실 공급원(SSOT)와의 안일한 타협

- **Proxy 사용 범위를 Service/Domain 계층으로 엄격히 제한하였다.**
  - _View 계층(React, Vue와 같은 프레임워크 상태)의 확장을 보류함._
  - **상태 관리자**라는 정체성이 퇴색─완벽한 반응성(reactivity)의 구현을 포기한 셈.
  - DomainPipeline: 네트워크 지연과 교착 상태에 대한 타임아웃 제어 장치가 전무.
  - `strict: false` `.after()` 핸들러의 연쇄 붕괴가 예정된 '조용한 실패'의 온상

- **V8 엔진의 동작 원리를 무시**
  - V8 엔진의 JIT(Just-In-Tiem) 컴파일러의 동작 원리를 `api-proxy.js`는 순응하지 않음.
  - 원시 데이터 처리를 수행하는 최적화 파이프라인이, Proxy 객체로 감싸는 순간 산산조각 나버림. (1)

- **메모리 오버헤드 및 배열 하이재킹의 위험 잠재**
  - deeper proxy 로직은 임시 Proxy 객체를 생성하며, GC에 막대한 부하를 주며 렌더링 파이프라인 내에서 프레임 드랍을 야기한다.
    - Vue 3도 Proxy를 사용하지만, 성능 오버헤드를 방지하기 위해 극도로 정교한 Lazy-proxying 기법을 사용 중이다.
  - 배열의 변이 로직(isMuting)은 꼼수에 불과하다.
    - _V8 환경에서는 '루프 내에서 절대 객체를 동적으로 생성하거나 변이시키지 말라'는 절대 수칙이 있다._

- **REST API 브랜칭 자동화의 철학이 무색한 네트워크 동시성 무결성 문제**
  - _객체의 상태 변경 이력을 바탕으로 HTTP 메서드를 자동 분기하는 기능이, 이 라이브러리의 핵심 무기이다._
  - `api-handler.js` 내에 헤더 병합 로직은 구현되어 있지만, 동시설 충돌(HTTP 409 Conflict) 발생 시 Proxy를 이전 값으로 롤백하는 **트랜젝션 보상 개념**이 완전히 빠져 있다.
    - 데이터를 백엔드로 무책임하게 던지기만 할 뿐인 라이브러리는 반쪽자리에 불과하다.

- **보안 설계의 허점: CSRF 방어 메커니즘 부재**
  - `Content-Type: application/json;` 만을 주입할 뿐, CSRF 토큰을 동적으로 감지해서 헤더에 포함시키는 방어 로직이 없다.
    - 라이브러리 초기화 시점에 `<meta name="csrf-token">` 태그를 파싱하거나, 백엔드가 응답으로 내려준 보안 쿠키 값을 읽어 들여 `X-CSRF-Token` 표준 보안 헤더를 자동으로 모든 요청에 넣어주는 아키텍쳐가 필수이다.

- **BroadcastChannel의 메모리 누수와 생명주기 관리**
  - 사용을 완료한 BroadcastChannel은 반드시 `close()` 메서드를 호출해 통로를 닫아주어야 한다.
    - 그러지 않으면, 채널 객체가 내부적으로 계속 살아남아 GC 대상이 되지 못하고, 메모리 누수로 이어진다.
    - `beforeunload` 이벤트는, 모바일 브라우저나 SPA 환경에서 씹히기 쉬운 녀석이다. 여기에 전적으로 의존하면, 브라우저 크래시나 OOM으로 프로세스가 강제 종료되는 경우 계속 살아남는다.
    - 전형적인, 전역 변수 오용으로 인한 안티 패턴

## NEXT STEP

### 목표 1. 코드 리팩토링 및 V8 대응 성능 극대화

> V8 엔진의 JIT 컴파일러와 Garbage Collector를 굴복시킬 수준의 Refactoring 요구. `api-proxy.js`에서 매번 새로운 `Proxy`를 동적으로 생성하는 구조부터 문제.

- **Lazy Proxing & WeakMap Caching 도입:** Closure 내부에 `const proxyCache = new WeakMap()`을 선언한다. 대상 객체가 이미 래핑된 적이 있다면, 무조건 캐시된 `Proxy` 인스턴스를 즉각 반환하는 로직으로 메모리 폭발을 방지. `WeakMap`은 원본 객체가 사라질 때 프록시도 함께 GC 대상이 되어 누수 걱정이 덜하다.
- **Reflect API 전면 적용:** 트랩 내부의 연산을 `target[prop]`으로 처리하지 말고, `Reflect.get(target, prop, receiver)` API를 적극 도입한다. 상속 구조나 `this` 바인딩이 복잡한 도메인 객체에서, 치명적인 컨텍스트 소실(Context Loss) 버그를 방지하는 가장 안전한 수단이다.
- **배열 하이재킹 알고리즘 전면 수정:** `isMuting` 플래그의 얇은 복사 로직은 무식하다. V8 내장 배열 메서드의 동작 방식에 맞춰서, 변경된 인덱스 범위(Delta)만을 수학적으로 계산해 `REPLACE` 로그를 도출하는 커스텀 반복자(Iterator) 기반 알고리즘으로 수정한다.
  - 이런 걸 고도화할 때 `feature/array-patch-optimization`같은 브랜치를 따서 격리된 상태로 테스트 코드를 먼저 짜고 (TDD), 완벽해지면 `main`으로 병합(Merge)하는 훈련을 한다.

### 목표 2. 플러그인 아키텍처와 관심사 분리

> 좋은 라이브러리는 강한 결합력(Tight Coupling)을 피하고 확장성을 열어두어야 한다. 현재 `DomainState`는 상태 추적 로직과 REST API 통신 로직이 한 몸처럼 붙어 있다.

- **DOM 의존성 분리:** Core 엔진은 브라우저 DOM이 있든, Node.js 백엔드든 상관 없이 독립적으로 돌아가야 한다. HTML DOM 요소 제어 로직(`_resolveForm`, `_syncToForm`)은 별도 플러그인으로 뜯어낸다.
- **순환 참조 꼼수 제거:** `DomainState.js`와 `DomainPipeline.js`가 서로를 참조하는 걸 막겠다고 `globalThis.__DSM_DomainPipeline`을 전역 변수로 설정한 것은 설계가 꼬였다는 걸 스스로 증명한 셈이다.
- **Transport-Agnostic 설계:** 상태를 추적해서 JSON Patch 배열을 뽑아내는 핵심 코어 모듈과, Patch Doc를 HTTP 요청에 태워 보내는 `api-handler.js` 모듈의 결합력을 낮춰야 한다. _개발자가 원한다면 RSET API 대신 WebSocket이나 GraphQL Mutation으로 데이터를 쏠 수 있도록._ 네트워크 계층을 외부에서 주입받는 구조(Dependency Injection)로 설계해야 한다.
- **Auto Injection 기반의 CSRF & Secure Layer:** `api-handler.js`의 생성자 파라미터나 전역 설정을 통해 CSRF 프로텍션을 플러그인 형태로 내재화한다. 브라우저 환경에서 `document.querySelector('meta[name="csrf-token"])`을 자동으로 스캔해 HTTP 메서드 헤더에 꽂아주는 기능을 옵션으로 제공한다.

### 목표 3. 심화된 기능과 Git Branch 전략적 관리

> 기능이 복잡해질수록, `main` 브랜치에 막 커밋/푸시하는 습관은 최악이다.

- **GitFlow 기반의 격리:** 동시성 제어(낙관적 잠금, `ETag` 헤더 연동) 기능이나, `BroadcastChannel` 생명주기 패치 같은 굵직한 피처들은 반드시 별도의 `feature/` 브랜치로 격리해서 작업한다.
- **Semantic Commits:** `feat:`, `fix:`, `perf:`, `refactor:`와 같은 접두사를 엄격하게 적용해서, 커밋 히스토리만 봐도 성능 최적화를 위해 어떤 고민을 했는지 한눈에 파악할 수 있게 만든다.

### 목표 4. 프론트엔드 프레임워크의 V8 반응성 원리 체화

> React의 Virtual DOM 렌더링 최적화 혹은 Vue 3가 `Object.defineProperty`의 한계를 극복하기 위해 Proxy를 채택하면서도 어떻게 성능 방어를 해냈는지가 가장 크게 얻어갈 수 있는 것이다.

- **불변성과 참조 비교:** React는 상태가 바뀌었는지 판단할 때 얕은 비교(`old === new`)를 쓴다. Proxy 내부 속성만 쓱 바꾸면, 객체 참조값(메모리 주소)는 그대로라서 React는 렌더링을 하지 않는다. React랑 붙이려면 이 Proxy 로그를 기반으로 새로운 객체 복사본을 뱉어내는 어댑터를 구현해야 한다.
- **V8 엔진 최적화:** V8 엔진은 객체의 프로퍼티 구조(Hidden Class)가 고정되어 있을 때 제일 빠르다. Proxy의 `set` 트랩에서 자꾸 새로운 키(`OP.ADD`)를 동적으로 추가하면 V8의 인라인 캐싱이 깨지며 성능 저하가 발생한다. 초기에 `DomainVO`로 뼈대를 잡아두는 아이디어는 성능상으로 훌륭한 접근이다.
- Vue 3 반응성 코어 라이브러리 `@vue/reactivity` 소스코드를 확인한다. Tracking과 Triggering을 어떻게 분리했고, 왜 무조건 Proxy를 깊이 파지 않고 Lazy-proxing을 수행하는지 분석한다.
- 브라우저 DevTools의 Memory 탭과 Performance 탭을 열어, 모듈이 동작할 때의 Heap Snapshot을 찍는다. Deoptimize가 어디서 일어나는지 확인해가며 코드를 고치는 것이 V8을 체화하는 길이다.

### 목표 5. 공통 문서화 체계 병행 및 GitPages 웹 문서 서비스화

> 문서는 단순한 설명서가 아니라, 라이브러리의 개발자 경험(DX)을 결정짓는 핵심이다. 좋은 코드는 기본이고, 문서가 섹시해야 한다.

- `TypeDoc`이나 `VitePress` 같은 정적 사이트 생성기를 이용해 API 레퍼런스를 자동화한다. 코드에 작성한 JSDoc 주석이 배포 시점에 자동으로 문서화(WebDoc)되도록 CI/CD 파이프라인(GitHub Actions)을 구축한다.
- SI/SM 환경에서 MyBatis 기반 레거시 백엔드를 쓸 때, 이 모듈이 기존 노가다를 어떻게 줄여주는지를 `DomainRenderer`를 활용한 실전 예제 코드로 문서 첫 페이지에 떡하니 배친한다. 사람들이 들어와 30초 안에 "아, 이건 내가 쓰던 레거시 코드에 당장 갖다 붙일 수 있겠네"라는 확신이 들어야 한다.

### 목표 6. npm을 통한 라이브러리 CI/CD 구축

> 2025/2026 프론트엔드 생태계의 표준 뼈대(Boilerplate)를 완벽하게 입혀야 한다. "많은 사람들이 칭찬할 수준"의 오픈소스가 되려면 글로벌 스탠다드를 따르려는 노력은 해야 할 것이다.

- **TypeScript 전면 도입:** `DomainVO`의 유효성 검사 로직, DTO 필드 추론이 IDE 내에서 즉각적으로 타입 에러를 뱉어내도록 TypeScript를 얹는다. TS 5.x의 향상된 제어 흐름과 ECMAScript Modules(ESM) 완벽 지원을 타겟으로 `tsconfig.json`을 세팅한다. JSDoc을 바탕으로 타입스크립트 선언 파일을 자동 생성해서 배포에 포함시킨다.
- **자동화된 CI/CD 파이프라인:** GitHub Action를 연동하여 코드를 푸시할 때마다 `Vitest`로 단위 테스트가 돌고, `Biome`이나 `ESLint Flat Config`로 코드 린팅을 강제한다. 병합(Merge) 시 시맨틱 버저닝에 따라 CHANGELOG가 자동 생성되고 npm Registy에 배포되는 파이프라인을 구축한다.
- **NPM과 번들러 도입:** `Vite`나 `Rollup` 세팅해서 `dist/` 폴더를 뽑아내고 NPM에 퍼블리싱한다. CJS(CommonJS), ESM 포맷 모두 지원하도록 만든다.

### 목표 7. 생명주기가 완벽한 압도적 품질의 모듈 완성 (디버거 누수 해결)

> 디버거 팝업의 메모리 누수 문제 해결

- **Heartbeat & WeakRef 적용:** `beforeunload` 이벤트에 기대지 말 것. 디버거 팝업 내부에서(예: 2초마다) `PING` 메시지를 쏘고, 각 탭이 살아있다는 `PONG` 응답을 보내게 만든다. 응답이 없는 탭의 데이터는 상태 레지스트리에서 즉시 폐기(Eviction)한다.
- **객체 소멸자 제공:** 프로덕션 빌드에서 채널을 안전하게 닫을 수 있도록 라이브러리 차원에서 `destory()` 같은 명시적 소멸자를 제공한다. 내부의 `BroadcastChannel.close()`를 확실하게 호출해 장기 디버깅 세션에서도 브라우저 힙 메모리가 안정적으로 유지되게 고친다.

---

## 주석

1. V8 엔진 최적화 메커니즘

```text
V8 엔진은 동적 타입 언어인 자바스크립트의 성능 한계를 극복하기 위해, 객체가 생성될 때 내부적으로 C++ 수준의 '히든 클래스(Hidden Classes, Maps)'를 만들어. 객체의 프로퍼티에 접근할 때마다 인라인 캐싱(Inline Caching, IC) 메커니즘을 통해 메모리 오프셋을 빠르게 찾아내어 $O(1)$에 가까운 속도로 데이터를 처리하지. Map 객체 내부에는 DescriptorArray와 TransitionArray가 존재해서, 프로퍼티가 추가될 때마다 미리 계산된 다음 히든 클래스로 상태를 전이(Transition)시키며 극단적인 속도를 끌어내. 최근 V8 13.8 버전에서는 SIMD와 SWAR 같은 하드웨어 레벨의 병렬 처리까지 동원해서 원시 데이터 처리를 가속하고 있어.
```
