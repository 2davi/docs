---
doc_type: adr
title: "RDSM ADR-0002: 코드-문서 정합성 진단과 DomainCollection·UIComposer 도입"
date: 2026-03-30
lastmod: 2026-03-30
author: "Davi"
description: "Reflect/WeakMap 적용과 getTarget 백도어·CSRF 부재를 코드 레벨에서 진단하고, RFC 6902 JSON Patch 준수와 BroadcastChannel 리더 선출 보강, DomainCollection 상태 레이어·UIComposer UI 레이어 신설을 확정한 결정."
slug: adr-0002-alignment
section: "decisions"
category: "rdsm"
tags: [adr, reflect, weakmap, csrf, json-patch, broadcast-channel, leader-election, dsm]

order: 2
series: "REST DSM ADR"
series_order: 2
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
  start: 2026-03-30
  end: ~
related_decisions: [RDSM-ADR-0000, RDSM-ADR-0001]
issue: ~

ai_assistance:
  authorship: human
  role: [research, review]
  model: ["claude-opus-4.7"]
  review: verified
---


# ADR 0002 Alignment

## REST Domain State Manager Architecture 진단 및 고도화 분석 리포트

> REST Domain State Manager는 레거시 SI/SM 환경의 프론트엔드 통신 노가다를 줄이고,
> 자바스크립트 내장 Proxy 객체를 활용하여 상태 변경 이력을 추적하며,
> 이를 기반으로 REST API의 HTTP 메서드를 스마트하게 분기한다는 강점을 내세우고 있다.
>
> V8 엔진의 JIT 컴파일러나 React의 Virtual DOM과 같은 고차원적인 생태계 트랜드를 거론하고 있으나,
> 실제 코드 레벨에서는 기초적인 보안 메커니즘이 누락되어 있고,
> 모듈 간 결합도는 여전히 심각하게 꼬여 있으며,
> Proxy의 본질적 한계를 간과한 오버 엔지니어링이 팽배해 있다.

### 1. 현행 아키텍처 진단 및 코드 레벨의 치명적 불일치

> Software Architecture에서 가장 경계해야 할 안일함은, '문서 중심의 허구 개발(Readme Driven Development)'이다.
> 설계 문서에는 업계 표준과 최적화 기법이 나열되어 있으나,
> 실제 동작하는 코드가 이를 뒷받침하지 못한다면 사용자 기만에 불과하다.

#### 1.1. Proxy Trap과 Reflect API 적용의 명암

##### 1.1. (a)긍정적

> **Reflect API** 전면 도입으로 컨텍스트(this binding) 소실을 방어

- [MDN 공식 명세](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)는 Proxy 트랩 내에서 `target[prop]`으로 직접 접근할 경우, getter가 `this`로 프록시가 아닌 원본 객체를 받게 되는 컨텍스트 문제가 발생알 우려를 꼬집는다.
  - 이를 방지하는 표준 방법이 [**Reflect API**](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect)이다.
  - **Reflect API**는 각 Proxy Trap Handler와 1:1 대응하는 메서드를 제공, 해당 내부 메서드(Internal Method)를 원형대로 위임하는 역할을 한다. [(튜토리얼)](https://ko.javascript.info/proxy)
  - [ECMAScript 2026 명세](https://tc39.es/ecma262/)에서도 동일하게 현재까지 유효한 원칙이다.

> `WeakMap` 기반 `proxyCache`를 통해 불필요한 Proxy 인스턴스 생성을 억제

- Vue 3의 `@vue/reactivity`의 전략 벤치마킹 (WeakMap 기반 캐싱 + Lazy Proxy)
  - 동일한 원본 객체에 대해 Proxy 인스턴스가 중복 생성되는 것을 방지하는 동시에,
  - `WeakMap`의 약한 참조(Weak Reference) 특성을 이용해 원본 객체가 GC될 때 캐시 항목도 자동으로 함께 해제되도록 설계.
- 실제로 Vue.js Core Team은 Proxy Wrapping 시 infinite loop 및 이중 프록싱 버그를 지속적으로 수정하고 있음이 [GitHub 이슈](https://github.com/vuejs/core/issues/9742)에서 확인된다.

> 배열 변이(Array Mutation) 메서드 하이재킹

- 주요 배열 변이 메서드를 하이재킹하여 `isMuting` 플래그로 내부 변경 기록을 무시하는 동안 최적화된 델타 로그만을 남기는 방식
  - `splice`와 같은 메서드 호출 시, 배열의 인덱스에 대해 set 트랩이 연쇄적으로 발생하며, 이는 무의미한 changeLog Entries를 대량 생성하게 만든다.
  - [Vue 3 공식 문서 이슈](https://github.com/vuejs/core/issues/2314)에서 배열의 커스텀 프록시 사용 시 동일한 구조적 문제가 반복 제기되어 왔고, 하이재킹 + 플래그 방식은 실증된 해결 패턴이다.

##### 1.1. (b)부정적

> `getTarget` 외부 노출로 인한 백도어 오염 우려
> _우려 불식 여부 검증 필요._

- `createProxy`가 생성한 `getTarget` 접근자는 외부에서 객체 내부의 원본 데이터를 직접 가져오도록 열어두었다.
- Proxy 기반의 상태 라이브러리에서 원본(target)을 외부에서 직접 조작할 수 있다면, Proxy 트랩 자체가 보호 레이어로서 무력화된다.
  - [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)에서는 Proxy를 '투명한 래퍼'가 아닌 _접근을 제한하거나 제어하는 메커니즘_ 이라 명시한다.
- State Manager(상태 관리자)의 핵심 불변식(Invariant)은 '모든 상태 변이는 반드시 Proxy를 통해야 한다'이며, 이를 치명적으로 위반한 사례처럼 보일 수 있다.
- 이 우려를 해소하기 위해 `api-proxy.js`가 반환한 `getTarget`은 `DomainState.js` 생성자 내부에 **Private 속성**으로 감추어놓았다.
  - 외부로 노출되는 유일한 Public Getter는 `getdata()` 하나로 남겨놓았다.
- 하지만, 접근자의 존재 자체만으로 첫 인상이 개별로일 수 있다.

```javascript
    /**
     * `DomainState` 인스턴스를 생성한다.
     *
     * **직접 호출 금지.** `fromJSON()` / `fromVO()` 팩토리 메서드를 사용한다.
     * `FormBinder` 플러그인 설치 후 `fromForm()`도 사용 가능하다.
     *
     * 생성 직후 `debug: true`이면 디버그 채널로 초기 상태를 broadcast한다.
     *
     * @param {ProxyWrapper}       proxyWrapper - `createProxy()`의 반환값 (도개교 세트)
     * @param {DomainStateOptions} [options]    - 메타데이터 및 설정 옵션
     */
    constructor(proxyWrapper, options = {}) {
        // ...
        /** @type {() => object} */
        this._getTarget = proxyWrapper.getTarget;
        // ...
```

#### 1.2. 보안 통신의 허구

##### 1.2. (b) 부정적

> X-CSRF-Token 추출 및 헤더 자동 삽입 로직, HTML `<meta name="csrf-token">` 태그와의 연동을 통한 **Cross-Site Request Forgery** 방어 메커니즘의 부재

- `ApiHandler._fetch` 메서드는 Native `fetch`의 얇은 래퍼(Thin Wrapper)로 동작, `res.ok` 검증 및 HttpError 정규화 로직, 빈 응답(`204 No Content`) 처리 로직만 갖추고 있다.
- 기본 헤더인 `Content-Type: application/json`과 사용자 정의 옵션 헤더를 병합하는 스프레드 연산자 로직도 만들어뒀다.
- `adr-0000-alignment`에서부터 거론된 개선 사항이지만, 매 애자일 사이클마다 누락되고, 미루고, 신경도 안 썼다.
- 현재 `api-handler.js` 모듈의 내부는 참담함을 금할 수 없다. (흠, 그정둔감?)
- [OWASP(Open Web Application Security Project) 공식 CSRF 방어 차트시트](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
  - _상태 변이 요청(`POST`, `PUT`, `PATCH`, `DELETE`)에는 반드시 CSRF 토큰이 포함되어야 한다._
  - `GET`, `HEAD`, `OPTIONS`는 안전한 메서드로 분류되어 Token 삽입이 불필요하지만, 상태를 변이시키는 위 헤더들은 모두 토큰이 강제되어야 한다.
  - CSRF Token은 `<meta>` DOM 요소에서 파싱하거나, 서버로부터 응답 페이로드로 전달받아 커스텀 헤더로 삽입하는 방식이 표준이다.
  - `X-CSRF-Token`은 Ruby on Rails, Laravel, Django 등 주요 서버 사이드 프레임워크에서 표준적으로 사용하는 헤더명이다.
  - SI 레거시 환경에서 Spring Security, Tomcat 기반 서버와 연동되는 경우 `X-CSRF-Token` 헤더 미전송은 `403 Forbidden` 응답 문제로 직결된다.

#### 1.3. 상태 이력 추적과 JSON Patch 규격의 결합

##### 1.3. (a) 긍정적

> 상태 이력 추적과 JSON Patch 규격의 결합

- API 동기화를 위해 변경 이력을 수집하고 HTTP 메서드를 동적으로 분기하는 로직은 `DomainState.js`와 `api-mapper.js`의 협력을 통해 이루어진다.
  - `api-mapper.js`의 `toPatch` 함수가 변경 이력을 **RFC 6902 JSON Patch** 표준 포맷(`op`, `path`, `value`)으로 직렬화하며,
  - 특히 `remove` 연산 시 `value` 필드를 의도적으로 배제하는 방어 조건문을 의도적으로 구현했다. (RFC 6902 §4.2 조항 반영)
- [**IETF 공식 RFC 6902 원문](https://datatracker.ietf.org/doc/html/rfc6902)
  - _"The 'remove' operation removes the value at the target location. ... A JSON Patch document: [{ `"op": "remove", "path": "/baz"` }]"_
  - JSR의 `@json-patch/types` 라이브러리에서도 `RemoveOperation` 인터페이스는 `op`와 `path`만을 포함하며 `value`를 명시적으로 배제하고 있다.
- 내부 복원용 내부 데이터를 외부 직렬화 시점에 깔끔하게 잘라내어 표준 스펙을 준수한 것은, 네트워크 페이로드의 낭비를 막고 서버 측 파싱 에러를 예방하는 좋은 엔지니어링으로 평가했다.

#### 1.4. 메모리 누수 방어와 BroadcastChannel의 한계 극복 전략

##### 1.4. (a) 긍정적

> 시각적 디버깅 툴: Manager-Worker 기반 HeartBeat + GC 전략, Lazy Singleton, TAB_ID 발급 메커니즘

- SPA & Mobile 환경에서 탭 종료 시 `beforeunload` 이벤트가 100% 실행된다는 보장이 없다.
  - 연결이 끊어진 탭의 정보가 디버그 팝업 메모리에 영구히 남는 메모리 누수 현상을 방지하기 위해, 이벤트에 의존하지 않고 방어적 Fallback 메커니즘을 이용했다.
  - **고유 식별자 발급 및 지연 생성:**
    - 모듈 로드 시 브라우저 탭마다 `dsm_{timestamp}_{random}` 형태의 고유 `TAB_ID`를 발급하고,
    - 채널 인스턴스는 호출 시점에 지연 생성(Lazy Singleton)하여 불필요한 메모리 점유를 막았다.
  - **Manager Worker 기반의 HeartBeat 전략:**
    - 디버그 팝업 창(Manager)이 2초 간격으로 `TAP_PING` 메시지를 브로드캐스팅하며,
    - 각 애플리케이션 탭(Worker)이 `registerTab()` 함수를 통해 자신의 존재를 증명하는 응답 `PONG`을 보낸다.
    - 5초 이상 응답이 없는 탭은 Manager의 내부 Fallback 로직에 의해 강제 삭제된다.
  - **자가 수신 제약 회피:**
    - BroadcastChannel API는 자신이 보낸 메시지를 직접 수신하지 못하는 한계가 존재한다.
    - 이를 우회하기 위해 `api-proxy.js`에서는, `TAB_REGISTER` 이벤트 발생 시 `_stateRegistry` Map 전체를 `Object.fromEntries`로 변환하여 완전 동기화를 수행한다.

##### 1.4. (b) 부정적

> **리더 선출(Leader Election) 로직의 부재**로 인한 Ping Collision 우려

- BroadcastChannel API는 태생적으로 _자신이 보낸 메시지를 직접 수신하지 못하는 한계가 존재한다._
- 멀티 탭 환경에서 채널 관리 주체가 복수로 존재할 경우(다수의 디버그 팝업이 동시에 열릴 경우) `PING` 메시지가 중복 발생한다. _(리더 선출 로직이 없으면 메시지 중복)_
  - 이는 네트워크 트래픽을 유발하진 않으나, 메인 스레드에 지속적인 메시지 파싱 부하를 주게 된다.
- HeartBeat + GC 전략은 유효한 폴백이지만, 리더 경쟁(Race Condition) 시나리오를 완전히 커버하지는 못한다.
- [GitHub - Tab Election](https://github.com/dabblewriter/tab-election) | [SQLite User Forum - absurder-sql (3)](https://sqlite.org/forum/info/9ff8428886217d0b)
- 실무에서 이 문제를 해결하기 위한 표준 접근법은 Web Locks API와 BroadcastChannel을 조합한 리더 선출 패턴이 있다.
- 근데 또 실무에서 디버그 팝업창을 여러 개 띄워놓는 경우가 얼마나 될까 싶기도 하고.
  - 하지만 내가 멀티 탭 기능을 팝업 안에 넣어놓았다고 해도, 팝업 창 여러 개 띄워서 직관적으로 보겠다 하면 못 말리니까.

#### 1.5. 의존성 꼬임: 순환 참조를 가리는 JSDoc 꼼수

##### 1.5. (z) 의문

> `DomainState`와 `DomainPipeline` 간의 순환 참조 설계가 지닌 의문

- 다수의 `DomainState`를 직렬/병렬로 처리하기 위해 고안된 `DomainPipeline.js` 관리 모듈은 순환 참조의 늪에 빠져 있다.
  - `DomainPipeline`은 인자로 `DomainState` 인스턴스들을 관리해야 하고,
  - `DomainState`는 정적 메서드인 `.all()`을 통해 `DomainPipeline`을 반환해야 하는 구조이기 때문이다.
- 이 의존성 역전(IoC)의 딜레마를 끊기 위해 ES Module의 `import` 구문을 배제하고, 대신 `DomainState.js`의 `PipeConstructor` 브릿지를 통한 **생성자 주입(Constructor Injection)** 젼략을 차용했다.
- `DomainPipeline.js`에서는 JSDoc 타입 참조 결합 방식을 사용했다.

- 이 전략이 적절한 타협점이었는지 확신하진 못한다. [StackOverflow - How to fix this ES6 module circular dependency?](https://stackoverflow.com/questions/38841469/how-to-fix-this-es6-module-circular-dependency)
- ES Module 시스템은 원칙적으로 순환 참조를 허용하지만, 자칫하면 TDZ(Temporal Dead Zone) 문제가 발생할 수 있다.
  - _실행 시점에서 모듈의 export 값이 `undefined`로 참조되는 문제 상황._
- 여전히 남아있는 문제.
  - **물리적 의존성은 끊어냈으나** 논리적 강결합(Tight Coupling)은 그대로다. 여전히, 두 모듈이 상호 인지해야만 하는 구조이다.
  - **테스트 격리 불가** Vitest 등 테스트 환경에서 `DomainPipeline` 하나만 독립적으로 Mocking하려고 해도, `DomainState.PipelineConstructor` 브릿지 속성에 의존해야 하므로 복잡하다.
- **근본적인 해결은 IoC(제어의 역전)** ES6 순환 의존성의 올바른 해결법으로 init 함수 패턴, 배럴 파일(barrel file), DI(의존성 주입) 컨테이너 도입 등을 권장한다. [Linkedin - 🔥🔄Breaking the Loop: My Experience with Circular Dependencies in JavaScript🔥🔄](https://www.linkedin.com/pulse/breaking-loop-my-experience-circular-dependencies-javascript-kumar/)
- 결국, 이 정도로 타협하고 넘어가야 하는지, 설계를 뜯어고쳐서 최적화를 할 수 있는 건지 아직 모르겠다.

---

### 2. 성능 최적화 및 업계 트렌드 정렬 관점

#### 2.1. V8 엔진 운운하기 전에 짚어야 할 'Proxy'의 뼈아픈 역설

> 코어 엔진이 Proxy에 의존하고 있는 한, V8 JIT, GC, Hidden Classes, SIMD, SWAR 연산 등의 성능 최적화의 역량을 깎아먹고 시작할 수밖에 없다.

##### 2.1.1. V8 Hidden Class와 Inline Caching 메커니즘

> Proxy를 쓰는 순간, V8의 Inline Caching과 Hidden Classes 최적화가 일부 깨지며 Dictionary Mode로 폴백되는 건 JavaScript 엔진의 물리적인 한계다. 네이티브 객체보다 절대 빠를 수가 없다.
> > _V8 엔진의 핵심 비결은 Hidden Classes와 Inline Caching이다. V8은 객체에 프로퍼티가 추가·변경될 때마다 트랜지션 배열(Transition Array)과 디스크립터 배열(Descriptor Array)를 갱신하며 그 형태(Shape)를 추적한다._
> > _JIT 컴파일러는 고정된 메모리 오프셋을 캐싱하여 극단적인 접근 속도를 보장한다._

- JIT 컴파일러(TurboFan)는 Ignition 인터프리터가 수집한 타입 피드백을 기반으로, 프로퍼티 접근을 단일 메모리 주소 오프셋 읽기 수준으로 최적화한다. [TheNodeBook - Inside the V8 JavaScript Engine](https://www.thenodebook.com/node-arch/v8-engine-intro#how-v8-actually-executes-javascript)
  - 이 상태를 **단형성(Monomorphic) Inline Caching**이라 부르며, 동일한 히든 클래스끼리는 동일한 오프셋으로 접근 가능하다. [RichardTutorial.GitHub - Javascript Hidden Classes and Inline Caching in V8](https://richardartoul.github.io/jekyll/update/2015/04/26/hidden-classes.html)
  - 실측 벤치마크에 따르면 단형성 코드와 다형성(Polymorphic) 코드 간에 최대 56배의 속도 차이가 측정된다. [dev.to - Hidden Classes: The JavaScript performance secret that changed everything](https://dev.to/maxprilutskiy/hidden-classes-the-javascript-performance-secret-that-changed-everything-3p6c)
  - 히든 클래스가 안정적으로 유지되는 한 TurboFan은 코드를 완전히 최적화된 머신코드로 승격시키고, 이 파이프라인은 Node.js 25에서도 동일하게 작동한다. [news-thing.Tistory - Node.js 25.0.0 릴리스: 혁신적인 업데이트와 개발자 필수 체크포인트](https://news-thing.tistory.com/13)

##### 2.1.2. Proxy로 객체를 감싸는 순간 JIT 최적화 파이프라인이 산산조각 난다

> Proxy 객체는 속성에 접근할 때마다 V8이 캐싱해둔 메모리 주소를 참조하지 않고, 사전에 정의해둔 Trap 함수를 강제로 실행해야만 한다.
> > _V8 컴파일러 입장에서 Proxy 객체는 내부 구조를 전혀 예측할 수 없는 블랙박스로 전락,_
> > _인라인 캐싱 최적화를 포기하고 극도로 느린 해시 테이블 조회(Dictionary Mode)로 Fallback해버린다._

- V8 공식 블로그에서도 Proxy 트랩이 있는 경우 Inline Caching 최적화 경로를 우회해야 함을 인정하며, 이를 개선하기 위한 공학적 노력에 공을 들였다고 명시한다.
  - [Optimizing ES2015 proxies in V8](https://v8.dev/blog/optimizing-proxies)에 의하면 get Trap 49~74%, set Trap 27~438%, call Trap ~500% 성능 개선을 달성
- **Dictionary Mode Fallback:** `delete` 연산을 통해 히든 클래스가 파괴되거나, 객체 형태(Shape)가 예측 불가능하게 변할 때 V8 자체적으로 이를 Dictionary Mode(Hash Table 기반)으로 강등시키는 현상이다.
  - 더 정확히 말하면, _Proxy 자체가 즉시 Dictionary Mode를 유발한다기 보다,_
  - Proxy Trap 함수가 V8의 IC 파이프라인을 우회(bypass)하여 슬로우 패스(slow path)를 항상 강제 실행하게 만드는 것이다.
  - [V8 공식 블로그](https://v8.dev/blog/faster-class-features)에 따르면 V8의 Inline Caching은 Proxy를 타깃으로 감지하는 순간 fast path를 포기하고 런타임 폴백으로 빠진다고 명시했다.
  - **그러니 날고 기어도 Inline Caching을 왕왕 이용해먹을 수 없는 태생적 한계인 것이다.**

##### 2.1.3. Proxy 실제 성능 오버헤드 수치

> V8이 Proxy 최적화에 상당히 투자한 것은 사실이나, 2026년 현재까지도 raw 성능 격차는 유의미하게 존재한다.

- [25년 3월 벤치마크 결과](https://dev.to/sandheep_kumarpatro_1c48/5-the-proxy-paradox-balancing-performance-security-and-pure-javascript-fun-1lnl)에 의하면, 100만 회 반복 접근 기준으로 **Direct 2ms vs Proxy 30ms**, 약 15배 차이가 측정된다.
- [26년 3월 21일 HackerNews Thread](https://news.ycombinator.com/item?id=47483449)에 따르면 M4 Max 머신 사용 환경에서 1억 회 반복 접근 기준으로 **Proxy getter는 plain object 대비 13배, Proxy setter는 35배 느리다**는 실측치가 보고되었다.

##### 2.1.4. SIMD·SWAR까지 동원해 성능을 극대화하는 것은 허구

> V8 엔진의 SIMD와 SWAR 연산까지 동언하여 극대화된 성능의 한계를 극복하겠다는 목표를 가지고 있다.
> > _Proxy 기반의 반응성 엔진이 V8의 네이티브 최적화 속도를 능가하거나 그 위에서 하드웨어 병렬 처리(SIMD)를 극대화하는 것은 기술적으로 불가능한 허구다._

- V8 14.1[(Node.js 25 탑재(2025-10 release))](https://mag1c.tistory.com/587)에서의 SIMD/SWAR 최적화는 [`JSON.stringify()`의 **문자열 직렬화 내부 처리**에 적용된 것이다.](https://dev.to/figsify/the-invisible-optimization-that-sped-up-the-web-how-v8-supercharged-jsonstringify-ke9)
  - 구체적으로는, 긴 문자열은 AVX2/NEON 하드웨어 SIMD 명령어로, 짧은 문자열은 SWAR(SIMD Within A Register) 비트 연산으로 처리하여 직렬화 속도를 높이는 것.
  - 이는 **V8 내부 C++ 런타임 레이어의 최적화**로 이뤄낸 성과이다.
  - JavaScript 수준에서 Proxy Trap이 이 최적화 경로에 접근한다거나, 이에 맞먹는 로직을 구현한다는 것은 불가능하다.

##### 2.1.5. WeakMap 및 배열 하이재킹의 효과: "눈물겨운 애쓰기"

> Proxy 오버헤드를 줄이기 위해 WeakMap을 동원하고, 배열 변이 메서드를 하이재킹하는 로직을 작성한 것은 유효한 전략이지만,
> > _그 목적이 Proxy 기반의 반응성 엔진을로 V8 네이티브 최적화 속도를 능가하기 위함 이라면 그것은 무모한 허상이다._

- WeakMap 기반 proxyCache와 배열 메서드 하이재킹은, 불필요한 Proxy 인스턴스 중복 생성을 방지하고 연쇄 로그 적재를 억제하는 _미시 최적화_ 에 지나지 않는다.
- 이 최적화들은 **Proxy Trap 자체가 Inline Caching fast path를 우회한다는 근본 구조를 전혀 바꾸지 못한다.**
  - V8의 TurboFan은 Proxy Trap handler를 포함한 함수가 실행되는 경우 사용자 정의 코드의 부작용(side effect) 가능성을 절대 배제하지 않는다.
  - Inline Caching 예측을 기반으로 한 최적화를 아예 적용하려고 들지 않는 것이다.
- [Deoptimization 페널티는 적게는 2배에서 많게는 20배, 100배 이상의 실행 속도 저하를 유발한다.](https://www.thenodebook.com/node-arch/v8-engine-intro)

#### 2.2. 불변성(Immutability) 무시와 React 프레임워크와의 필연적 충돌

> > Vue 3 반응형 시스템을 어설프게 모방하다가 React의 근본 원리인 불변성(Immutability)를 짓밟았다는 비판을 피할 수 없다.

##### 2.2.1. React Fiber의 핵심 철학은 불변성(Immutability)이다

> 상태 트리의 특정 노드가 변경되었음을 React 엔진에 알리려면, 기존 객체의 속성만 변이시키는 것이 아니라 **새로운 메모리 참조값**을 가진 전혀 새로운 객체를 반환해야만 한다.
> > _이 REST DSM 라이브러리가 React와 결합될 경우 **In-place Mutation(제자리 변이) 구조로 인해 리렌더링이 전혀 트리거되지 않아서** 치명적인 호환성 충돌이 빚어질 것이다._

- React는 상태 변경 감지 시 얕은 비교(Shallow Comparision)를 사용하며, 이는 두 값이 동일한 메모리 주소를 가리킬 경우 _상태가 변경되지 않은 것으로 판단_ 하는 방식이다.
  - React 내부의 `shallowEqual` 구현은 `Object.is(obj1, obj2)`로 먼저 참조를 비교한 뒤, 불일치 시 각 KEY의 값을 순회하여 비교한다.
  - [React 공식 문서의 레거시 API인 `shallowCompare` 명세](https://legacy.reactjs.org/docs/shallow-compare.html)에 나타나있다.
- [show5116.Tistory - React에서 불변성(Immutability)를 지켜야 하는 진짜 이유 (feat. Immer)](https://show5116.tistory.com/entry/React%EC%97%90%EC%84%9C-%EB%B6%88%EB%B3%80%EC%84%B1Immutability%EC%9D%84-%EC%A7%80%EC%BC%9C%EC%95%BC-%ED%95%98%EB%8A%94-%EC%A7%84%EC%A7%9C-%EC%9D%B4%EC%9C%A0-feat-Immer)
- [chan9yu.dev - 리액트를 까본 사람 손 🙋 (Virtual DOM부터 Fiber까지)](https://www.chan9yu.dev/posts/react-core-deep-dive)

- [**2025년 10월 Stable Released React Compiler 1.0**](https://react.dev/blog/2025/10/07/react-compiler-1)은 이 불변성 요구사항을 더욱 강화했다.
  - 컴파일러는 컴파일 타임에 순수성(purity) 분석을 수행하며, **props나 state를 직접 Mutaion하는 코드를 _자동 메모이제이션_ 대상에서 제외**되거나 예측 불가능한 렌더링 버그를 유발한다.
  - 즉, [불변성이 더욱 엄격하게 강제되는 방향으로 생태계를 진화시켰다.](https://dev.to/pockit_tools/react-compiler-deep-dive-how-automatic-memoization-eliminates-90-of-performance-optimization-work-1351)

##### 2.2.2. In-place Mutation 시 React 리렌더링이 트리거되지 않는다

> DomainState.data는 반환된 동일한 Proxy 객체 인스턴스 내부에서 상태를 직접 조작(In-place Mutation)하는 전근대적인 방식을 취하고 있다. (이게, 그정돈감?)
> > _React 컴포넌트에게 이 상태륾 물려주면 렌더링이 트리거될 수 없다._

- [React 공식 GitHub 이슈](https://github.com/facebook/react/issues/15595)에 의하면, `useState`와 `useReducer`는 `Object.is` 비교를 사용하기 때문에 **동일한 객체 참조를 유지한 채 내부 값만 변경하면 리렌더링이 발생하지 않는다.**
- [같은 맥락에서](https://github.com/facebook/react/issues/19181) `delete` 연산자로 객체 내부 속성을 제거해도 참조값이 동일하면 리렌더링이 발생하지 않음이 확인됐다.
- `DomainState.data`가 Proxy로 래핑된 동일 인스턴스를 반환하고 그 내부적으로 상태를 변이시키는 구조라면, React의 비교 로직 상 **이전과 동일한 객체 취급을 받는다.**

##### 2.2.3. Vue 3와 React의 반응성 모델 차이를 간과했다

> 현 상태로는 React와의 연동 브릿지를 전혀 제공하지 않고 있다.
> > Vue 3의 반응성 시스템 `@vue/reactivity`를 어설프게 모방해놓고 React의 근본 원리인 불변성을 완전히 짓밟아버린 참사다. (말 참 심하다)

- Vue 3는 Proxy의 `set` Trap에서 **트리거(trigger)를 직접 호출하여 _의존성을 추적하는 컴포넌트를_ 재렌더링한다.**
  - 핵심은 Vue가 In-place Mutation을 감지하는 **자체 반응성 추적 런타임**을 내장하고 있다는 점이다.
  - Proxy의 `set`이 호출될 때 Vue의 스케줄러가 자동으로 개입한다.
- 반면, React는 그런 런타임 추적 레이어가 아예 없다.
  - 컴파일 타이밍에, 컴포넌트의 **Data Flow(데이터 흐름)과 Mutability(변이 가능성)을 분석**하여 메모제이션을 주입한다.
  - 이 과정에서 Proxy처럼 런타임에 내부에서 뮤테이션이 발생하는 객체는 컴파일러가 분석을 포기하고 최적화 대상에서 제외한다.

- 즉, Proxy 기반 In-place Mutation 반응성 모듈과 React 컴파일러 기반 불변성 모델은 **구조적으로 근본 비호환**이다.
  - [MobX](https://github.com/mobxjs/mobx/issues/3874)와 같은 [성숙한 Proxy 기반 상태관리 라이브러리조차 해결하지 못하였다.](https://www.frontendundefined.com/posts/monthly/proxy-state-management-mobx-valtio/)
- 다만 [Valtio](https://www.reactlibraries.com/blog/zustand-vs-jotai-vs-valtio-performance-guide-2025)를 보면, Proxy를 사용하되 그 내부에서 뮤테이션을 감지한 후 **Immutable Snapshot(불변 스냅샷)**으로 변환하여 [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)에 연결하는 아키텍처로 React 생태계와 공존한다.
  - _리스냅샷 구조를 끼워넣고, BroadcastChannel 이벤트의 발생 로직에 React 렌더링 사이클 개입을 어떻게 녹여낼지 고민해야 한다._

#### 2.3. DomainVO의 정적 스키마 검증과 치명적인 성능 병목

> `DomainVO.js`의 설계 의도를 긍정적이나, `toSkeleton()` 메서드의 복사 알고리즘 전면 개편은 단순한 성능 개선이 아닌 **데이터 무결성 보장을 위한 필수 조치**이다.

##### 2.3.1. static fields 기반 schema 응집 구조

> 서브 클래스에서 static fields를 선언하여 기본값(`default`), 검증 함수(`validate`), 변환 함수(`transform`)를 한 곳에 응집시킨 구조는 유지보수성을 크게 끌어올린다.

- 현재 [**DDD(Domain-Driven Design)** 커뮤니티의 흐름과 일치하는 아키텍처 설계 방향이다.](https://wojciechowski.app/en/articles/clean-architecture-domain-driven-design-2025)
  - Value Object(VO)는 비즈니스 도메인의 개념을 데이터와 검증 로직을 한 곳에 응집시켜 표현하는 것이 핵심 역할.
  - 이를 위해 static class fields에 검증·변환 규칙을 선언하는 패턴은 JavaScript 생태계에서 정착된 관용구이다.
- [Zod](https://javascript.plainenglish.io/9-best-practices-for-using-zod-in-2025-31ee7418062e), Valibot 같은 스키마 라이브러리들이 동일한 "스키마 응집" 철학을 기반으로 [폭발적인 채택률을 보이고 있다.](https://stackoverflow.com/questions/72025894/list-differences-dto-vo-entity-domain-model)

##### 2.3.2. `JSON.parse(JSON.stringify())` 패턴은 성능 병목이자 데이터 유실의 원흉

> 직렬화와 역직렬화를 동반하는 JSON.parse 기반의 깊은 복사는 JavaScript의 싱글 메인 스레드를 치명적으로 Blocking하는 병목의 주범이다.
> > _설상가상으로 이 원시적인 복사 방식은 날짜(Date) 객체, 정규표현식, 혹은 내장 메서드를 조용히 소멸시켜버리는 파괴적인 부작용을 동반한다._
> > _...이건 내 생각에도, 말도 안 되는 코드였다. 이럴거면 VO객체를 왜 제공해._

- [Boundev - JavaScript Deep Cloning structuredClone vs JSON.stringify](https://www.boundev.com/blog/javascript-deep-cloning-structured-clone-2026)
  - "We reviewed a client's legacy codebase last month and found 47 instances of JSON cloning. Every single one was losing data ─ Dates became strings, undefined properties vanished, and any Map or Set was completely stripped."
- `JSON.parse(JSON.stringify())` 방식은 아래 타입들을 **조용히(silently) 파괴**한다.

| Type                | Result                       |
| ------------------- | ---------------------------- |
| `Date` 객체         | ISO 문자열로 변환(객체 손실) |
| `undefined` 값      | 키 자체가 소멸               |
| `NaN`, `Infinity`   | `null`로 강제 변환           |
| `Map`, `Set`        | 빈 `{}` 또는 `[]`로 파괴     |
| `RegExp`            | 빈 `{}` 객체로 손실          |
| 순환 참조(Circular) | 런타임 에러(`throw`)         |
| `function`          | 키 자체 소멸                 |

- [BuiltIn - How to Use JSON.stringify() and JSON.parse() in JavaScript](https://builtin.com/software-engineering-perspectives/json-stringify)
- [LinkedIn - Thread(Rahul Deep)](https://www.linkedin.com/posts/rahul-deep-2a9354145_javascript-js-webdevelopment-activity-7403666150225805313-tmqf/)
- [StackOverflow - What are the dangers of Deep-copying objects using JSON.parse(JSON.stringify(obj))?](https://stackoverflow.com/questions/48494350/what-are-the-dangers-of-deep-copying-objects-using-json-parsejson-stringifyobj)

- **성능 비교**

| 복사 방식                      | 단순 객체           | 중첩/복잡 객체     | 특수 타입 지원             |
| ------------------------------ | ------------------- | ------------------ | -------------------------- |
| `JSON.parse(JSON.stringify())` | 가장 빠름 (0.157ms) | 느림 + 데이터 손실 | 미지원                     |
| `structuredClone()`            | 2-3x 느림 (0.908ms) | 정확               | Date·Map·Set·Circular 지원 |
| `_.cloneDeep()`                | 가장 느림 (2.987ms) | 정확               | Symbol 포함                |

- 단순 객체에 국한해서 JSON 방식이 빠르긴 하나, 중첩/복잡 객체로 넘어가면서부터 얘기가 달라진다.
- [Node-RED 커뮤니티의 실측 비교](https://dev.to/shantih_palani/structuredclone-the-deep-copy-hero-javascript-deserved-2add)에 의하면, `structuredClone()`은 C++ 네이티브 구현이기 때문에, Lodash `_.clone()` 대비 2~3배 빠르다.
  - `structuredClone()`은 Node.js 17부터 지원되며, Chrome 98+, Firefox 94+, Safari 15.4+ 등 [모든 메이저 브라우저에서 폴리필 없이 사용 가능하다.](https://github.com/antfu-collective/structured-clone-es)
- _`optimistic_rollback_20260320.01.md`에서 200 KB DTO의 `structuredClone` 비용을 고려해 `WeakRef` 지연 스냅샷을 검토한 바를 살펴볼 것._

##### 2.3.3. Extra Keys console.warn은 운영 환경 콘솔을 오염시키는 위험한 설계

> 백엔드 API 명세가 수시로 변동되고 필드가 덧붙여지는 SI/SM 환경의 특성을 고려할 때, 이 쓸데없이 친절한 경고 메시지는 오히려 운영 환경의 디버그 콘솔을 쓰레기통으로 만들어버릴 위험한 설계다.

- [Node.js의 로깅 모범 사례 가이드](https://forwardemail.net/en/blog/docs/best-practices-for-node-js-logging)에 의하면, _로그는 심각도(Severity)에 따라 레벨을 명확히 분리해야 하며, **프로덕션 환경에서는 최소한 `warn` 레벨 이상의 신호만 출력되어야 한다`는 것이 업계 표준이다.
- [React 환경의 로깅 가이드(2025-12)](https://dev.to/ghalex/best-practices-react-logging-and-error-handling-23hd)에서도 프로덕션에서는 `mirrorToConsole: false`를 권장한다.
- SI/SM 프로젝트의 현실을 반영하면 이 문제는 더욱 심각해진다.
  - 실무에서 백엔드 API는 `version`, `createdBy`, `lastModified` 등 프론트엔드 스키마에 정의되지 않은 서버 메타 필드를 응답에 포함하는 경우가 매우 빈번하다.
  - 이 경우 페이지 로드 & API 응답마다 `console.warn`이 반복 발화되어 콘솔 창이 의미 없는 경고로 가득 차게 된다.
  - 이 노이즈가 _진짜 경고 신호를 묻어버리는 Signal-to-Noise 비율 저하**를 유발
- **환경 변수 기반 로그 레벨 제어 로직을 삽입하는 feature를 추가해야 한다.**
- [Node.js 생태계](https://last9.io/blog/node-js-logging-libraries/)에서는 `process.env.NODE_ENV === 'production'` 여부를 확인하거나, 번들러의 트리 쉐이킹(Tree-shaking)을 활용해 프로덕션 빌드에서 `warn/debug` 로그 코드 블록 자체를 제거하는 것이 표준 관례이다.

---

### 3. 차세대 고도화를 위한 7대 필수 달성 목표 및 Architecture Insight

> 창의적인 시도와 조잡한 마무리의 전형...
> > _Proxy 기반의 상태 추적 체계와 RFC 6902 표준을 준수한 JSON Patch 직렬화 로직 등 뼈대는 Good._
> > _문서에 명시된 목표와 실제 구현 사이의 괴리가 너무 크다._

---

#### 3.1. [보안 고도화] 기만적인 보안 명세 탈피 및 진정한 네트워크 인터셉터 파이프라인 구축

##### 3.1.1. 판단 근거

- **`api-handler.js` 내부에 네트워크 인터셉터 파이프라인을 구축해야 한다.**
  - **Interceptor 패턴**은 HTTP 클라이언트 레이어에서 요청/응답의 공통 관심사(Cross-cutting Concerns)를 처리하는 표준 아키텍처 패턴이다.
  - Axios가 `interceptors.request.use()` API를 통해 이 패턴을 대중화했으며,
  - 순수 `fetch()` API에서는 `window.fetch`를 저장한 뒤 커스텀 함수로 교체하는 **Monkeypatch 방식**이나 Wrapper 함수 기반으로 [동일한 효과를 구현할 수 있다.](https://stackoverflow.com/questions/45425169/intercept-fetch-api-requests-and-responses-in-javascript)
  - 이 패턴은 인증 토큰 주입, CSRF 토큰 삽입, 에러 정규화 등의 _횡단 관심사를 처리하는_ 가장 실용적인 방법으로 유효하다.
  - [dev.to - Fetch API vs Axios: Which One Should You Use in 2025](https://dev.to/mechcloud_academy/fetch-api-vs-axios-which-one-should-you-use-in-2025-2c37)
  - [Microsoft - How to apply CSRF defense for an Axios requests on a ASP .NET CORE application](https://learn.microsoft.com/en-us/answers/questions/5533321/how-to-apply-csrf-defense-for-an-axios-requests-on)

- **DOM에서 `<meta name='csrf-token'>`이나 `document.cookie`에서 토큰을 파싱하여 싱글톤으로 은닉해야 한다.**
  - `<meta>` 태그 기반 파싱 방식(`document.querySelector('meta[name="csrf-token"]')`)은 [Spring Security 공식 문서](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)와 [실무 코드 예제](https://docs.spring.io/spring-security/site/docs/5.2.3.RELEASE/reference/html/protection-against-exploits-2.html) 모두에서 채택된 검증 방식이다.
    - 이 방식은 서버가 페이지 렌더링 시점에 토큰을 HTML에 삽입하고, 클라이언트 JS가 읽어서 헤더로 전송하는 구조다.
    - SI/SM 환경에서는 `_csrf` meta 태그 방식이 Spring Security 연동과 가장 자연스럽고, 이 라이브러리의 타겟 환경에 가장 맞는 선택이다.
  - `document.cookie` 방식은 **Double-Submit Cookie 패턴**으로, 서버가 `HttpOnly=false` 쿠키로 토큰을 심고 JS가 이를 읽어 헤더로 전송하는 방법이다.
    - 이 방식은 서버 사이드 [세션 저장이 불필요해](https://stackoverflow.com/questions/79601956/why-shouldnt-i-save-csrf-tokens-in-session-storage) 분산 아키텍처에 적합하다.
    - XSS 취약점이 존재할 경우 [쿠키 내 토큰이 탈취될 위험이 있다.](https://mojoauth.com/ciam-qna/samesite-cookie-attributes-vs-csrf-tokens)
    - [stackHawk - Noe.js CSRF Protection Guide Examples & Best Practices](https://www.stackhawk.com/blog/node-js-csrf-protection-guide-examples-and-how-to-enable-it/)
  - 두 방식을 병렬로 나열했으나, 이는 서로가 동등한 위치의 대안이라는 뜻이 아니다.
  - 실제로는 **서버 환경과 아키텍처에 따라 택일**해야 하는 설계 결정이다.
  - _이 선택 로직을 `init()` 옵션으로 외부에서 주입받는 설계가 더 견고하다._
  - [dev.to - Understanding XSRF Protection: Implementation in Fetch vs. Axios](https://dev.to/saurabh_raj_afaabe1844a4c/understanding-xsrf-protection-implementation-in-fetch-vs-axios-14hk)

- **GET은 제외하고 POST·PUT·PATCH·DELETE 요청에만 `X-CSRF-Token` 헤더를 삽입해야 한다.**
  - [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)의 명시적 권고 사항이다.
  - **RFC 9110** 기준으로 `GET`, `HEAD`, `OPTIONS`, `TRACE`는 **안전한(Safe) 메서드**로 서버 상태를 변경하지 않으므로 CSRF 토큰이 불필요
  - 반면 `POST`, `PUT`, `PATCH`, `DELETE`는 상태 변이 메서드이므로 반드시 이 토큰이 필요하다.
  - [이 패턴은 safeFetch 구현 코드에서도 `method !== 'get'` 조건 분기로 동일하게 적용되고 있다.](https://dev.to/saurabh_raj_afaabe1844a4c/understanding-xsrf-protection-implementation-in-fetch-vs-axios-14hk)

- **SameSite 쿠키가 보편화된 2026년에도 CSRF 토큰은 여전히 필요하다.**
  - [2026년 2월 9일 기준 Ghost Security 분석](https://ghostsecurity.com/blog/csrf-in-2025-not-dead-just-different)과 [2025년 2월의 InfoSec Writeups 분석](https://infosecwriteups.com/csrf-in-2025-solved-but-still-bypassable-942ca382ab77)은 **SameSite 쿠키가 CSRF의 완전한 해결책**이 아님을 명확히 한다.
    - **SameSite=Lax** : (브라우저 기본값) `GET` 방식 top-level navigation에서는 쿠키가 전송되므로 [특정 시나리오에서 우회 가능](https://infosecwriteups.com/csrf-in-2025-solved-but-still-bypassable-942ca382ab77)
    - **SameSite=Strict** : 보안은 강하나 외부 링크에서 진입 시 세션 쿠키가 차단되어 [UX 저하 문제 발생](https://mojoauth.com/ciam-qna/samesite-cookie-attributes-vs-csrf-tokens)
    - **레거시 브라우저** : 구형 IE, 일부 안드로이드 WebView에서 SameSite 미지원
    - **SI/SM 환경 특수성** : 레거시 Spring Security 버전, 내부망 환경, IE11을 아직 사용하는 공공기관 프로젝트 등에서는 [SameSite 의존도를 낮추는 것이 현실적으로 안전하다.](https://ghostsecurity.com/blog/csrf-in-2025-not-dead-just-different)
  - [MDN - Cross-site request forgery (CSRF)](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
    - "The SameSite cookie attribute provides some protection against CSRF attacks. It's not a complete defense, and is best considered as an addition to one of the other defenses."

##### 3.1.2. 실천 과제 (Outline)

###### 3.1.2.A. STEP 1. 토큰 소스 확인 및 파싱 전략

1) 연동할 서버 프레임워크가 CSRF 토큰을 어느 방식으로 클라이언트에 노출하는지 확인한다.
2) SI/SM + Spring Security 환경을 메인으로 잡고, 여러 프레임워크의 노출 방식에 다른 옵션 지원 설계를 검토한다.

###### 3.1.2.B. STEP 2. `ApiHandler` 클래스에 토큰 초기화 메서드 추가

1) `init({ csrfSelector, csrfCookieName })` 형태의 옵션을 받아 **라이브러리 초기화 시점 1회**에 토큰을 파싱한다.
2) 토큰 값을 클래스 내부 private 변수에 저장하고 외부 접근을 차단한다.
3) meta 태그가 없을 경우 `document.cookie`에서 fallback 파싱을 시도하는 _단계적 탐색 로직을 구현한다._

###### 3.1.2.C. STEP 3. 요청 전 메서드 분기 로직 삽입

1) `_fetch()` 메서드 내부에서 요청 메서드를 확인하는 분기를 추가한다.

###### 3.1.2.D. STEP 4. 토큰 부재 시 명시적 에러 처리

1) 초기화 시점에 토큰을 찾지 못한 경우, 상태 변이 요청 발생 시 **요청을 차단하고 명확한 에러 메시지를 throw**한다.
2) 조용히 토큰 없이 요청을 전송하는 것은 보안보다 더 위험한 Silent Failure이다.

###### 3.1.2.E. STEP 5. 환경 탐지 가드 추가 (Node.js 호환)

1) `typeof document !== 'undefined'` 조건으로 브라우저 환경 여부를 확인하여, Node.js 테스트 환경(Vitest)이나 SSR 환경에서 `document` 참조 에러가 발생하지 않도록 방어한다.
2) Node.js 환경에서는 토큰 삽입을 건너뛰거나, 테스트용 mock 토큰을 주입받을 수 있는 인터페이스를 열어둔다.

###### 3.1.2.F. STEP 6. Vitest 단위 테스트 작성

1) `document.querySelector`를 mock하여 토큰 파싱 성공/실패 케이스를 테스트한다.
2) GET 요청에는 헤더가 삽입되지 않음을 검증하고, PUST/PUT/PATCH/DELETE 요청에는 정확히 삽입됨을 검증한다.
3) 토큰 부재 시 에러 throw 동작을 확인하는 케이스를 포함한다.

###### 3.1.2.G. STEP 7. 문서 업데이트 ─ 거짓 명세 완전 제거 및 실제 구현 명세로 교체

1) 지원 서버 프레임워크별(Spring Security, Laravel, Django) 연동 방법을 README에 예시로 포함한다.

---

#### 3.2. [구조 개편] 의존성 주입(DI) 컨테이너 도입을 통한 순환 참조 타파 및 모듈 독립성 확보

##### 3.2.1. 판단 근거

- **JSDoc Type Import 우회는 모듈 시스템의 근간을 훼손한다**
  - ES6 모듈 시스템에서 순환 참조는 어느 모듈이 먼저 평가되느냐에 따라 _한쪽 참조가 `undefined`로 초기화되는 TDZ(Temporal Dead Zone) 문제를 유발한다.
    - 이 경우 JSDoc 타입 Import는 IDE 자동완성에만 관여하는 **주석 레벨의 Hinting**에 불과하며, 이것이 런타임 에러를 해결해주진 못한다.
    - [Railsware(2025):](https://railsware.com/blog/how-to-analyze-circular-dependencies-in-es6/) 순환 참조를 발견했을 때 취할 수 있는 실증된 전략으로 ①공통 파일 분리, ②이벤트 트리거 도입, ③의존성 주입(DI) 세 가지를 제시한다.
  - NestJS 생태계는 `forwardRef()`를 순환 참조의 공식 해결책으로 제시함에도 불구하고, 커뮤니티 컨센서스는 이것이 [**아키텍처적 설계 결함의 임시방편**](https://stackoverflow.com/questions/65671318/nestjs-circular-dependency-forwardref-drawbacks)이라고 꼬집는다.
    - "Circular dependencies usually mean you have tightly bound logic and possibly unstable architecture."
- **IoC 패턴과 팩토리 함수 주입이 올바른 해결책이다**
  - 외부의 최상위 컨텍스트(초기화 엔트리포인트)에서 파이프라인을 생성할 수 있는 '팩토리(Factory) 함수'를 DomainState에 주입(Dependency Injection)하는 방식으로 아키텍처를 뒤집어야 한다.
    - **IoC(제어의 역전):** 객체 생성과 의존성 관리의 제어권을 객체 스스로가 아닌 외부(컨테이너 혹은 엔트리포인트)에 위임하는 **설계 원칙**
    - **DI(의존성 주입):** IoC를 실현하는 **구체적 기법** 중 하나. [Constructor Injection이 가장 권장되는 방식이다.](https://builtin.com/articles/inversion-of-control)
  - `DomainState`가 `DomainPipeline`을 직접 `import`하지 않고, `DomainPipeline` 생성자 함수(또는 팩토리)를 외부에서 주입받도록 구조를 역전시키라.
  - **DI 컨테이너 도입**을 고려할 수도 있으나 오버 엔지니어링이다. Angular/NestJS 수준의 전용 DI 컨테이너를 구축하는 것은 JavaScript 커뮤니티의 주류 의견으로도 과하다는 평.
    - 실제로 필요한 것은 _엔트리포인트(`index.js`) 수준에서 명시적으로 의존성을 조립하는 컴포지션 루트(Composition Root) 패턴_ 이며, 이는 팩토리 함수만으로 구현 가능하다.
- **DomainState는 자신의 상태 변화 로직에만 집중하고, DomainPipeline의 Vitest 단위 테스트가 가능해진다**
  - 팩토리 함수 기반 DI가 테스트 격리에 유리하다는 것은 [확립된 관점이다.](https://www.reddit.com/r/javascript/comments/1be0gte/askjs_factory_functions_vs_constructors_why/)
    - "If in this case you had a factory, you would simply need to mock the return of the factory with your mock instance built for your test."
  - 현재 `DomainState.PipelineConstructor` 브릿지 패턴은 `DomainPipeline` 클래스를 격리하기 위해 [테스트 코드](https://vitest.dev/api/mock)에서 내부 브릿지 속성에 직접 접근하거나 덮어써야 하는 복잡성을 만든다.
  - 반면 생성자 또는 `init()` 함수로 `pipelineFactory`를 외부 주입받도록 바꾸면 Vitest에서 [`vi.fn()`이나 `vi.mock()`](https://vitest.dev/guide/mocking/classes)으로 깔끔하게 모킹이 가능해진다.
- **순환 참조 정적 감지 도구: `eslint-plugin-import/no-cycle`**
  - [아키텍처 개편 과정에서 반드시 병행해야 할 사항이다.](https://blog.bitsrc.io/3-ways-to-detect-circular-dependencies-f5a22310cb5a)
  - `eslint-plugin-import`의 [`import/no-cycle`](https://github.com/import-js/eslint-plugin-import/issues/2265) 규칙은 ES6 정적 `import` 구문으로 발생하는 순환 참조를 **CI 단계에서 자동 감지한다.**
  - `cicd_pipeline_20260323.01.md`에서 ESLint 설정을 구성해두고 명세했기에, 규칙만 한 줄 추가하여 순환 참조가 재발하는 것을 방지하는 안전망을 구축한다.

##### 3.2.2. 실천 과제 (Outline)

###### 3.2.2.A. 순환 참조 실태 정적 분석

1) `eslint.config.js`에 `import/no-cycle` 규칙을 추가한다.
2) `npm run lint` 실행으로 `DomainState.js`와 `DomainPipeline.js` 간 순환 경로를 공식 확인하고, CI 파이프라인에서 재발 감지 안전망을 구축한다.

###### 3.2.2.B. 의존 방향 설계 결정: 단방향 의존 그래프 수립

1) `DomainPipeline`이 `DomainState`를 알아야 하므로 의존 방향은 `DomainPipeline → DomainState`로 고정한다.
2) `DomainState`는 `DomainPipeline`을 알아서는 안 된다. `DomainState.PipelineConstructor` 브릿지 속성과 JSDoc 임포트를 모두 제거한다.

###### 3.2.2.C. DomainState에 Pipeline Factory 주입 인터페이스 설계

1) `DomainState`의 정적 메서드 `.all()`이 파이프라인 인스턴스를 반환해야 한다면, 이를 `DomainState.configure({ pipelineFactory })` 또는 `DomainState.init({ pipelineFactory })` 형태의 외부 설정 함수로 분리한다.
2) 주입받은 `pipelineFactory`는 클로저 또는 모듈 레벨 변수에 저장하여, `DomainPipeline` 클래스를 직접 `import`하지 않고도 파이프라인 인스턴스를 생성할 수 있게 한다.

###### 3.2.2.D. 엔트리포인트(index.js)를 컴포지션 루트(Composition Root)로 재구성

1) `index.js`에서 `DomainPipeline`과 `DomainState`를 각각 `import`한 뒤, `DomainState.configure({ pipelineFactory: (...args) => new DomainPipeline(...args) })`를 호출하여 의존성을 명시적으로 조립한다.
2) 이 단계에서만 두 모듈이 함께 존재할 수 있으며, 각 모듈 파일은 서로를 알지 못하는 완전한 단방향 구조가 된다.

###### 3.2.2.E. Vitest 단위 테스트로 격리 검증

1) `DomainPipeline`을 모킹하지 않은 상태로 `DomainState` 단독 테스트가 통과하는지 확인한다.
2) `DomainState.configure({ pipelineFactory: vi.fn() })`처럼 팩토리를 mock 함수로 교체하여, `.all()` 메서드가 mock 파이프라인 인스턴스를 반환하는지 단위 테스트로 검증한다.
3) 파이프라인 모킹 없이 `DomainState` 전체 테스트가 통과되면 모듈 독립성 확보 완료

###### 3.2.2.F. 문서화: 아키텍처 의존 방향 다이어그램 갱신

1) README 파일에 변경 후의 모듈 의존 방향 다이어그램을 추가한다.
2) `DomainPipeline → DomainState`, `index.js(Composition Root)`가 두 모듈을 조립한다는 흐름을 명시하여 향후 기여자가 순환 참조를 재발시키지 않도록 한다.

---

#### 3.3. [상태 관리] Reactivity 엔진의 불변성(Immutability) 지원을 위한 Shadow State 아키텍처 설계

> 현재 라이브러리의 Proxy 기반 반응성 엔진은 _원본 객체를 **직접 변이(Mutaion)**시키는 방식으로 동작한다.
> 이는 React와 같은 모던 프레임워크가 기대하는 **참조 동등성(Reference Equality)** 기반의 렌더링 최적화와 정면으로 충돌한다.
> 진단 문서는 이를 해결하기 위한 아키텍처로 **Immer.js의 구조적 공유(Structural Sharing) 메커니즘을 내재화한 Shadow State** 설계를 제안한다.

##### 3.3.1. 판단 근거

- **Immer.js의 Structural Sharing 메커니즘을 내재화**
  - **Structural Sharing**은 2026년 기준으로 _불변 상태 관리의 핵심 패러다임_으로 완전히 정착했다.
    - [Immer.js](https://immerjs.github.io/immer/)의 내부 동작은 [다음과 같다:](https://hmos.dev/en/deep-dive-to-immer)
      1) 속성에 접근 시 Proxy가 해당 경로에 대한 **지연 프록시(Lazy Proxy)**를 생성한다.
      2) `set` Trap이 발화되면 `modified_` 플래그를 true로 마킹하고 루트까지 부모 노드를 갱신한다.
      3) `produce()` 완료 시 `modified === true`인 노드만 새 복사본(`copy_`)를 반환하고, 변경되지 않은 노드는 원본 참조(`base_`)를 그대로 재사용한다.
  - **변경된 부분만 O(depth)에 비례하는 비용으로 새 참조를 생성하고, 변경되지 않은 자식은 기존 메모리 참조를 공유**하는 원리이다. _뭔 소린지 안 와닿음._

  - Shadow State 패턴은 React의 리렌더링 조건 ─ `Object.is()` 기반 참조 동등성 비교에 부합하며 [React 연동 문제를 정확히 해결한다.](https://javascript.plainenglish.io/immutability-in-javascript-and-react-why-it-matters-2a1f5441c586)
- **`changeLog`가 쌓일 때마다 새 참조를 통해 React의 참조 동등성 비교가 자동으로 트리거되어야 한다.**
  - 변경되지 않은 자식 객체의 노드들은 기존 메모리 참조를 그대로 공유하여 메모리 복사 비용을 O(1)에 가깝게 최적화한다.
    - 이로써 changeLog가 쌓일 때마다 새 참조를 통해 React의 참조 동등성 비교가 자동으로 트리거되게 할 수 있다.
  - 외부 상태 라이브러리가 React와 연동하는 올바른 방법에 대해, React 18 이후 공식적으로 권장하는 사항은 다음과 같다.
    - [**`useSyncExternalStore` Hook:**](https://ko.react.dev/reference/react/useSyncExternalStore) 이 훅의 `getSnapshot` 콜백에는 **반드시 불변(immutable) 스냅샷을 반환해야 한다**는 강제 요건이 있다.
    - Valtio 라이브러리가 이 패턴의 실증 사례이다.
      - Valtio는 `proxy()`로 뮤터블 상태를 관리하고, `useSnapshot()`이 내부적으로 `snapshot()`을 호출하여 `Object.freeze()` 기반의 불변 스냅샷을 생성한 뒤,
      - `useSyncExternalStore`에 전달한다.
    - "참조가 바뀌었으니 리렌더링이 된다"는 단순 설명 뒤에는, **`useSyncExternalStore`의 `getSnapshot` 규약을 준수한다는 핵심 원칙**이 숨어 있다.
    - `getSpanshot`도 매번 새 객체를 생성하면 무한 루프가 발생하므로, [변경이 없을 때는 반드시 이전 스냅샷 참조를 캐시하여 재반환해야 한다.](https://junheedot.tistory.com/entry/useSyncExternalStore%EB%A1%9C-%EC%99%B8%EB%B6%80-%EC%83%81%ED%83%9C-%EC%95%88%EC%A0%84%ED%95%98%EA%B2%8C-%EB%8F%99%EA%B8%B0%ED%99%94%ED%95%98%EA%B8%B0)
    - Shadow State 설계에서 이 스냅샷 캐싱 로직을 명시적으로 다루어야 한다.

- **`Object.freeze()`로 외부 노출 스냅샷을 완전히 동결하여 불변성을 강제한다.**
  - _**조건부 유효 ─ 프로덕션 환경 성능 고려**_
  - [dev.to - JavaScript Object - Shallow freeze vs Deep freeze](https://dev.to/syed_ammar/javascript-object-deep-freeze-vs-shallow-freeze-4nk8)
    - `Object.freeze()`는 표면 동결(Shallow freeze)만 수행한다.
    - 중첩 객체까지 동결하려면 재귀 순회(`deepFreeze`) 함수가 필요하며, 이는 **객체 크기에 비례하는 O(n) 순회 비용**을 수반한다.
  - 실무 권장 패턴은 **개발 환경에서만 freeze를 적용하고, 프로덕션에서는 no-op으로 처리**하는 것이다.
  - Valtio도 `Object.freeze()` 기반의 스냅샷을 사용하지만, 이 동결이 프로덕션 성능에 미치는 영향은 실측이 더 필요하다.

- **Immer 대안으로 Mutative 라이브러리에 대한 고려**
  - 앞서 Immer.js만 참조 대상으로 다루었으나, 2026년 주요 대안으로 떠오른 Mutative 라이브러리를 검토할 필요가 있다.
  - 공식 벤치마크에 따르면 Mutative는 Immer 대비 [최대 **17배 성능 우위**를 보인다.](https://github.com/unadlib/mutative)
  - Mutative는 RFC 6902 JSON Patch 명세를 네이티브로 완전 지원하고 있다. 설계 방향에 있어 공통점이 많으니 한 번 읽어볼 것.

##### 3.3.2. 실천 과제 (Outline)

###### 3.3.2.A. STEP 1. Shadow State 저장 구조 설계

1) `DomainState` 내부에 `#shadowCache` 변수를 선언한다. 이 변수는 가장 최근 생성된 불변 스냅샷 객체의 참조를 보관한다.
2) [`changeLog`가 비어 있을 때 `getSnapshot()`을 호출하면 캐시된 `#shadowCache`를 그대로 반환한다.](https://blog.openreplay.com/immutable-state-easy-understanding-immer/)
    매번 새 객체를 반환하면 `useSyncExternalStore` 무한 루프가 발생한다.

###### 3.3.2.B. STEP 2. Structural Sharing 로직 구현

1) Proxy의 `set` Trap이 발화될 때, 변경된 경로`path`를 추적하여 `modified` 플래그를 루트까지 상향 전파하는 로직을 구현한다.
2) 스냅샷 생성 시 `modified === true`인 노드는 얕은 복사(`{.node}`)를 수행하고, `modified === false`인 노드는 기존 참조를 그대로 사용한다.
3) 이 복사 단계에서 `Date`, `Map`, `Set` 등 특수 타입을 올바르게 처리하는 분기를 포함한다.
   JSON.parse 방식의 타입 손실 문제를 이 단계에서 차단한다.

###### 3.3.2.C. STEP 3. Snapshot 동결(Freeze) 전략 결정

1) 개발 환경(`NODE_ENV !== 'production'`)에서만 `deepFreeze`를 적용하고, [프로덕션에서는 no-op 처리한다.](https://coreui.io/answers/how-to-implement-deep-freeze-in-javascript/)
2) [`deepFreeze` 구현 시](https://dev.to/syed_ammar/javascript-object-deep-freeze-vs-shallow-freeze-4nk8) `WeakSet`을 통해 [순환 참조 안전 처리를 포함한다.](https://coreui.io/answers/how-to-implement-deep-freeze-in-javascript/)
3) 대안으로 `Object.freeze()` 대신 **읽기 전용 Proxy 트랩**(`set` Trap에서 throw 발화)을 사용하면 재귀 순회 비용 없이 유사한 효과를 얻을 수 있다.

###### 3.3.2.D. STEP 4. React 연동 인터페이스(`useDomainState`) 구현

1) `DomainState`에 `subscribe(listener)` 메서드와 `getSnapshot()` 메서드를 추가한다.
2) `subscribe`는 `changeLog`가 변경될 때마다 등록된 리스너를 호출하고, 구독 해제 함수를 반환한다.
3) `getSnapshot`은 `#shadowCache`를 반환한다: 상태 변경이 있을 때만 새 참조를 생성하고 캐시한다.
4) `useSyncExternalStore(state.subscribe, state.getSnapshot)`을 감싸는 `useDomainState(domainState)` 커스텀 훅을 별도 React 어댑터 패키지로 제공한다.
   [(코어 라이브러리의 프레임워크 비의존성 철학을 유지)](https://valtio.dev/docs/api/basic/useSnapshot)

###### 3.3.2.E. STEP 5. Valtio 연동 방식 레퍼런스 검토

1) Valtio의 `proxy()` + `useSnapshot()` + `useSyncExternalStore` 연동 구조를 참조 구현으로 [상세 분석한다.](https://ungumungum.tistory.com/137)
2) Valtio v2의 `useSnapshot`이 [React 19.1에서 호환 문제를 일으킨 사례를 통해,](https://github.com/pmndrs/valtio/discussions/1115)
   `useSyncExternalStore`와의 연동 시 React 버전 대응 테스트 케이스를 Vitest에 포함한다.

###### 3.3.2.F. STEP 6. Mutative 아키텍처 설계 검토

1) 외부 의존성 없는 모듈 만들기로 했으니까 도입은 안 한다.
2) 대신, Mutative의 copy-on-write 설계를 참고 아키텍처로 삼는다.

###### 3.3.2.G. STEP 7. 성능 회귀 테스트 통합

1) 1,000개 이상의 중첩 객체를 대상으로 스냅샷 생성 시간을 측정하는 벤치마크를 `vitest.bench`로 작성한다.
2) Shadow State 생성 비용이 기존 `JSON.parse` 방식 대비 동등하거나 낮은지 확인한다.
   Immer의 경우 auto-freeze 활성화 시 Mutative 대비 17배 성능 열세가 나타나므로, 자체 구현의 성능 목표치를 사전에 설정하는 것도 바람직.

---

#### 3.4. [성능 병목] 메인 스레드 부하 해소를 위한 깊은 복사 (Deep Copy) 알고리즘 개편

> `DomainVO.toSkeleton()` 메서드에서 사용되는 `JSON.parse(JSON.stringify())` 방식이 _성능 병목과 데이터 유실의 이중 문제_ 를 내포하고 있다.
> 이를 해결하기 위해 `①structuredClone() 전면 도입`, `②레거시 환경용 커스텀 cloneDeep 폴백 제공` — 그리고 여기에 `③로그 레벨 제어기 삽입`을 진행한다.

##### 3.4.1. 판단 근거

- **`structuredClone()`을 1순위 복사 엔진으로 전면 도입하여 V8의 네이티브 직렬화 파이프라인을 활용한다.**
  - [`structuredClone()`](https://github.com/Chalarangelo/30-seconds-of-code/blob/master/content/snippets/js/s/deep-clone-structured-clone.md)은 HTML Living Standard에 정의된 **구조적 복제 알고리즘(Structured Clone Algorithm)**의 직접 노출 API이다.
    - [MDN 명세에서는 다음을 보장한다:](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone)
    1) `Date` 객체 →`Date` 객체로 완전 보존
    2) `Map`, `Set` → 완전 보존
    3) `RegExp` → 완전 보존
    4) Circular Reference → 올바르게 처리
    - [Circular Reference 지원은 디버그 채털(`_stateRegistry`) 구조에서도 잠재적 위협을 제거한다.](https://stackoverflow.com/questions/122102/what-is-the-most-efficient-way-to-deep-clone-an-object-in-javascript)
  - `structuredClone()`은 V8 내부의 C++ 구현으로 수행되며, JS 레이어에서 `JSON.stringfy()` + `JSON.parse()`를 두 번 통과하는 기존에 사용한 방식보다 [오버헤드가 적다.](https://buttondown.com/weekly-project-news/archive/weekly-github-report-for-node-february-16-2026-1189/)
  - Node.js 25.x 릴리스에서도 V8 직렬화 파이프라인이 지속적으로 최적화되고 있음을 [공식 CHANGELOG](https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V25.md#25.8.2)에서 확인할 수 있다.

- **구형 레거시 브라우저 지원이 필요하다면 커스텀 cloneDeep 풀백을 제공한다.**
  - 구형 레거시 브라우저를 지원해야 하는 척박한 SI 환경을 전제로, 커스텀 폴백의 필요성을 고려해야 한다.
  - IE11은 2022년 6월 공식 지원이 종료되었다. 그러나 [Next.js 공식 문서](https://nextjs.org/docs/architecture/supported-browsers)에 따르면 여전히 `structuredClone`에 대해 조건부 폴리필 로드 패턴을 예시로 제공하고 있다.
    - **모든 SI 환경이 동일하지 않기에** 특수 레거시 환경(구형 Android WebView, 특정 내부망 키오스트, 일부 공공기관)에서는 [폴백이 여전히 필요할 수 있다.](https://www.reddit.com/r/webdev/comments/1ljvyip/is_anyone_still_using_polyfills_or_fallbacks_for/)
  - [필수적인 사항이 아니다:](https://dev.to/askyt/what-is-the-most-efficient-way-to-deep-clone-an-object-in-javascript-3cp9)
    - `structuredClone`을 기본값으로 사용하고,
    - `typeof structuredClone !== 'undefined'`를 조건으로 런타임 탐지 후
    - 폴백으로 커스텀 재귀 함수를 제공하는 **점진적 향상(Progressive Enhancement)** 패턴을 따르자.
  - [커스텀 재귀 cloneDeep의 올바른 구현 조건:](https://www.geeksforgeeks.org/javascript/implement-custom-function-to-deep-clone-in-javascript/) `typeof`를 통한 원시 타입 판별과 특정 객체(배열, JSObj)만 재귀 순회 전략에 더해, **`Date`, `RegExp` 인스턴스 분기**를 포함해야 한다.
    - `obj === null` → 즉시 반환 (null 함정 방어)
    - `typeof obj !=== 'object'` → 즉시 반환 (원시타입 탈출)
    - `obj instanceof Date` → `new Date(obj.getTime())` 복사
    - `obj instanceof RegExt` → `new RegExt(obj.source, obj.flags)` 복사
    - `Array.isArray(obj)` → `obj.map(item => _cloneDeep(item))` 재귀
    - 일반 객체 → `Object.keys(obj)` 순회 재귀

- **환경 변수 판별 로직으로, 프로덕션에서 DomainVO의 Extra Keys 경고 로그를 차단한다.**
  - Node.js(2026-03) 로깅 실무 가이드([ForwardEmail](https://forwardemail.net/da/blog/docs/best-practices-for-node-js-logging))에 의하면, 특정 조건에서 로그를 완전히 suppress(억제)하는 Symbol 기반 메커니즘을 소개한다. 라이브러리 수준에서는 `Symbol.for('dsm.silent')` 방식의 선택적 억제 인터페이스도 고려해볼 만하다.
  - ["Console.log has no log levels, no structure, and no context. Stop using console.log for Production Logging."](https://dev.to/jay_m/stop-using-consolelog-in-production-in-2025-heres-what-you-should-do-instead-3e4e)
  - ["In general, console.log should be avoided in production, and you can have that configured at a deployment level than a code level."](https://www.reddit.com/r/learnjavascript/comments/1kl1zj5/should_i_remove_consolelog_in_production/)

```javascript
// 표준 패턴 — 커뮤니티 컨센서스 [web:301]
if (process.env.NODE_ENV !== 'production') {
  console.warn(`[DomainVO] Extra Keys detected: ${extraKeys.join(', ')}`);
}
```

##### 3.4.2. 실천 과제 (Outline)

###### 3.4.2.A. STEP 1. `structuredClone` 런타임 탐지 유틸리티 모듈 분리

1) e.g., `src/utils/clone.js`(또는 동등한 내부 유틸 경로) 를 신설
2) `typeof structuredClone !== 'undefined'` 조건으로 환경을 탐지하는 `safeClone(value)` 함수를 작성한다.
3) 이 유틸함수를 `DomainVO.js`의 `toSkeleton()` 내부에서 직접 `JSON.parse(JSON.stringify())` 호출 대신 사용하도록 교체한다.
4) 모듈이 분리되면 복사 알고리즘을 나중에 독립적으로 교체해도 `DomainVO` 코드를 건드릴 필요가 없어진다. ─ 단일 책임 원칙(SRP) 준수

###### 3.4.2.B. STEP 2. `structuredClone` 지원 경로 구현

1) `safeClone` 내부 1순위 경로: [`return structuredClone(value)`](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone)
2) 이 경로는 `Date`, `Map`, `Set`, `RegExp`, Circular Reference 등 모든 특수 타입을 자동으로 올바르게 복제한다.
3) 별도의 타입 분기 로직을 추가할 필요가 없으며, [V8 C++ 네이티브 직렬화 파이프라인을 그대로 위임한다.](https://buttondown.com/weekly-project-news/archive/weekly-github-report-for-node-february-16-2026-1189/)

###### 3.4.2.C. STEP 3. 커스텀 재귀 폴백(`_cloneDeep`) 구현 ─ 레거시 환경 대응

1) `structuredClone`이 없는 환경을 위한 내부 `_cloneDeep(obj)` 함수를 동일 유틸 모듈에 함께 구현한다.
2) `Map`, `Set`이 필요하면 추가 분기를 삽입하되, 이 라이브러리의 VO 레이어에서 실제로 사용될 타입 범위를 먼저 파악한 후 명세 작업을 병행한다.

###### 3.4.2.D. STEP 4. `safeClone` 완성 ─ 탐지 + 폴백 연결

1) `structuredClone`과 `_cloneDeep` 구현을 마친 뒤, 이 둘을 연결하여 완성한다.

```javascript
if (typeof structuredClone !== 'undefined') → structuredClone(value)
else → _cloneDeep(value)
```

###### 3.4.2.E. STEP 5. Extra Keys 경고 로그에 환경 변수 게이트 삽입 _뭔 소린지 모르겠다._

1) `DomainVO`의 Extra Keys 감지 블록을 찾아 [`process.env.NODE_ENV !== 'production'` 조건 안으로 감싼다.](https://dev.to/jay_m/stop-using-consolelog-in-production-in-2025-heres-what-you-should-do-instead-3e4e)
2) 브라우저 번들 환경에서는 Vite-Rollup의 `define` 설정 또는 `import.meta.env.DEV` 조건을 사용한다.
3) 최종 프로덕션 빌드 시, 해당 코드 자체가 **트리 쉐이킹(Tree-Shaking)**으로 번들에서 제거되도록 한다.
4) 단순히 런타임에서 건너뛰는 것보다 번들 수준에서 제거되는 것이 최종 번들 크기와 파싱 비용 측면에서 모두 유리하다.

###### 3.4.2.F. STEP 6. 경고 레벨 분류 체계 도입

1) `console.warn`으로 단일 발화하던 DomainVO 진단 메시지를 레벨에 따라 분류한다:
   - Extra Keys 감지 → 개발 환경 `console.warn` (기능 이상 없음, 정보성 경고)
   - 필수 필드 누락·타입 불일치 → 환경 무관 `console.error` (기능 영향 있음)
2) 라이브러리 `init()` 옵션에 `silent: true` 플래그를 노출하여, 사용자가 모든 내부 로그를 완전히 억제할 수 있는 인터페이스를 제공한다.

###### 3.4.2.G. STEP 7. Vitest 단위 테스트 작성

1) `safeClone`의 세 가지 경로를 독립적으로 검증하는 테스트를 작성한다:
    1. `structuredClone` 경로: 각 타입별 객체들이 올바르게 복제되는지 확인
    2. `_cloneDeep` 폴백 경로: `global.structuredClone`을 `undefined`로 설정하고 같은 케이스 검증
    3. Primitive 타입 직접 반환 확인: null 함정 방어 검증
2) Extra Keys 경고 테스트: `NODE_ENV=production` 설정 시 `console.warn`이 호출되지 않음을 `vi.spyOn(console, 'warn')`으로 검증

---

#### 3.5. [오프로딩 최적화] Web Worker를 활용한 상태 직렬화 및 브로드캐스팅 분산 처리

> 다음 로직은 **메인 스레드에서 UI 렌더링 프레임(60fps)을 저하시키는 치명적인 작업**일 수 있다.
> > `api-mapper.js`의 JSON Patch 변환 로직
> > `debug-channel.js`의 `_stateRegistry` 전체 동기화 로직

##### 3.5.1. 판단 근거

- **JSON Patch 변환 로직이 UI 프레임을 끊어먹을 수 있다.**
  - [MDN 성능 가이드](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/JavaScript)에 의하면, **메인 스레드 단일 작업이 50ms를 초과**할 때 Long Task로 분류되어 UI 반응성 문제가 발생한다.
  - JSON Patch 변환 로직 단독으로는 Web Worker 오프로딩의 효과보다 `postMessage` 직렬화 오버헤드가 더 클 수 있다.
    - `api-mapper.js`의 `toPatch()`함수가 실제로 50ms를 초과할 때 유효한 판단이 될 수 있다.
    - JSON Patch 변환은 changeLog 배열을 순환하여 필드를 조합하는 O(n) 선형 작업이고, _일반적인 REST API VO의 필드 수 (10~50개 수준)에서 이 연산이 50ms를 초과하는 것은 불가능에 가깝다._
    - 오히려 Web Worker의 오버헤드가 더 클 수 있다는 점을 경고.
    - [Reddit:](https://www.reddit.com/r/javascript/comments/1h3m2rv/askjs_reducing_web_worker_communication_overhead/) "When I said shared worker only be 30~40% faster, that's assuming one worker ...It's not necessarily obvious this will actually yield as much performance gain as you might hope."
    - [StackOverflow:](https://stackoverflow.com/questions/39419116/webworkers-execution-appears-to-be-much-slower-than-the-main-thread)"I track time in the web worker to see how much is being used ...on the main thread the complete in 250ms ...using workers [it became] almost 500ms. I'm going 100% slower."
  - `_stateRegistry` 전체 동기화처럼, 수백~수천 개의 객체를 한 번에 `Object.fromEntries`로 변환하는 케이스는 충분히 Long Task가 될 수 있다.
  - _**Web Worker 오프로딩의 효과는 **작업 크기에 비례**한다. 먼저 `performance.measure()`로 실측하고, Long Task 기준(50ms)를 초과하는 작업만 선별적으로 오프로딩 하는 것이 올바른 방향이다.**_

- **메인 스레드는 changeLog 적재만 담당하고 직렬과·브로드캐스팅은 Worker가 전담해야 한다.**
  - **Off-main-thread Architecture**의 원칙은 Web Worker 도입의 방향성에 대해서는 정확하다.
    - [surma.dev:](https://surma.dev/things/when-workers/) "You should always use Web Workers. Off-main-thread architectures increase resilience against unexpectedly large or long tasks."
    - 특히 `_stateRegistry`처럼 _예측 불가능한 크기의 상태 맵 전체를 직렬화_ 하는 작업은 Worker로 분리하는 것이 합당한 설계이다. (성능 관점을 제하고 바라본다면.)
  - [MDN 공식 명세](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel/postMessage)와 [Last9 기술 블로그](https://last9.io/blog/understanding-worker-threads-in-node-js/) 모두 **[BroadcastChannel](https://dev.to/itxshakil/broadcastchannel-api-a-hidden-gem-for-web-developers-33c4) API는 Web Worker 컨텍스트에서 직접 인스턴스화 가능함**을 확인한다.
    - Worker 내부에서 `new BroadcastChannel('debug-channel')`을 호출하고 바로 `postMessage`를 발화할 수 있으며,
    - 메인 스레드가 Worker에게 `postMessage`로 상태 데이터를 전달하면, Worker가 이를 직렬화하여 BroadcastChannel에 브로드캐스트하는 파이프라인은 **기술적으로 완전히 우효ww**

- **`postMessage` 비용과 [Transferable Objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) 최적화**
  - Worker 오프로딩을 도입할 때에는 `postMessage` 직렬화 비용에 대해 고민해야 한다.
    - `postMessage`는 내부 `structuredClone` 알고리즘을 사용하여 데이터를 복사한다.
    - changeLog나 stateRegistry 맵을 일반 객체로 전달하면 **직렬화·역직렬화 비용이 추가된다.**
  - Transferable Objects:
    - [`ArrayBuffer`를 전송 목록(`transfer list`)에 포함시키면 **메모리 소유권 자체가 이전**되는 zero-copy 전송이 이루어진다.](https://developer.chrome.com/blog/transferable-objects-lightning-fast?hl=ko)
    - 단, changeLog 데이터는 일반 객체 배열 구조이므로, zero-copy를 활용하기 위해서는 `TypedArray` 또는 `ArrayBuffer` 형태로 인코딩·디코딩하는 추가 작업이 필요하다.
  - 한편, [Nolan Lawson의 분석에 의하면:](https://nolanlawson.com/2016/02/29/high-performance-web-worker-messages/) "It's actually faster to JSON.stringify() then postMessage() a string than to postMessage() an object."
  - 결론은...
    - 복잡한 객체를 전달할 땐, 메인 스레드에서 미리 `JSON.stringify()`로 문자열화한 후 `postMessage`하는 것이 더 빠른 최적화 방법일 수 있다.
    - Worker를 도입하려면, 이 알고리즘에 대한 최적화 포인트를 명세해야 한다.

##### 3.5.2. 실천 과제 (Outline)

###### 3.5.2.A. STEP 1. 성능 기준선 실측: Worker 도입 전 필수 작업

1) `performance.mark()` + `performance.measure()`를 `api-mapper.js`의 `toPatch()` 호출 전후에 삽입하여 실제 소요 시간을 측정한다.
2) `debug-channel.js`의 `Object.fromEntries(_stateRegistry)` 동기화 블록의 소요 시간도 동일하게 측정한다.
3) **50ms(Long Task 기준) 미만의 작업은 Worker 도입을 보류**한다.

###### 3.5.2.B. STEP 2. `SerializeWorker` 모듈 설계: 책임 분리

1) Worker에게 맡길 작업 범위를 명확히 선언한다.
   - `_stateRegistry` 전체 `Object.fromEntries` 직렬화 후 BroadcastChannel 발화
   - 대규모 VO(예: 필드 100개 이상) `toPatch()` 변환 (소규모에서는 메인 스레드가 처리)
2) `src/workers/seriallizer.worker.js` 파일로 Worker 스레드를 분리하고, `new Worker(new URL('./serializer.worker.js', import.meta.url))`로 동적 임포트하여 번들러 호환성을 확보

###### 3.5.2.C. STEP 3. Worker 내부 BroadcastChannel 직접 인스턴스화

1) `serializer.worker.js` 내부에서 `const channel = new BroadcastChannel('dsm-debug')`를 직접 선언하여 Worker가 브로드캐스팅을 완전 자율적으로 수행하도록 한다.
2) 메인 스레드는 `worker.postMessage({ type: 'BROADCAST_STATE', payload: _stateRegistry })`만 호출하면 되고, 이후 BroadcastChannel 발화는 Worker가 독립적으로 처리한다.

###### 3.5.2.D. STEP 4. postMessage 전송 비용 최소화

1) `_stateRegistry` Map을 Worker에 전달할 때 일반 객체 원형으로 보내지 않는다.
2) 메인 스레드에서 JSON.stringify(Object.fromEntries(_stateRegistry))로 **문자열화한 후 Worker에 전달**한다 — 이것이 structured clone보다 빠를 수 있다.
3) Worker는 수신 후 JSON.parse()로 역직렬화하여 BroadcastChannel로 발화한다.
4) 추후 TypedArray + ArrayBuffer 전송 전략으로 업그레이드하는 것은 데이터 인코딩 복잡도를 고려하여 v2 이후로 미룬다.

###### 3.5.2.E. STEP 5. Worker 생명주기 관리: 메모리 누수 방지

1) Worker 인스턴스는 디버그 채널과 동일한 Lazy Singleton 패턴으로 [최초 1회만 생성한다.](https://transloadit.com/devtips/boost-js-file-uploads-using-web-workers-and-streams/)
2) `navigator.hardwareConcurrency`로 코어 수를 파악하되, 디버그 용도 Worker는 단 1회로 제한한다.
3) 디버그 채널 해제 시 `worker.terminate()`를 반드시 호출하고, `beforeunload` + Heartbeat GC 두 경로 모두에서 종료가 보장되도록 처리한다.

###### 3.5.2.F. STEP 6. 작업 임계값 기반 적응형 라우팅 구현

1) `toPatch()` 변환 대상의 changeLog 크기를 사전 검사하여 임계값(e.g., 변경 항목 20개 이상)을 초과할 경우에만 Worker로 위임하고, 그 미만은 메인 스레드에서 직접 처리하는 적응형(Adaptive) 라우팅 로직을 설계한다.
   - [MDN - JavaScript performance optimization](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/JavaScript)
   - [Medium - Web Workers: A Guid to Proper Usage and Limitations](https://javascript.plainenglish.io/web-workers-a-guide-to-proper-usage-and-limitations-447de01dab61)
2) 이 임계값은 STEP 1 실측 결과에 기반하여 환경별로 조정 가능하도록 `init()` 옵션으로 외부에서 주입받을 수 있게 한다.

###### 3.5.2.G. STEP 7. Vitest 통합 테스트 작성

1) Vitest에서 Web Worker 테스트는 기본적으로 `jsdom` 환경에서 Worker API가 미지원이므로, `vitest.config.js`에서 `environment: 'happy-dom'` 또는 Worker Mock 설정을 적용한다.
2) `serializer.worker.js`의 메시지 수신 → Broadcastchannel 발화 로직을 단위 테스트로 검증한다.
   - `worker.onmessage` mock + `BroadcastChannel.postMessage` spy 조합으로 검증

---

#### 3.6. [개발 생태계] 완벽한 하이브리드 번들링 체계 및 타입 추론 환경 점검

##### 3.6.1. 판단 근거

- **Vite 또는 Rollup을 도입하여 라이브러리 모드 빌드 파이프라인 구축**
  - Vite와 Rollup, **두 도구의 용도를 커뮤니티 컨센서스는 분명하게 구분한다.**
    - [**LinkedIn(2025-12):**](https://www.linkedin.com/posts/yashraiengi_vite-or-rollup-you-might-be-choosing-wrong-activity-7402561107871039488-qfzW/) "If you want to build fast → pick Vite. If you want to build right for long-term scaling → understand Rollup. When we tried to expose multiple entry points with custom bundle outputs… Vite started getting in the way. Switching to Rollup gave us precise control."
  - REST DSM은 NPM 공개 배포가 목표인 라이브러리이므로 **Rollup 직접 사용이 더 적합하다.**
  - Vite는 개발 서버 경험이 필요한 애플리케이션이나 사내 컴포넌트 라이브러리에 유리하다.
    - Vite Library Mode도 내부적으로 Rollup을 사용하니, [_중간 레이어 없이 Rollup을 직접 구성하는 것이 더 투명하고 제어 가능한 선택이다._](https://strapi.io/blog/modern-javascript-bundlers-comparison-2025)
  - [**tree-shaking 최적화를 위한 `preserveModules 설정:**](https://dev.to/morewings/how-to-build-a-tree-shakable-library-with-vite-and-rollup-16cb)
    - 단일 파일 번들로 출력 시 소비자(consumer)가 일부 기능만 `import`해도 전체 라이브러리가 포함되는 문제가 있다. `preserveModules: true` 설정으로 모듈 구조를 유지하면 번들 크기를 극적으로 줄일 수 있다.

| 기준               | Vite (Library Mode)                    | Rollup (직접 사용)                   |
| ------------------ | -------------------------------------- | ------------------------------------ |
| 주 용도            | 애플리케이션, 내부 컴포넌트 라이브러리 | **NPM 공개 패키지, 배포 라이브러리** |
| 설정 유연성        | 보통 (내부적으로 Rollup 사용)          | **높음** (완전한 제어)               |
| 다중 엔트리포인트  | 복잡                                   | **자연스럽게 지원**                  |
| 트리 쉐이킹 최적화 | `preserveModules` 설정 필요            | **기본 우수**                        |
| ESM/CJS 듀얼 출력  | 가능하나 설정 필요                     | **간단하고도 안정적**                |

- **package.json `exports` 필드로 CJS/ESM 듀얼 패키지를 구성해야 한다.**
  - [`exports` 필드 없이 `main` 필드만 사용하면 ESM과 CJS를 동시에 제공할 수 없다.](https://www.zerocho.com/category/NodeJS/post/64fff6adc8629d716bf2172c)
    - [Toss(2025-12) 실무 가이드](https://toss.tech/article/commonjs-esm-exports-field)와 [Node.js 공식 문서](https://nodejs.org/download/release/v15.2.0/docs/api/packages.html) 모두 `exports` conditional exports 패턴을 표준으로 명시한다.
  - Dual Package Hazard: 두 버전의 동일한 패키지가 같은 런타임 환경에서 로드될 수 있다. `instanceof` 비교과 `false`를 반환하고, 한 버전에 추가한 속성이 다른 버전에는 존재하지 않는다.
    - 이는 `DomainState` 인스턴스를 `instanceof DomainState`로 타입 검사할 때 CJS와 ESM 버전이 혼재하면 예상치 못한 `false`를 반환하는 심각한 버그로 이어질 수 있다.
    - 이 문제를 회피하는 권장 패턴은 **ESM-only Wrapper**를 제공하거나, CJS를 기본 배포 형식으로 하고 ESM을 `./module` 서브 패스로 제공하는 방식이다.

```javascript
// package.json 표준 패턴 [web:346][web:348]
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  },
  "types": "./dist/index.d.ts"
}
```

- **JSDoc 기반 빌드 타임 `.d.ts` 선언 파일 자동 생성**
  - [TypeScript 3.7 이후 공식 지원 중이다.](https://www.typescriptlang.org/docs/handbook/declaration-files/dts-from-js.html)
  - [`declarationMap: true` 옵션을 활성화하면](https://oneuptime.com/blog/post/2026-01-24-typescript-declaration-files/view) IDE에서 "Go to Definition" 기능이 `.d.ts`가 아닌 **원본 `.js` 소스 파일로 이동**하여 사용자 경험이 크게 향상된다.
  - `package.json`에 `types` 필드를 명시하여 타입 선언 파일의 위치를 알려야 한다.

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  }
}
```

- **시멘틱 버저닝 + CHANGELOG 자동화를 철저히 관리**
  - **Conventional Commits + semantic-release 조합이 업계 표준이다.**
  - [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) 명세는 커밋 타입을 기준으로 [**SemVer 버전 번호를 자동 결정하고 CHANGELOG를 자동 생성**](https://neiroc.dev/posts/2024/10/semantic-versioning/)하는 표준이다.
  - 이 명세를 semantic-release 도구와 결합하면 CI/CD 파이프라인에서 릴리스 자동화가 완성된다.

##### 3.6.2. 실천 과제 (Outline)

###### 3.6.2.A. [STEP 1. Rollup 빌드 파이프라인 초기 설정](https://dev.to/morewings/how-to-build-a-tree-shakable-library-with-vite-and-rollup-16cb)

1) `rollup`과 관련 플러그인을 devDependency로 설치한다: `rollup`, `@rollup/plugin-node-resolve`, `@rollup/plugin-commonjs`
2) `rollup.config.js`에 ESM(`./dist/index.mjs`)와 CJS(`./dist/index.cjs`) 두 개의 output 포맷을 선언한다.
3) `preserveModules: true`를 output 설정에 포함하여 모듈 구조를 유지하고 tree-shaking 효율을 극대화한다.
4) React, Vue 등 피어 의존성(peer dependency)은 `rollupOptions.external`로 명시하여 [번들에 포함되지 않도록 한다.](https://github.com/vitejs/vite/discussions/18744)

###### 3.6.2.B. STEP 2. `package.json` `exports` 필드 구성: Dual Package Hazard 방어 포함

1) `exports` 필드를 사용하여 진입점을 명확히 선언한다.
   - `"import"` 조건: `./dist/index.mjs` (ESM)
   - `"require"` 조건: `./dist/index.cjs` (CJS)
   - `"types"` 조건: `./dist/index.d.ts`
2) [**Node.js Modules:**](https://nodejs.org/download/release/v15.2.0/docs/api/packages.html) CJS 버전에서 `instanceof`비교가 필요한 클래스들이, 양쪽에서 동일한 인스턴스를 참조하는지 검증하는 통합 테스트를 작성한다.
3) 레거시 도구 호환을 위해 `"main"` 필드에는 CJS 경로를 fallback으로 유지한다. _뭔 소린지 모르겠다._

###### 3.6.2.C. STEP 3. JSDoc 기반 `.d.ts` 자동 생성 파이프라인 구성

1) [`tsconfig.build.json`을 별도 생성하여 빌드 전용 TypeScript 설정을 분리한다.:](https://humanwhocodes.com/snippets/2020/10/create-typescript-declarations-from-javascript-jsdoc/)
   - `allowJs: true`, `declaration: true`, `emiDeclarationOnly: true`, `declarationMap: true`, `outDir: "dist"` 설정
2) `package.json` scripts에 `"types": "tsc -p tsconfig.build.json"` 명령을 추가하고, 번들 빌드 후 자동으로 실행되도록 연결한다.
3) [생성된 `.d.ts` 파일이 `package.json`의 `exports["."]["types"]` 필드에 정확히 매핑되는지 확인한다.](https://www.typescriptlang.org/ko/docs/handbook/declaration-files/publishing.html)

###### 3.6.2.D. STEP 4. 핵심 공개 API에 JSDoc 타입 주석 장비

1) 완전한 JSDoc `@param`, `@returns`, `@typeof` 주석을 작성한다.
2) 생성된 `.d.ts`를 IDE에서 직접 테스트하여 자동완성이 올바르게 동작하는지 검증한다.
3) `declarationMap: true`로 "Go to Definition"이 원번 소스로 이동하는지 확인한다.

###### 3.6.2.E. STEP 5. Conventional Commits 규칙 강제: commitlint 도입

1) `commitlint` + `@commitlint/config-conventional`을 설치하고 Git hooks(husky)와 연결하여 **[비규격 커밋 메시지](https://mokkapps.de/blog/how-to-automatically-generate-a-helpful-changelog-from-your-git-commit-messages)를 커밋 단계에서 차단한다.**
2) 사용할 커밋 타입을 팀 내 공통 규칙으로 문서화한다.
3) [`BREAKING CHANGE:` 표기 규칙을 README에도 명시](https://blog.opensight.ch/git-semantic-versioning-und-conventional-commits/)하여 메이저 버전 발행 시 의도치 않은 버전 오용을 방지한다.

###### 3.6.2.F. STEP 6. `semantic-release` 기반 자동 버전 및 CHANGELOG 관리

1) `semantic-release`, `@semantic-release/changelog`, `@semantic-release/git`, `@semantic-release/npm` 플러그인 설치
2) `.releasesrc` 파일을 구성하고, 기존 `cicd_pipeline_20260323.01.md`의 CI/CD 파이프라인에 릴리스 스테이지를 추가한다.
3) [커밋 타입에 따라 SemVer 버전이 자동 결정되고 `CHANGELOG.md`가 자동 생성·갱신되어 NPM에 배포되는 파이프라인을 구성한다.](https://neiroc.dev/posts/2024/10/semantic-versioning/)

###### 3.6.2.G. STEP 7. 번들 결과물 검증 및 NPM 배포 최종 점검

1) `npm pack --dry-run`으로 실제 배포될 파읾 목록을 확인, 불필요한 소스 파일(`src/`, `test/`)이 포함되지 않도록 `package.json`의 `files` 필드를 명시한다.
2) 현재 패키지([npmjs/@2davi/rest-state-domain-manager](https://www.npmjs.com/package/@2davi/rest-domain-state-manager))를 기준으로 배포 전 버전 충돌 여부, `exports` 필드 지원 여부, `types` 경로 유효성을 검증하는 CI 스텝을 추가한다.

---

#### 3.7. [안정성 보장] 트랜젝션 단위의 에러 핸들링 및 상태 롤백(Rollback) 메커니즘 도입

> 현재 `DomainPipeline`은 다수의 `DomainState`를 처리하다가 특정 요청 사항이 실패할 경우 **단순히 `.after()` 핸들러 호출만 건너뛰는 Skip 형식의 안일한 부분 실패 허용 메커니즘**을 띠고 있다.
> 개선 방향으로 **보상 트랜잭션(Compensating Transaction)** 개념 설계, **변경 이전 changeLog 원본 스냅샷 기반 `restore()` 인터페이스** 구현을 구상한다.

##### 3.7.1. 판단 근거

- **부분 실패 시 이미 반영된 A, B 상태가 데이터 불일치를 유발한다.**
  - A, B, C 세 자원을 병렬 업데이트하다 C가 실패했을 때 A·B의 상태가 전환된 채 남는 현 구조는 _분산 시스템 Architecture의 고전적이고 실증된 문제이다._
    - [Zenn - Introduction: The "Security" of the Monolith is Lost](https://zenn.dev/shayate811/articles/microservices-saga-poc?locale=en)
      "만약 보상 트랜잭션(else 블록)을 구현하지 않으면, DB에 status='PENDING'(주문 유효) 상태의 레코드가 남는다. 실제 비즈니스에서는 '재고는 예약됐는데 결제는 안 된' 데이터 불일치 현상을 발생시킬 수 있다."
    - AWS 공식 Saga 패턴 가이드도 동일하게 명시한다:
      "Saga 패턴은 보정 트랜잭션을 실행하여 이전 상태로 복원함으로써 역방향 복구를 수행한다."
  - `DomainPipeline`의 초기 아이디어는 공통 코드로 관리되는 DB의 값 (`select`, `input[type='radio'|'chechbox']`)의 UI를 만들어놓지 않고, 직접 Form에 domainObject 값을 바인딩시킬 수 없다는 데에서 출발하여.
     Skip 구조를 구현했다. A·B에서 `select`, `radio` UI를 가져와 Form을 구현해놓고, C에서 ProfileVO의 데이터를 구현된 Form에 바인딩시키는 흐름을 예시로 들면, C에서 문제가 발생해도 A, B는 그대로 유지되는 것이 옳다.
    - 하지만, REST API의 기본인 보상 트랜잭션 개념을 구현하지 않는 것은 이 라이브러리의 존재 가치를 위협한다. A, B, C가 각각 순차적으로 요청되어야 할 참조 관계의 DB Schema 구조를 따르고 있다면, 위에서 언급한 보상 트랜잭션이 절실히 필요하다.
  - 이 문제는 MicroService Architecture 차원에서 분산 트랜잭션 문제로 논의된다.
    - REST DSM의 맥락은 **프론트엔드 인메모리(in-memory) 상태**로도 비춰질 수 있는데, 그렇다고 _서버-서버 간의 Saga 패턴을 그대로 적용하는 것은_ 자칫 과잉 설계가 될 수 있다.

- **보상 트랜잭션(Compensating Transaction) 개념을 파이프라인 코어에 설계한다.**
  - [Microservice.io - Pattern: Saga](https://microservices.io/patterns/data/saga.html)
    "Lack of automatic rollback — a developer must design compensating transactions that explicitly undo changes made earlier in a saga rather than relying on the automatic rollback feature of ACID transactions."
  - **보상 트랜잭션은 개발자가 명시적으로 설계해야 한다.**
  - _서버 측 롤백 API 호출 또는 사용자 알림을 통한 수동 조정 인터페이스를 구현하여_ 라이브러리 소비자(개발자)가 이를 자신의 비즈니스 로직에 이용할 수 있도록 제공하는 방향을 고려한다.

| 시나리오                         | 보상 가능 여부          | 비고                                                |
| -------------------------------- | ----------------------- | --------------------------------------------------- |
| 프론트엔드 인메모리 상태 복원    | 비교적 단순             | Snapshot → restore 패턴으로 구현                    |
| 서버에 이미 커밋된 A·B 요청 복원 | 라이브러리 책임 범위 밖 | 서버 측 DELETE/PUT 재호출 필요, 상위 앱 레이어 책임 |
| 네트워크 부재 중 재시도          | 별도 retry 로직 필요    | exponential backoff 패턴 권장                       |

- **changeLog 원본 스냅샷을 활용한 `restore()` 인터페이스 구현**
  - 이미 업계 표준으로 확립된 패턴으로, [TanStack Query의 공식 Optimistic Update 패턴](https://tanstack.com/query/v4/docs/framework/react/guides/optimistic-updates)이 이 구조를 사용한다.
  - 이 패턴을 REST DSM의 `DomainState` 레이어에 적용하면:
    1) `save()` 호출 전: `_snapshot = structuredClone(this._data)` 저장
    2) 요청 실패 시: `this._data = this._snapshot` + `clearChangeLog()` 수행
    3) 파이프라인 수준: 실패한 파이프라인 전체의 모든 `DomainState` 인스턴스에 동일한 restore를 순차 적용
  - **멱등성(Idempotency) 설계 원칙:**
    - [OneUptime - How to Implement Optimistic Updates in React with React Query](https://oneuptime.com/blog/post/2026-01-15-react-optimistic-updates-react-query/view)
    - [Architecture Weekly - The Order of Things: Why You Can't Have Both Speed and Ordering in Distributed Systems](https://www.architecture-weekly.com/p/the-order-of-things-why-you-cant)
    - [glukhov - Saga Pattern in Distributed Transactions - With Examples in Go](https://www.glukhov.org/post/2025/11/saga-transactions-in-microservices/)
      "All operations and compensations must be idempotent. This ensures that retrying a failed operation doesn't cause duplicate effects."
    - REST DSM의 `restore()`가 동일한 `DomainState`에 대해 여러 번 호출되더라도 결과는 계속 동일해야 한다.
      - `_snapshot`이 없는 경우를 방어하는 조건 분기 필수.

```markdown
# Optimistic Update 패턴의 시나리오

1. onMutate: 요청 전 previousState 스냅샷 저장
2. 낙관적 업데이트(Optimistic Update) 적용
3. onError: 실패 시 previousState 스냅샷으로 복원(rollback)
4. onSettled: 성공·실패 무관 서버 최신 상태로 invalidate
```

- [**Architecture Insights+: 누락 혹은 과장된 사항 점검**](https://dev.to/randazraik/designing-distributed-systems-sagas-and-trade-offs-2o0p)
  - **1. 파이프라인 병렬(Parallel) vs 직렬(Serial) 실패 시나리오 분기**
    - 병렬 처리(`Promise.all()` 계열) 실패 시, 이미 성공한 요청이 둘 이상일 때, "어느 순서로 보상 트랜잭션을 수행할 것인가"
      "Isolation is gone — other requests may see half-done state until compensation finishes."
    - 직렬 처리 실패 시에는 이전 단계들을 [**역순(LIFO)으로 보상**하는 것이 표준이다.](https://pasksoftware.com/distributed-transaction-patterns/)
  - **2. 보상 자체가 실패하는 케이스(Compensation Failure) 처리**
    - 실무에서는 보상 자체도 실패할 수 있다.
      "Compensation itself might fail (e.g. refund gateway offline), you need retry or manual dashboards."
    - 프론트엔트의 인메모리 복원 `restore()`는 빌드 버전에서 실패하지 않는 것이 전제라면,
      서버 측 보상 API 호출을 포함하는 경우에는 반드시 [dead-letter 처리 설계](https://oneuptime.com/blog/post/2026-01-24-saga-pattern-transactions/view)가 필요하다.
  - **3. 사용자 알림(User Feedback) 설계 필요**
    - 롤백이 발생했을 때 **사용자에게 명확한 피드백**을 제공하는 것이 [안정성 설계의 필수 요소이다.](https://temporal.io/blog/error-handling-in-distributed-systems)
    - 라이브러리가 `restore()` 호출 후 이벤트(`dsm:rollback`)을 발생하여 소비자 앱이 UI 알림을 표시할 수 있도록 인터페이스를 제공해야 한다.

##### 3.7.2. 실천 과제 (Outline)

###### 3.7.2.A. STEP 1. `DomainState`에 스냅샷(Snapshot) 생성 시점 결정

1) `save()` 메서드가 호출되는 순간, 현재 `this._data`의 깊은 복사본을 `this._snapshot`에 저장한다.
2) 복사 방법은 `safeClone()` 유틸을 재사용한다: `structuredClone` 우선, 폴백 `_cloneDeep`
3) `_snapshot`은 `Symbol('snapshot')`을 KEY로 하여 외부 접근을 원천 차단한다: 상태 무결성 보호와 일관성 유지 측면

###### 3.7.2.B. STEP 2. `DomainState`에 `restore()` 인터페이스 구현

1) `restore()` 메서드를 다음 로직으로 구현한다:
   1. `this._snapshot === undefined` 조건 → restore 없이 경고 로그 후 반환 (멱등성 방어)
   2. `this._data = this._snapshot`: 원본 데이터 복원
   3. `clearChangeLog()` 호출: changeLog 비우기
   4. `this._snapshot = undefined`: 스냅샷 초기화
   5. `BroadcastChannel` 또는 커스텀 이벤트로 `dsm:rollback` 이벤트 발행 → 소비자 앱이 UI 알림을 표시할 수 있도록 한다.
2) `restor()`는 어떤 상황에서 몇 번 호출되어도 동일한 결과를 내야 한다: 멱등성(Idempotency) 보장

###### 3.7.2.C. STEP 3. `DomainPipeline`에 실패 감지 & 역순 보상 처리 로직 구현

1) 직렬(Sequential) 파이프라인: 각 단계의 `DomainState.save()`를 순차 실행하되, 실패 시 **이미 성공한 DomainState** 인스턴스들을 역순(LIFO)으로 `restore()`
2) 병렬(Parallel) 파이프라인: 전체 완료 후 rejected된 항목이 하나라도 있으면 전체 성공 항목 모두에 `restore()`를 적용한다.
3) `Promise.all()` 대신 `Promise.allSetteled()`를 사용하여 하나의 실패가 다른 성공 요청을 cancle하지 않도록 한다: _성공/실패 결과를 모두 수집한 뒤 판단_
4) 직렬 파이프라인과 병렬 파이프라인끼리 연결할 수 있도록 하며, 파이프라인을 생성할 때 보상 트랜잭션의 강도를 설정할 수 있는 플래그를 상수로 구현한다.
   e.g., 제1 파이프라인 - 병렬: `select`, `input[type='radio'|'chechbox']`등 UI를 만들기 위한 REST API 호출 및 각 `DomainState` 생성 -> 플러그인으로 Form 요소 생성 (어느 `DomainState`의 실행이 실패해도 보상 트랜잭션 적용 X)
         제2 파이프라인 - 직렬: (주문자정보-주문이력리스트정보) 부모-자식 테이블의 DTO를 가져오기 위한 REST API 순차 호출 (주문이력리스트정보 조회 요청 처리 중 에러 발생 시 - 주문자정보 `DomainState` 제거: 보상 트랜잭션 강하게 적용 O)
   e.g., 파이프라인 - 직렬||병렬: (회원정보-회원자격증정보) 회원가입 폼에서 두 DomainState를 각각 POST/PUT할 때, 한 화면에서 "회원 정보만 DB 갱신되는" 문제를 막고 싶으면 `restore()`의 보상 트랜잭션 적용 O, 상관 없으면 병렬로 연결해서 보상 트랜잭션 적용 X, 뭐든 개발자 마음대로 가능

###### 3.7.2.D. STEP 4. 파이프라인 실패 정책(Failure Policy) 옵션 노출

1) 라이브러리 소비자가 실패 처리 정책을 선택할 수 있도록 `DomainPipeline` 초기화 옵션에 `failurePolicy`를 노출한다.
   1. `rollback-all`: 하나라도 실패 시 전체 `restore()` 수행
   2. `fail-fast`: 첫 번째 실패 시 즉시 abort, 나머지 요청 취소 후 rollback
   3. 'ignore': 기존 동작 유지(단순 skip), 하위 호환성 보장
2) 이 옵션을 통해 라이브러리가 모든 use-case를 강제하지 않고 소비자에게 제어권을 위임한다.

###### 3.7.2.E. STEP 5. 서버 사이드 보상 인터페이스 설계: 소비자 책임 명확화

1) 라이브러리 수준의 `restore()`는 **프론트엔드 인메모리 상태만 복원**한다는 사실을 README에서 명시한다.
2) 서버에 이미 커밋된 상태를 되돌리는 것은 소비자 책임임을 명확히 하고, 파이프라인이 `dsm:rollback` 이벤트를 발행할 때 **어느 DomainState가 성공했고 어느 것이 실패했는지 결과 맵(Map)**을 페이로드로 함께 제공한다.
3) 재시도 중에는 스냅샷을 유지하여 롤백 기준점이 사라지지 않도록 한다.
4) 소비자는 이 이벤트를 구독하여 서버 롤백 API 호출 또는 사용자 에러 모달 표시를 직접 구현한다.
5) 단순 Monolith Spring Framework 프로젝트에서는 어떻게 구현할지, 구현 방식이 달라져야 하는지 검토한다.

###### 3.7.2.F. STEP 6. 재시도(Retry) 정책 연동 설계

1) _일시적 네트워크 오류와 비즈니스 로직 오류를 구분하여,_전자에 한해 Exponential Backoff 재시도를 수행하고, 재시도 횟수 초과 시에만 `restore()`를 발동한다.
2) 재시도 중에는 스냅샷을 유지하여 롤백 기준점이 사라지지 않도록 한다.
3) `DomainPipeline` 옵션에 `retry: { maxAttempts: 3, backoff: 'exponential' }` 형태로 노출한다.

###### 3.7.2.G. STEP 7. Vitest 시나리오 기반 통합 테스트 작성

1) **정상 경로:** A·B·C 모두 성공 → 세 인스턴스 모두 snapshot이 `undefined`인지 확인
2) **직렬 실패:** A 성공 → B 실패 → A에 `restore()` 호출 확인, B 스냅샷 복원 확인, `dsm:rollback` 이벤트 발행 확인
3) **병렬 실패:** A·B 성공, C 실패 → A·B 모두 `restore()` 확인
4) **멱등성 검증:** `restore()`를 동일 인스턴스에 2회 연속 호출해도 에러 없이 동일 결과 반환 확인
5) **스냅샷 없는 restore() 검증:** 스냅샷 미생성 상태에서 `restore()` 호출 시 안전한 no-op(경고 로그만 출력) 동작 확인

---

### 4. v1.0.0 달성 이후의 확장 아키텍처 전망

> v1.0.0이 달성하는 7대 목표는 이 라이브러리의 기반을 다지는 작업이다.
> > _보안, 구조, 성능, 번들링 — 이 네 축이 제대로 서야 그 위에 무언가를 쌓을 수 있다._
> > _그리고 v1.0.0 위에 쌓아야 할 것은 명확하다. 배열 상태 관리와 UI 레이어의 선택적 위임이다._

---

#### 4.1. 1:N 배열 상태의 부재 — 라이브러리의 미완성 영역

> `DomainState`는 단일 DTO 객체를 다루는 데에는 충분히 강력하나,
> SI/SM 환경에서 가장 흔한 화면 패턴인 **1:N 부모-자식 관계의 그리드 UI**를 다루는 순간 무용지물이 된다.

- SI 환경에서 1:N 화면을 구현할 때마다 `fnAddRow()`, `fnRemoveRow()`, `fnReindexRows()`, `fnSelectAll()`이 JSP마다 복붙된다.
  - `fnReindexRows()` 한 함수가 50줄에 이르며, 컬럼 하나가 바뀌면 `attr('name', ...)` 코드 전체를 손으로 다시 쓴다.
  - 이 보일러플레이트를 라이브러리가 흡수하지 못하는 한, DSM의 존재 이유는 단순 `fetch` 래퍼에 머문다.
- 배열 상태 관리가 필요한 시나리오는 두 가지 구조로 분리된다.
  - **Nested Array:** `PUT /api/users/{id}` 한 번으로 `{ userId, certificateList: [...] }` 전체를 전송. 부모 `DomainState`의 필드가 배열이다.
  - **Root Array:** `POST /api/certificates`로 배열 자체가 전송 본문. 배열이 독립적인 REST 리소스다.
  - 이 두 시나리오는 REST API 계층에서 완전히 다른 구조이며, 하나의 클래스로 억지로 통합하면 내부 복잡도가 폭발한다.
- 이를 해결하기 위한 신규 클래스 **`DomainCollection`**을 `src/domain/` 레이어에 추가한다.
  - `DomainCollection`은 `DomainState`를 원소로 가지는 상태 관리 컨테이너다.
  - Java 유추: `DomainState ≈ Map<K,V>`, `DomainCollection ≈ List<DomainState>`

##### 4.1.1. Source of Truth와 Reactive 채택 근거

> 배열 상태 관리에서 "누가 Source of Truth인가"를 결정하지 않으면 설계 전체가 흔들린다.
> > _DOM이 Source of Truth가 되는 순간, changeLog 기반 HTTP 메서드 자동 분기라는 이 라이브러리의 핵심 정체성이 반쪽짜리로 전락한다._

- 세 가지 선택지를 검토했다.
  - **Option A (Reactive):** 모든 `input` 변경이 실시간으로 DomainState Proxy를 업데이트한다. changeLog가 항상 정확하다.
  - **Option B (DOM이 Source of Truth):** `save()` 직전 DOM에서 읽어 DomainState를 재구성한다. 기존 `fnReindexRows()` 후 `serialize()` 패턴과 동일.
  - **Option C (Hybrid):** 구조 변경(행 추가/삭제)은 즉시, 필드 값은 `save()` 직전 flush.
- **Option A (Reactive)를 채택한다.**
  - Option B와 C는 changeLog가 `save()` 시점까지 비어있어 PATCH payload가 정확히 생성되지 않는다.
  - 실제 SI 화면에서 500개 행이 동시에 새로 입력되는 케이스는 DSM 책임 범위 밖이다. 수정 폼은 대부분 "기존 데이터 위에 행 하나 추가"가 99%다.
  - `debug: false` 상태에서 BroadcastChannel과 Microtask Batching 비용이 사라지며, changeLog 기록 자체는 단순 배열 `push` 연산이다.
- 권장 최대 행 수 및 guard 수치는 실측 테스트 후 결정한다.

##### 4.1.2. trackingMode 도입 근거

> Reactive 채택으로 changeLog가 항상 정확해지는 대신, 운용 환경에서의 성능 부담을 명시적으로 소비자가 선택할 수 있어야 한다.
> > _개발 환경과 운용 환경의 기본값을 라이브러리가 결정하는 것은 비즈니스 차원의 결정이다. 라이브러리는 선택지를 제공하고, 결정은 소비자에게 위임한다._

- 두 가지 추적 모드를 `trackingMode` 플래그로 선택한다.
  - **`'realtime'`:** 현재 구현 그대로. Proxy `set` 트랩 발화마다 changeLog에 즉시 기록. 개발 단계에서 데이터 흐름을 눈으로 확인하는 데 유리하다.
  - **`'lazy'`:** `save()` 호출 시점에 인스턴스 생성 시 저장한 `_initialSnapshot`과 현재 상태를 deep diff하여 changeLog를 그 자리에서 생성한다. 평상시 changeLog는 비어있다.
    - `'realtime'`이 "언제 기록하는가" 축에서 이름을 가지듯, `'lazy'`도 동일한 축에서 대칭을 이룬다. "changeLog 기록을 `save()` 시점까지 미룬다"는 Lazy Evaluation(지연 평가) 개념이다.
    - 사용자가 `name`을 `'A' → 'B' → 'C'`로 바꾸면 `'realtime'`은 changeLog에 2개 항목을 쌓지만 `'lazy'`는 최종 결과인 `A → C` 하나만 기록한다. 네트워크 페이로드가 더 작고 서버 측 JSON Patch 파싱 비용도 줄어든다.
- `trackingMode`는 각 DomainState 인스턴스 생성 시 명시적 플래그로 선택한다. 라이브러리 전역 기본값으로 설정하지 않는다.
  - 개발 환경에서도 운용 환경과 동일한 성능 체감을 원해서 `'lazy'`를 쓰고 싶은 개발자가 있을 수 있다. 그 결정은 개발자가 한다.

---

#### 4.2. DomainCollection의 설계 원칙

> Root Array 시나리오에서 배열 자체가 독립적인 REST 리소스일 때, 각 항목은 서로 독립적인 changeLog를 가지는 DomainState여야 한다.
> > _DomainCollection은 DomainState들을 담는 컨테이너다. 그 이상도, 그 이하도 아니다._

- **Nested Array 선언 방식 — 런타임 연결 채택:**
  - `DomainVO.static fields`에 `type: DomainCollection`을 선언하면 `DomainVO`가 `DomainCollection`을 `import`해야 한다. adr-0002에서 충분히 경험한 순환 참조 문제가 재발한다. 즉각 반려.
  - `DomainVO`는 `static fields`에 배열 기본값(`default: []`)만 선언한다. `bindCollection()` 호출 시점에 라이브러리가 런타임에 해당 필드와 DomainCollection을 연결한다.
  - 이 패턴은 `DomainVO`와 `DomainState`의 관계와 동일하다. `DomainVO`는 `DomainState` 없이도 선언 가능하고, `fromVO()` 호출 시점에 연결이 일어나는 것처럼.
- **`saveAll()` 전략:**
  - SI 레거시 환경에서 1:N 배열 저장 시 백엔드는 대부분 리스트 전체를 한 번에 덮어쓰는 방식(DELETE ALL + INSERT, 또는 MERGE)으로 처리한다.
  - `sequential`이나 `parallel`로 쪼개어 개별 API를 쏘는 것은 MSA 환경에서나 유효하며, SI 레거시에서는 오히려 트랜잭션이 꼬이기 쉽다.
  - **`batch` (배열 전체를 단일 통신)를 MVP로 단독 구현한다.** `sequential`/`parallel`은 3.7의 DomainPipeline 보상 트랜잭션 완성 이후 연계한다.

---

#### 4.3. UIComposer — 데이터 레이어와 UI 레이어를 잇는 선택적 위임

> 현재 `FormBinder`와 `DomainRenderer`는 각자 기능하고 있으나, 방향이 정반대인 두 플러그인을 하나의 추상 레이어 없이 방치하는 것은 향후 확장을 스스로 막는 구조다.
> > _FormBinder는 "DOM이 먼저 있고 State가 읽는다." DomainRenderer는 "State가 먼저 있고 DOM이 따라간다." 이 두 방향을 통합하려면 공통 추상 레이어가 필요하다._

- 통합 플러그인 **`UIComposer`**를 `src/ui/` 레이어에 신설한다.
  - **렌더링(DomainRenderer 흡수):** State → DOM 생성
  - **바인딩(FormBinder 흡수):** 기존 DOM ↔ State 연결
  - **컬렉션 조작(신규):** State 기반 동적 DOM 관리
- 이 플러그인은 `Domain*` 접두사를 가져선 안 된다.
  - `Domain*` 시리즈(`DomainState`, `DomainVO`, `DomainCollection`, `DomainPipeline`)는 전부 **데이터 세계**의 구성원이다.
  - UI 규칙은 Domain 단위가 아닌 **화면 단위**로 결정된다. `CertificateVO` 하나로 목록 화면은 읽기 전용 `<span>`, 등록 폼은 편집 가능한 `<input>` 그리드, 모달은 체크박스 선택 테이블을 각각 만들 수 있다.
  - `UIComposer`는 데이터 세계와 UI 세계를 잇는 다리이며, 다리는 어느 한쪽 세계에 속하지 않는다.

##### 4.3.1. UILayout — HTML Template-Driven Binding

> UILayout의 역할은 구조 생성이 아니라 데이터 매핑이다.
> > _라이브러리가 `document.createElement`로 DOM을 빚어내는 방식은 "개발자 대신 라이브러리가 백틱으로 HTML을 짠다"는 것과 본질적으로 다르지 않다._

- UILayout이 JS 객체로 태그 이름을 하드코딩(`static item = { tag: 'tr', cellTag: 'td' }`)하고 라이브러리가 DOM을 생성하는 방식을 검토했으나 전면 반려했다.
  - SI 환경 화면은 `<td>` 안에 `<div>` 3개, 그 안에 `<span>`이 껴있는 구조가 일상적이다. 이를 JS 속성으로 표현하려 들면 `childTag`, `wrapperTag` 등 속성이 끝없이 늘어나 감당 불가 수준에 도달한다.
  - DOM 구조에 대한 통제권은 전적으로 HTML 작성자(개발자)에게 있어야 한다.
- **채택 방식 — HTML `<template>` 요소 기반:**
  - 개발자는 HTML 파일에 `<template id="certRowTemplate">` 태그로 행(row) 하나의 완전한 DOM 구조를 직접 선언한다.
  - `UILayout`은 `static templateSelector`로 해당 템플릿을 지정하고, `static columns`의 `selector`로 각 필드와 DOM 요소를 매핑하기만 한다.
  - CSS 클래스, 중첩 `<div>`, Bootstrap 구조, Tailwind CSS — 라이브러리가 전혀 관여하지 않는다.
  - [HTML Living Standard — `<template>` element](https://html.spec.whatwg.org/multipage/scripting.html#the-template-element): 파싱은 되지만 렌더링은 되지 않으며, `document.importNode(template.content, true)` 호출 전까지 완전히 비활성 상태다.
- **`sourceKey` 패턴 — 정적 선언과 런타임 주입 분리:**
  - `UILayout`은 코드 작성 시점에 선언된다. 공통코드 `DomainCollection`은 `DomainPipeline.run()` 이후 런타임에야 존재한다. 정적 선언이 런타임 데이터를 직접 참조할 수 없다.
  - UILayout의 `columns`에서는 `sourceKey: 'certTypes'` 문자열 키로만 선언하고, 실제 `DomainCollection`은 `bind()` 호출 시 `sources: { certTypes: result.certTypes }` 옵션으로 주입받는다.
  - [Angular의 DI 토큰 패턴](https://angular.dev/guide/di/di-in-action)과 개념적으로 동일하다.

##### 4.3.2. CollectionBinder 기능 목록

> SI/SM 환경에서 그리드 UI가 반드시 갖춰야 할 기능들이 있다.
> > _AG Grid, Handsontable, DevExtreme DataGrid 등 엔터프라이즈 그리드 라이브러리의 공통 기능과 SI 실무 패턴을 합쳐 목록화한다._

- **[기본 행 조작] — MVP:**
  - `addEmpty`: 빈 행 추가 (DomainCollection에 새 DomainState 추가 + `<template>` 복제 후 DOM 삽입)
  - `removeChecked`: 선택된 행 삭제 — **역순(LIFO) splice 처리 필수.** 정방향 splice는 인덱스가 밀려 잘못된 항목을 삭제한다.
  - `removeAll`: 전체 행 삭제
  - `selectAll`: 전체 행 선택/해제
  - `invertSelection`: 선택 반전
  - `selectOne`: 개별 행 선택 — **동적 DOM이므로 이벤트 위임으로 내부 자동 처리.** 소비자가 직접 바인딩하는 것은 허용하지 않는다.
- **[UI 보조] — MVP:** 행 번호 자동 갱신, 전체선택 체크박스 상태 동기화 (내부 자동 처리)
- **[유효성 검사] — MVP:** `validate` (save() 전 전체 행 일괄 검증), 행 단위 invalid-feedback 자동 처리
- **[행 순서 조작] — Extends (patch 버전):** `moveUp`, `moveDown`, 드래그 앤 드롭 정렬
- **[데이터 조작] — Extends (patch 버전):** `duplicateChecked` (선택 행 복사), 선택 행 특정 필드 일괄 변경
- **소비자 API 원칙:** `bindCollection()`이 컨트롤 함수 객체를 반환하고, 소비자는 destructuring aliasing으로 원하는 함수명에 할당하여 원하는 UI에 연결한다. 라이브러리가 버튼이나 체크박스의 존재를 강제하지 않는다.

---

#### 4.4. 소스 레이어 구조 개편 및 deprecated 정책

> `plugins/`에 편의 플러그인과 아키텍처 선택을 동일한 레이어에 두는 것은 무게감의 혼동이다.
> > _`FormBinder`와 `DomainRenderer`는 DSM 없이는 동작하지 않는 편의 유틸이다. `UIComposer`는 애플리케이션에 view 레이어 자체를 선택적으로 위임하는 아키텍처 결정이다._

- `src/ui/` 레이어를 신설하여 `UIComposer`, `UILayout`, binder, renderer, collection 하위 모듈을 배치한다.
  - `view`와 `page`는 Vue의 `src/views/`, Next.js의 `src/pages/`와 이름이 겹쳐 IDE 검색, 번들 분석, 오류 메시지에서 혼란을 유발한다. `ui/`를 채택한다.
- `UILayout`은 `src/ui/UILayout.js`에 위치하지만 `index.js` 최상위에서 export한다. `DomainVO`와 동일한 패턴이다. `UIComposer`를 설치하지 않은 상태에서도 `UILayout` 선언이 가능해야 한다.
- `FormBinder`와 `DomainRenderer`는 **v2.0.0에서 공식 deprecated 처리하고 migration guide를 제공한다.** 즉각 제거하지 않는다.
  - 제거 시점에 대한 정책(grace period, major version 범위)은 v2.0.0 릴리즈 이후 별도 논의한다.
- `plugins/` 레이어는 삭제하지 않는다. 향후 Vue, React, Angular 등 특정 프론트엔드 프레임워크와의 연동 어댑터를 배치하는 공간으로 역할을 재정의한다.

---

### 5. v1.0.0 이후 확장 아키텍처 달성을 위한 구현 지침

> v1.0.0의 7대 목표가 모두 달성된 시점에서, v1.x.x와 v2.0.0을 향해 나아갈 구현 순서를 선언한다.
> > _DomainCollection과 UIComposer는 서로 독립적으로 설계되어야 한다. DomainCollection은 UI 없이도 완전하게 동작해야 하며, UIComposer는 DomainState든 DomainCollection이든 동일한 인터페이스로 다룰 수 있어야 한다._

---

#### 5.1. [상태 레이어] DomainCollection 클래스 구현

##### 5.1.1. 판단 근거

- **`DomainCollection`은 UI와 완전히 독립된 순수 상태 레이어여야 한다.**
  - UIComposer 없이도 `DomainCollection.saveAll({ strategy: 'batch' })`로 배열 전체를 전송할 수 있어야 한다.
  - `DomainCollection`이 UI 레이어를 알게 되는 순간, 상태 레이어와 UI 레이어의 결합이 발생하여 테스트 격리가 불가능해진다.
- **`lazy` 모드에서 배열 전체 Diff의 정확성은 `itemKey`에 달려있다.**
  - 순수 위치(positional) 기반 Diff는 "행 삭제 후 신규 추가" 케이스에서 잘못된 patch를 생성한다.
    - 초기 배열 `[{id:1},{id:2}]`에서 `{id:1}`을 삭제하고 `{id:3}`을 추가하면, 위치 기준 diff는 두 개의 `replace`로 오독한다.
    - 실제 의도는 `remove {id:1}` + `add {id:3}`이다.
  - `UILayout.static itemKey`로 지정된 필드를 기준으로 LCS(Longest Common Subsequence) 기반 diff를 수행한다.
  - `itemKey`가 없는 경우: 초기값인 항목(id: null 또는 id: '')은 무조건 `add`, 초기 배열에만 있고 현재 배열에 없는 항목은 `remove`로 처리하는 방어 로직을 적용한다.
  - [LCS 알고리즘 참조 — cs.columbia.edu](https://www.cs.columbia.edu/~allen/S14/NOTES/lcs.pdf)

##### 5.1.2. 실천 과제 (Outline)

###### 5.1.2.A. STEP 1. `DomainCollection` 클래스 구현 (`src/domain/DomainCollection.js`)

1) `DomainCollection.create(api, options)` 팩토리 메서드 구현: 빈 컬렉션 생성. `itemVO`, `urlConfig`, `debug`, `trackingMode` 옵션 수용.
2) `DomainCollection.fromJSONArray(jsonText, api, options)` 팩토리 메서드 구현: GET 응답 배열로부터 각 항목을 `DomainState`로 생성하여 컬렉션 초기화.
3) 핵심 메서드 구현: `add(initialData?)`, `remove(indexOrState)`, `getItems()`, `getCheckedItems()`, `getCount()`, `toJSON()`.
4) `_initialSnapshot` 저장: `fromJSONArray()` 시점에 `structuredClone()`으로 초기 배열 상태를 보존한다.

###### 5.1.2.B. STEP 2. `trackingMode: 'realtime' | 'lazy'` 구현

1) `DomainState.fromJSON()` / `fromVO()`의 `options`에 `trackingMode` 플래그를 추가한다.
2) `'realtime'` (기존 동작): Proxy `set` 트랩 발화 시 changeLog에 즉시 기록. 변경 없음.
3) `'lazy'` 신규 구현:
   - Proxy `set` 트랩에서 changeLog 기록 로직을 건너뛴다. `_initialSnapshot` 비교용 저장만 수행.
   - `save()` / `saveAll()` 진입 직전: `_initialSnapshot`과 `getTarget()`을 deep diff하여 changeLog를 그 자리에서 생성.
   - `DomainCollection`의 `lazy` 모드: 행 추가/삭제 시 메모리 배열(`getTarget()`)만 변경. `saveAll()` 시점에 전체 배열 diff 수행.
4) `itemKey` 기반 LCS diff 유틸 함수를 `src/common/` 레이어에 구현한다.

###### 5.1.2.C. STEP 3. `DomainCollection.saveAll()` — `batch` 전략 구현

1) `toJSON()`으로 현재 배열 전체를 직렬화하여 단일 POST로 전송하는 `batch` 전략을 구현한다.
2) `lazy` 모드라면 `saveAll()` 진입 시 STEP 2의 diff를 먼저 실행하여 changeLog를 확정한 뒤 직렬화한다.
3) `sequential` / `parallel` 전략은 3.7 DomainPipeline 보상 트랜잭션 완성 이후로 미룬다.

###### 5.1.2.D. STEP 4. `index.js` Composition Root에 `DomainCollection` export 추가

1) `src/domain/DomainCollection.js`를 `index.js`에서 import하고 named export에 추가한다.
2) `DomainCollection`이 `DomainPipeline`과 상호작용하는 경우(파이프라인 결과물을 컬렉션에 hydrate)에 대한 순환 참조 가능성을 사전 점검한다.

###### 5.1.2.E. STEP 5. Vitest 단위 테스트 작성

1) **create/fromJSONArray:** 빈 컬렉션 생성, 배열로부터 DomainState 목록 생성 확인.
2) **add/remove:** add() 후 `getItems().length` 증가, remove() 후 감소, 역순 splice 정확성 확인.
3) **`lazy` diff 정확성:** 초기 배열에서 항목 삭제 + 신규 추가 후 `saveAll()` 호출 시 `add`/`remove` patch가 정확히 생성되는지 확인.
4) **`itemKey` 기반 LCS:** `itemKey` 선언 시 위치 이동이 아닌 동일성 기반으로 diff가 수행되는지 확인.
5) **`batch` saveAll():** `toJSON()` 직렬화 결과가 단일 POST body로 전달되는지 확인.

---

#### 5.2. [UI 레이어] `src/ui/` 레이어 신설 및 `UILayout` 클래스 구현

##### 5.2.1. 판단 근거

- **`UILayout`은 UI 계약 선언 클래스다. `DomainVO`가 데이터 계약을 선언하듯.**
  - `DomainVO`가 DB Schema를 본 따 데이터 구조를 선언하듯, `UILayout`은 화면 목적에 맞는 UI 표현 방식을 선언한다.
  - 동일한 `DomainVO`로 등록 폼, 목록 화면, 상세 팝업 — 각각 다른 `UILayout`을 선언할 수 있다.
- **HTML `<template>` 기반이어야 DOM 구조에 대한 통제권이 개발자에게 완전히 귀속된다.**
  - JS 객체로 태그를 선언하고 `document.createElement`로 DOM을 빚는 방식은 중첩 셀, 래퍼 div, 커스텀 클래스를 표현하기 위한 속성이 끝없이 늘어나는 구조적 함정에 빠진다.
  - `<template>` 요소는 HTML Living Standard에 정의된 클론용 비활성 DOM 트리다. 화면 개발자가 원하는 어떤 구조든 자유롭게 작성하고, 라이브러리는 `selector`로 지정된 요소에 데이터를 꽂을 뿐이다.

##### 5.2.2. 실천 과제 (Outline)

###### 5.2.2.A. STEP 1. `src/ui/` 디렉토리 구조 생성

1) 아래 구조로 `src/ui/` 레이어를 신설한다:
2) `UILayout`을 `index.js` 최상위에서 named export에 추가한다. `UIComposer` 없이도 `UILayout` 선언이 가능해야 한다.

```text
   src/ui/
   ├── UIComposer.js     ← 통합 플러그인 엔트리
   ├── UILayout.js       ← UI 계약 base class
   ├── binder/           ← FormBinder 흡수
   ├── renderer/         ← DomainRenderer 흡수
   └── collection/       ← CollectionBinder 신규
```

###### 5.2.2.B. STEP 2. `UILayout` base class 구현 (`src/ui/UILayout.js`)

1) `static templateSelector`: `<template>` 요소의 CSS 선택자.
2) `static itemKey`: `lazy` 모드 diff 시 항목 동일성 기준 필드명. 선언 권장, 미선언 시 방어 로직 적용.
3) `static columns`: 필드명 → `{ selector, sourceKey?, required?, readOnly? }` 매핑 선언.
4) `UIComposer`가 설치되지 않은 상태에서 `bind()` 또는 `bindCollection()`이 호출되면 즉시 `Error`를 throw한다. 에러 메시지에 "UIComposer 플러그인을 먼저 설치하세요"를 명시한다.

###### 5.2.2.C. STEP 3. `mode: 'read' | 'edit'` 지원 설계

1) `mode: 'edit'` (기본): `<template>`을 복제하여 `[selector]` 요소에 State 값을 채운다.
2) `mode: 'read'`: `[selector]` 요소가 input 계열이면 `disabled` 처리 또는 `textContent`만 설정한다. form 요소를 생성하지 않는다.
3) `readonlyTemplateSelector`를 별도 선언할지, 동일 템플릿 내 `input → textContent` 치환만으로 처리할지는 구현 착수 전 별도 논의한다.

###### 5.2.2.D. STEP 4. Vitest 단위 테스트 작성

1) `UIComposer` 미설치 상태에서 `bind()` 호출 시 `Error` throw 확인.
2) `static templateSelector`가 없는 경우 명확한 에러 메시지 throw 확인.
3) `static itemKey` 선언 여부에 따른 diff 분기 동작 확인.

---

#### 5.3. [UI 레이어] `UIComposer` 통합 플러그인 구현

##### 5.3.1. 판단 근거

- **`CollectionBinder`를 독립 플러그인으로 외부에 노출하면 v2.0.0에서 `UIComposer`로 흡수할 때 소비자가 migration 비용을 두 번 치른다.**
  - v1.x.x 단계에서 `CollectionBinder` 로직을 `UIComposer`의 내부 모듈로 처음부터 설계하고, 외부에는 `UIComposer` 이름으로만 노출한다.
- **`bindCollection()`이 컨트롤 함수 객체를 반환해야 한다.**
  - 개발자는 반환받은 함수를 원하는 이름으로 destructuring하여 원하는 버튼, 체크박스에 직접 연결한다.
  - 라이브러리는 어떤 버튼이나 체크박스가 존재하는지 알지 못하며, 알아서도 안 된다. 이벤트 바인딩의 주도권은 개발자에게 있다.
  - 단, 동적으로 생성되는 행 내부의 개별 체크박스(`selectOne`)는 이벤트 위임으로 내부에서 자동 처리한다. 소비자가 직접 바인딩하는 것은 허용하지 않는다.
- **`sourceKey` 연결은 `bind()` / `bindCollection()` 호출 시 `sources` 옵션으로 주입한다.**
  - `UILayout` 선언은 정적(코드 작성 시점), `DomainCollection`은 동적(런타임). 정적 선언이 런타임 데이터를 직접 참조할 수 없으므로 주입 분리가 필수다.

##### 5.3.2. 실천 과제 (Outline)

###### 5.3.2.A. STEP 1. `UIComposer` 플러그인 엔트리 구현 (`src/ui/UIComposer.js`)

1) `DomainState.use(UIComposer)` 호출 시 `plugin.install(DomainState)`가 실행되어 다음 메서드를 주입한다:
   - `DomainState.prototype.bind(containerSelector, options)`: FormBinder 역할 흡수. `UILayout`, `sources`, `mode` 옵션 수용.
   - `DomainState.prototype.bindCollection(fieldName, containerSelector, options)`: Nested Array용.
   - `DomainCollection.prototype.bind(containerSelector, options)`: Root Array용. 동일 인터페이스.
2) `DomainRenderer.prototype.renderTo()` 역할은 `sources` 주입 + `type: 'select'` 분기 처리로 `bind()` / `bindCollection()` 내부에 흡수한다.

###### 5.3.2.B. STEP 2. `collection/` 내부 모듈 구현 — CollectionBinder MVP

1) **`addEmpty()`:** `DomainCollection.add()` 호출 → `<template>` 복제 → DOM에 삽입 → 행 번호 갱신 → 전체선택 체크박스 상태 동기화.
2) **`removeChecked()`:** `.dsm-checkbox:checked` 행의 인덱스 수집 → **역순(내림차순) 정렬** → `DomainCollection.remove()` 순차 실행 → DOM 제거 → 재정렬.
   - 역순 정렬 없이 정방향으로 remove하면 앞 인덱스 제거 시 뒤 인덱스가 밀려 잘못된 항목이 삭제된다. 이는 기존 `fnRemoveRow()` 코드에는 없던 버그 소지다.
3) **`removeAll()`:** 전체 항목 일괄 제거.
4) **`selectAll(checked)`:** 전체 `.dsm-checkbox` 상태를 `checked`로 설정.
5) **`invertSelection()`:** 현재 체크 상태 반전.
6) **`validate()`:** `UILayout.columns`의 `required` 필드를 순회하여 값이 비어있는 행에 invalid-feedback을 표시. 전체 유효성 여부를 반환.
7) **`getCheckedItems()` / `getItems()` / `getCount()`:** 상태 조회 함수.

###### 5.3.2.C. STEP 3. `sources` 옵션 처리 — `sourceKey` 연결

1) `bind()` / `bindCollection()` 내부에서 `UILayout.columns`를 순회하며 `sourceKey`가 선언된 필드를 탐지한다.
2) `sources[sourceKey]` 값이 `DomainCollection` 인스턴스인지 확인한다.
3) `DomainCollection.getItems()` → 각 항목의 데이터로 `<option>` 요소를 생성하여 `<select>` 요소에 삽입한다.
4) `sourceKey`가 선언되었으나 `sources`에 해당 키가 없으면 명확한 에러 메시지를 throw한다. 조용히 빈 `<select>`를 만드는 Silent Failure를 허용하지 않는다.

###### 5.3.2.D. STEP 4. Extends 기능 — [행 순서 조작] / [데이터 조작] (patch 버전)

1) `moveUp()` / `moveDown()`: 선택 행의 배열 인덱스를 이동 + DOM 노드 이동.
2) `duplicateChecked()`: 선택 행의 DomainState를 `structuredClone()`으로 복제하여 `DomainCollection.add()`로 추가.
3) 일괄 필드 변경: 선택된 행들의 특정 필드를 하나의 값으로 설정. SI 환경에서 "선택된 항목 전체의 상태 코드를 일괄 변경"하는 케이스에 대응.

###### 5.3.2.E. STEP 5. `FormBinder` / `DomainRenderer` deprecated 처리

1) v2.0.0 릴리즈 시점에 `FormBinder`와 `DomainRenderer`의 JSDoc에 `@deprecated` 태그를 추가한다.
2) 두 플러그인 사용 시 `console.warn`으로 "v2.0.0에서 deprecated되었습니다. UIComposer를 사용하세요" 메시지를 출력한다.
3) migration guide 문서를 `docs/guide/migration-v2.md`로 작성하여 기존 사용자의 전환을 돕는다.

###### 5.3.2.F. STEP 6. Vitest 통합 테스트 작성

1) **`addEmpty()`:** 호출 후 `DomainCollection.getCount()` 증가 + DOM에 `<tr>` 추가 확인.
2) **`removeChecked()` 역순 splice:** 체크박스 2개 선택 후 제거 시 올바른 항목이 제거되는지 확인.
3) **`sourceKey` 연결:** `sources` 옵션 주입 후 `<select>` 내 `<option>` 수가 DomainCollection 항목 수와 일치하는지 확인.
4) **`sourceKey` 미주입 에러:** `sourceKey`가 선언되었으나 `sources`에 해당 키가 없을 때 `Error` throw 확인.
5) **`validate()`:** required 필드가 빈 행 존재 시 `false` 반환 + invalid-feedback 표시 확인.
6) **deprecated 경고:** `DomainState.use(FormBinder)` 호출 시 `console.warn` 발화 확인.
