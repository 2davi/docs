# CDR-0001: Save Strategy Pivot & Library Repositioning

- **Status:** In-Progress
- **Period:** 2026-04-25 ~ ongoing
- **Trigger:** v1.2.4 시점에서 작성된 외부 평가 보고서가 식별한 라이브러리의 시장 적합성·운영 위생·구조 부채 약점들. 이를 해결하기 위한 개선 로드맵을 수립하는 과정에서 라이브러리의 정체성과 기술적 자유도에 대한 본질적 질문이 제기되었다.
- **Decider(s):** 2davi
- **Tags:** positioning, save-strategy, payload, adapter, market-fit, adr-formalization

---

## Context

본 사이클은 v1.2.4 릴리스 직후, 라이브러리의 외부 평가 보고서가 작성된 시점에 시작되었다. 직전 사이클(ard-0003)에서 v2.0.0 방향성을 정의하긴 했으나, 그 방향성은 "DomainState 분리"와 "UIComposer 도입"이라는 내부 개선에 머물렀고, 시장에서 이 라이브러리의 정체성이 무엇인가라는 질문에는 답하지 않았다.

평가 보고서가 식별한 약점은 세 층위였다:

1. **운영 위생** — semantic-release 위생 실패(1.2.x 4연속 patch), 버전 정합성 균열, 한국어 단일 문서 등.
2. **시장 포지셔닝** — "JSP+jQuery SI 구원자"와 "React Headless 상태 관리자" 두 트랙 동시 공략의 무모함.
3. **구조 부채** — DomainState.js 1,403줄 God Class, RFC 6902 PATCH 강제로 인한 백엔드 종속성.

이 사이클은 (1)을 ROADMAP Phase 1~3으로 처리하고, (2)와 (3)에 대한 본질적 결정을 내리는 것을 목표로 시작되었다. 그러나 논의가 진행되면서 (2)와 (3)이 분리된 문제가 아니라 하나의 정체성 문제라는 인식에 도달했다 — 라이브러리가 "RFC 6902 자동 분기 도구"로 정의되는 한 백엔드 종속성과 시장 협소성은 불가분이라는 것.

이 인식이 본 사이클을 단순 "리포지셔닝"이 아닌 "정체성 재정의(Pivot)"로 격상시켰다.

---

## Discussion

### Sub-topic 1: 평가 보고서를 토대로 한 개선 로드맵 수립

#### 발단

EVALUATION.md가 12개 개선 포인트를 식별했다. 그 중 영문화(Phase 6)는 글로벌 채용/OSS 진입에 가장 큰 비용 대비 효과를 가진다고 평가되었다. 그러나 영문화를 곧바로 진행하기 전에 한국어판 내부의 위생·일관성·포지셔닝을 정리할지, 아니면 영문화부터 우선 처리할지 순서 결정이 필요했다.

이 결정은 단순한 작업 순서 문제가 아니다. "영문화"는 번역 작업이 아니라 라이브러리의 가치 명제를 글로벌 시장에 노출시키는 마케팅 행위이며, 그 가치 명제 자체가 흔들리고 있는 시점이었다.

#### 수집한 선택지와 그 이유

##### Option A — 영문화 우선

###### 학습 출처와 접한 내용

- **글로벌 OSS 메인테이너의 README 패턴 사례** — TJ Holowaychuk(Express, Koa 저자), Sindre Sorhus(1000+ npm 패키지 메인테이너), Anthony Fu(Vite, VueUse) 등의 README 첫 문단은 모두 영문이며 한 문장으로 가치 명제를 압축한다. 한국어 README는 NPM 페이지에서 한국어 사용자에게만 노출되며, 영문권 평가자는 첫 화면에서 즉시 이탈한다는 것이 확인된 사실이다.
- **NPM 검색 알고리즘** — `package.json`의 `description` 필드가 영문이 아니면 npm search의 keyword 매칭이 의미 단위로 작동하지 않는다. "REST state manager", "JSON Patch", "optimistic update" 같은 검색어로 발견될 가능성이 거의 0이 된다.
- **Awesome List 큐레이션 기준** — `awesome-react`, `awesome-nodejs` 같은 큐레이션 리포지토리는 PR 가이드에서 "English README required" 또는 "International audience-friendly"를 명시한다. 한국어 단일 문서는 진입 자체가 차단된다.
- **GitHub Trending 알고리즘** — Star 수 외에 commit 활동, README 품질, description 품질을 가중치로 사용한다. 영문 description이 없으면 한국 시간대 외 사용자에게 노출 가능성이 줄어든다.

###### 기술적 정의

영문 README와 영문 PORTFOLIO를 새로 작성하고 NPM의 README 노출 우선순위를 영문판으로 변경. `package.json`의 `description` 필드도 영문화. 한국어 문서는 별도 `README.ko.md`로 보존하고 상단에서 양방향 링크.

###### 본 라이브러리에 적용했을 때의 형태

```
README.md           ← 영문, NPM/GitHub 메인 노출
README.ko.md        ← 한국어, 상단 토글 링크
PORTFOLIO.md        ← 영문 번역
PORTFOLIO.ko.md     ← 한국어 원본
package.json        ← description: 영문
```

###### 검토한 한계

영문화는 **번역**이 아니라 **메시지 재구축**이다. 한국어 README의 첫 문장이 "REST API 리소스를 Proxy로 감싸, 필드 변경을 자동으로 추적하고, POST/PATCH/PUT을 스마트하게 분기하는 zero-dependency 상태 관리 라이브러리"인데, 이걸 그대로 영어로 옮기면 영어권 독자에게는 "그래서 누구를 위한 무엇인가?"라는 질문이 그대로 남는다.

또한 한국어 README가 "JSP+jQuery SI 구원자"와 "React Headless 상태 관리자" 두 트랙을 동시에 어필하는 형태로 적혀 있는데, 이걸 그대로 영어로 옮기면 "이 라이브러리는 누구를 위한 것이지?"라는 혼란이 영문 독자에게 더 강하게 전달된다. 한국어 독자는 "SI"라는 단어로 한국 엔터프라이즈 환경을 즉시 떠올리지만, 영어권 독자에게 "SI"는 의미 없는 약어다.

결국 영문화 우선 전략은 한국어판의 혼란을 영문판에 그대로 복제하거나, 영문판 작성 도중 한국어판을 다시 손봐야 하는 이중 작업으로 귀결된다.

##### Option B — 한국어판 위생 정리 우선

###### 학습 출처와 접한 내용

- **"라이브러리 평가는 한 문장 가치 명제로 결정된다"는 OSS 마케팅 통설** — Brian Lonsdorf(JS 함수형 프로그래머), Kent C. Dodds(React 강사), Andre Staltz(RxJS contributor) 등의 컨퍼런스 발표에서 반복적으로 언급된다. 첫 문장이 "이 라이브러리는 ___ 를 위한 ___ 이다"라는 형식으로 읽혀야 평가자가 30초 안에 가치를 파악한다.
- **Hacker News 토론 데이터** — "I read the README for 30 seconds. If I don't get it, I leave."라는 평가자 행동 패턴이 반복적으로 보고된다. 30초 안에 평가자에게 전달할 수 있는 정보는 README 첫 문장 + 가능하면 첫 코드 예시 1개뿐이다.
- **TanStack Query, Zustand, Valtio README의 첫 문장 분석** —
  - TanStack Query: "Powerful asynchronous state management, server-state utilities and data fetching for the web" — 페르소나(웹 개발자) + 가치(서버 상태 관리)가 한 문장에.
  - Zustand: "A small, fast and scalable bearbones state-management solution" — 차별화(작고 빠름) + 정체성(state management)이 한 문장에.
  - Valtio: "makes proxy-state simple for React and Vanilla" — 기술(Proxy) + 페르소나(React/Vanilla)가 한 문장에.
- **Sindre Sorhus의 100+ 패키지 README 분석** — 모든 README가 동일한 구조: 1줄 description → 코드 예시 → API → Related. 첫 줄이 페르소나 + 가치를 압축하지 않은 패키지는 거의 없다.

###### 기술적 정의

영문화 이전에 다음을 한국어판에서 먼저 정리:

1. README 첫 문장을 한 페르소나 + 한 가치 명제로 압축
2. PORTFOLIO, ARCHITECTURE의 메시지를 README 첫 문장과 정렬
3. NPM description, GitHub description, package keyword를 정렬된 메시지로 통일
4. 영문화는 정렬된 한국어를 1:1 번역하는 마지막 단계

###### 본 라이브러리에 적용했을 때의 형태

ROADMAP.md를 6단계로 구성:
- Phase 1~3: 위생 / 자동화 / 측정 가능성 정리 (운영 영역)
- Phase 4: 포지셔닝 결정 (가치 명제 확정)
- Phase 5: 구조 부채 (선택)
- Phase 6: 영문화 (Phase 4의 결정된 메시지를 1:1 번역)

###### 검토한 한계

영문화 시점이 늦어진다. 영문 README가 없는 동안 글로벌 사용자에게 노출될 가능성은 0에 가깝다. 다만 본 라이브러리는 현재 사용자 0명이라 "노출되지 않는 비용"이 0이다 — 이미 노출되지 않고 있으므로 영문화를 늦춰도 잃을 사용자가 없다.

또한 한국어 정리 자체가 그대로 영문화의 입력이 되므로, 정리 작업이 영문화의 사전 작업과 겹치는 부분이 있어 총 작업량이 크게 늘어나지 않는다.

##### Option C — 두 작업 병행

###### 학습 출처와 접한 내용

- **다인 OSS 팀의 i18n 작업 사례** — Vue.js, React, Vite 같은 다인 팀에서는 한국어 번역과 영문 원본이 별도 트랙으로 진행된다. 그러나 이는 분업이 가능한 환경의 사례이며, 단일 커미터 환경에서 직접 적용 불가.
- **Single-developer OSS 생산성 패턴** — Sindre Sorhus의 100+ 패키지 작업 흐름은 "한 번에 하나의 컨텍스트만"이라는 원칙을 따른다. 컨텍스트 스위칭 비용이 작업 시간을 1.5~2배 늘린다는 측정값이 있다.
- **Pomodoro 등 시간 관리 기법 연구** — 컨텍스트 스위칭 시 워밍업 시간이 평균 23분이라는 UC Irvine 연구(Gloria Mark, 2008). 한국어/영문 동시 진행은 두 컨텍스트 사이의 워밍업 시간을 매번 지불.

###### 기술적 정의

한국어 정리 PR과 영문 작성 PR을 동시에 열어두고 양쪽이 합의되면 머지하는 방식.

###### 본 라이브러리에 적용했을 때의 형태

ROADMAP의 한국어 Phase와 별도의 EnglishRoadmap.en.md를 동시 진행. 각 Phase의 한국어 PR과 영문 PR을 병렬로 작성.

###### 검토한 한계

단일 커미터 환경에서 컨텍스트 스위칭 비용이 매우 크다. 한국어 README의 첫 문장이 변경되면 영문 README의 첫 문장도 재작성해야 하며, 이 동기화가 매번 발생한다. 한쪽이 변경될 때마다 다른 쪽 재작업이 발생하므로 총 작업량이 Option A나 B보다 50% 이상 증가할 가능성이 높다.

#### 결정 또는 미룬 이유

**Option B 채택.**

본 라이브러리의 평가는 "기술적 정확성"에 앞서 "한 문장 가치 명제의 명료성"으로 결정된다. 한국어 README가 두 트랙을 동시 공략하는 형태로 적혀 있는 한 영문 번역도 같은 혼란을 답습하게 된다. 따라서 영문화 이전에 한국어판의 가치 명제를 한 문장으로 정리하는 것이 선결 과제로 설정되었다.

이 결정에 따라 ROADMAP.md가 6단계로 구성되었으며, Phase 4(포지셔닝 결정)가 본 사이클의 핵심 의사결정 지점으로 부상했다.

부수적으로, 본 사이클의 산출물(EVALUATION.md, ROADMAP.md, CLAUDE.md)은 모두 한국어이며 본 저장소의 commit chain에 포함시키지 않고 로컬 관리로 결정되었다. 이 결정은 §9의 양식 정형화 결정과 별개로 이루어졌으며, 사이클 산출물이 코드 저장소의 history를 오염시키지 않도록 하기 위함이다.

---

### Sub-topic 2: 어댑터 격리 옵션 검토

#### 발단

ROADMAP Phase 4의 초기 형태는 "SI 트랙과 React 트랙 중 하나를 메인으로 결정"하는 구도였다. 이는 한 트랙을 보조로 강등하고 README의 메인 메시지를 다른 트랙으로 집중시키는 마케팅 결정이었다. 그러나 이 결정 자체가 라이브러리의 가치를 절반으로 줄이는 형태라는 문제 인식이 생겼다 — 두 트랙 모두를 살리는 구조적 가능성이 있는가?

코드를 분석해보니 흥미로운 비대칭이 발견되었다. React 어댑터(`adapters/react.js`)는 이미 subpath export로 격리되어 있고 core에 React 의존성이 0이다. `subscribe()`/`getSnapshot()`은 useSyncExternalStore "규약"을 따르는 framework-agnostic 메서드이지 React 의존성이 아니다. 반면 UIComposer는 install() 패턴으로 prototype을 monkey-patching하는 방식이라 진짜 "동등 어댑터"는 아니었다.

이 비대칭 자체가 답을 시사했다. **React 어댑터의 패턴(외부 함수 모듈, core 변형 없음)을 SI 어댑터에도 적용할 수 있는가?**

#### 수집한 선택지와 그 이유

##### Option A — 모두 install() 플러그인 패턴으로 통일

###### 학습 출처와 접한 내용

- **Vue 2의 plugin 시스템** — `Vue.use(Plugin)`이 `Vue.prototype`에 메서드를 추가하는 패턴. Vue Router, Vuex, vue-i18n 등이 동일 패턴 사용. 그러나 Vue 3에서 Composition API로 전환하면서 install 패턴이 약화됨 — `useRouter()`, `useStore()` 같은 hook 패턴으로 마이그레이션.
- **jQuery plugin 패턴** — `$.fn.myPlugin = function() {...}` 형식으로 `$.fn` (즉 jQuery prototype)에 메서드를 추가. 본 라이브러리의 UIComposer가 이 패턴을 따르고 있다.
- **mongoose plugins** — `schema.plugin(plugin)`이 schema 인스턴스에 메서드/static을 추가. 주로 cross-cutting concerns(timestamps, soft-delete 등)에 사용.
- **React에서의 부적합성** — React의 hook은 함수 호출 컨텍스트(컴포넌트 내부)에서만 동작하며 prototype에 붙는 개념이 아니다. `class Component {} Component.prototype.useState = ...`은 작동하지 않는다.

###### 기술적 정의

```javascript
// SI 어댑터 (현재 동작)
DomainState.use(UIComposer);
state.bindSingle('#form', { layout });   // prototype에 추가된 메서드

// React 어댑터를 같은 패턴으로?
DomainState.use(ReactAdapter);
state.useDomainState();  // ← prototype 메서드는 hook이 아니다
```

###### 본 라이브러리에 적용했을 때의 형태

이 옵션을 채택하려면 React 어댑터를 install 패턴으로 강제 변환해야 하는데, 그 변환 자체가 React의 hook 규약을 위반한다. `state.useDomainState()`는 `state` 인스턴스에 종속된 메서드 호출이지 컴포넌트 함수 안에서 호출되는 hook이 아니다. React 18의 `useSyncExternalStore`는 hook이 컴포넌트 함수 내부에서 호출되어야 한다는 강력한 제약을 가진다.

###### 검토한 한계

React 훅(`useDomainState`)은 컴포넌트 함수 호출 컨텍스트에서만 동작하므로 prototype에 메서드로 붙일 수 없다. install 패턴 자체가 React 훅과 호환되지 않는다.

또한 V8 Hidden Class 관점에서, `prototype`에 동적으로 메서드를 추가하는 것은 클래스의 Hidden Class를 런타임에 변경시켜 Inline Cache를 무효화한다. 이는 PORTFOLIO §3-1에서 강조한 "V8 친화 설계" 자산과 모순된다.

##### Option B — 모두 외부 함수형 모듈로 통일

###### 학습 출처와 접한 내용

- **React 18 useSyncExternalStore 규약** — store는 `subscribe(listener)`/`getSnapshot()` 메서드를 제공하고, 어댑터(hook)는 외부 함수로 wrap한다. 본 라이브러리의 `adapters/react.js`가 이미 이 패턴.
- **Zustand의 외부 hook 패턴** — `const useStore = create(...)`로 store를 만들고, 컴포넌트에서 `useStore(selector)`로 호출. 어댑터가 외부 모듈이고 store는 framework-agnostic.
- **Jotai의 atom + useAtom 패턴** — atom은 framework-agnostic 상태 표현이고, `useAtom(atom)`은 별도 어댑터.
- **Vue 3 reactivity의 ref/reactive와 Composition API의 분리** — `ref`/`reactive`는 framework-agnostic core이고, Vue 컴포넌트는 setup 함수에서 외부 호출.
- **Solid.js의 createSignal과 컴포넌트의 분리** — signal은 외부 export 함수이고, 컴포넌트는 그것을 호출.
- **redux-toolkit의 createSlice + react-redux의 useSelector** — slice는 redux-store-agnostic이고, react-redux는 별도 패키지로 어댑터 제공.

이 모든 패턴의 공통점: **core는 framework-agnostic 외부 모듈, 어댑터는 별도 외부 모듈, prototype 변형 없음**.

###### 기술적 정의

```javascript
// React 어댑터 (현재 그대로)
import { useDomainState } from '@2davi/rest-dsm/adapters/react';
const data = useDomainState(state);

// SI 어댑터 (Option B 채택 시 변경)
import { bindForm, bindGrid } from '@2davi/rest-dsm/adapters/jquery';
const ctrl = bindForm(state, '#form', { layout: UserLayout });
const grid = bindGrid(collection, '#grid', { layout: CertLayout });
```

`UIComposer.install()`을 호출하지 않는다. core의 `DomainState.prototype`에 `bindSingle`, `bind` 같은 메서드가 추가되지 않는다. 어댑터는 첫 번째 인자로 state/collection을 받는 외부 함수.

###### 본 라이브러리에 적용했을 때의 형태

```
@2davi/rest-dsm                      ← core only
├── DomainState, DomainVO, DomainCollection, DomainPipeline, ApiHandler
└── (no UI, no React)

@2davi/rest-dsm/adapters/jquery      ← jQuery adapter
└── bindForm, bindGrid, UILayout

@2davi/rest-dsm/adapters/react       ← React adapter (이미 존재)
└── useDomainState
```

`index.js`의 export에서 `UIComposer`, `UILayout`, `DomainRenderer`, `FormBinder`를 제거한다. core 번들이 가벼워진다.

###### 검토한 한계

기존 사용자에게 breaking change. 단, 본 사이클 결정 시점에 현재 사용자 0명이라 이 비용은 0. 또한 사용자가 명시적으로 "현재 사용자 0명 전제"를 본 사이클의 모든 결정의 baseline assumption으로 깔았다.

학습 곡선 측면에서, `state.bindSingle('#form')`보다 `bindForm(state, '#form')`이 직관성이 약간 떨어질 수 있다. 그러나 React/Vue 개발자에게는 후자가 더 익숙하며, "어댑터는 외부 함수"라는 일관된 멘탈 모델을 제공한다.

##### Option C — Subpath exports + 선택적 install

###### 학습 출처와 접한 내용

- **lodash와 lodash-es의 분리** — lodash는 단일 패키지에서 ESM 친화적인 별도 패키지(lodash-es)를 추가 제공하며, subpath exports로 개별 함수 import 가능.
- **date-fns의 모듈식 import** — `import { format } from 'date-fns'`로 개별 함수만 import. 트리쉐이킹이 자동.
- **Material-UI(MUI)의 subpath imports** — `@mui/material/Button`처럼 컴포넌트별 subpath. 그러나 MUI는 prototype 변형 없이 단순 컴포넌트 export.
- **본 라이브러리의 현재 상태** — `adapters/react`가 이미 subpath. `index.js`에 UIComposer가 함께 있어서 격리는 부분적.

###### 기술적 정의

```javascript
// core
import { DomainState } from '@2davi/rest-dsm';

// SI 어댑터 (subpath, install 패턴 유지)
import { UIComposer } from '@2davi/rest-dsm/adapters/jquery';
DomainState.use(UIComposer);
state.bindSingle('#form', { layout });   // install로 prototype에 추가

// React 어댑터 (subpath, hook)
import { useDomainState } from '@2davi/rest-dsm/adapters/react';
```

###### 본 라이브러리에 적용했을 때의 형태

`index.js`에서 UIComposer/UILayout export 제거. `package.json` `exports`에 jquery subpath 추가. 그러나 install 패턴은 유지 — 사용자는 여전히 `DomainState.use(UIComposer)` 호출 후 `state.bindSingle()` 사용.

###### 검토한 한계

어댑터 두 개의 사용 형태가 다르다. React는 외부 hook(`useDomainState(state)`), SI는 install 후 메서드(`state.bindSingle()`). 진짜 "동등 계층"이 아니다.

V8 Hidden Class 관점의 모순도 그대로 남는다 — install이 prototype을 변형하므로 Hidden Class가 런타임에 바뀐다.

또한 README에서 "두 어댑터가 동등하게 격리되어 있다"고 설명할 때 사용 형태가 다르면 메시지가 약해진다. 사용자가 "왜 한쪽은 install이고 다른 쪽은 외부 함수지?"라고 의문을 갖게 된다.

#### 결정 또는 미룬 이유

**Option B 채택.**

근거는 세 가지다.

첫째, 현재 사용자 0명이라 breaking change 비용이 없다. 비용 없이 가장 깨끗한 구조를 채택할 수 있는 시점이다.

둘째, V8 Hidden Class 친화성을 PORTFOLIO §3-1에서 라이브러리의 기술적 자산으로 강조해왔는데, prototype 변형 패턴(install)은 이 자산과 모순된다. install로 메서드를 추가하면 클래스의 Hidden Class가 런타임에 변경되어 V8 Inline Cache가 무효화될 수 있다. Option B는 prototype 변형을 0으로 만들어 이 자산과 일관된다.

셋째, "core + 두 동등 어댑터" 구도가 시장 메시지를 명료화한다. 어떤 어댑터를 메인으로 정할지 고민하는 대신 "core 자체가 framework-agnostic이고 각 어댑터는 같은 계층의 모듈"이라는 일관된 설명이 가능하다. React 18의 `useSyncExternalStore` 패턴, Zustand, Jotai, Vue 3 reactivity 등 모던 상태 관리 라이브러리가 모두 이 패턴을 채택했다는 사실도 시장 메시지의 신뢰도를 높인다.

이 결정 후 두 어댑터는 코드 레벨에서 동등하지만, **시장 포지셔닝 메시지는 여전히 한 트랙을 메인으로 정해야 한다**는 별도 인식이 §3에서 따라온다.

---

### Sub-topic 3: 코드 격리와 시장 포지셔닝의 분리

#### 발단

Option B 채택 직후, "코드 레벨에서 두 어댑터가 동등 계층으로 격리되면 시장 포지셔닝 문제도 자동 해결되는가?"라는 후속 질문이 떠올랐다. 만약 코드 격리만으로 README의 첫 문장이 "core + 두 어댑터" 구도로 자연스럽게 답해진다면 Phase 4의 마케팅 결정이 불필요해진다.

이 질문은 코드와 마케팅의 관계에 대한 본질적 인식을 묻는다. 두 가지 관점이 가능하다.

#### 수집한 선택지와 그 이유

##### Option A — 코드 격리만으로 충분

###### 학습 출처와 접한 내용

- **TanStack Query의 README 첫 문장** — "Powerful asynchronous state management, server-state utilities and data fetching for the web". TanStack Query는 React, Vue, Solid, Svelte 어댑터를 모두 제공한다. 그러나 첫 문장은 "for the web"이라는 포괄 표현을 사용 — 어댑터의 동등성이 메시지에 자연스럽게 녹아 있다.
- **Tanstack Router의 React + Solid 동시 지원** — README 첫 줄에 "type-safe router for React, Solid, and the future". 어댑터 동등성을 명시적으로 어필.
- **MobX의 framework 중립 메시지** — "Simple, scalable state management". 어떤 framework인지 명시하지 않음. core 자체가 framework-agnostic이라는 정체성이 메시지의 핵심.
- **Vue 3 reactivity 패키지(`@vue/reactivity`)** — Vue와 별개로 사용 가능한 reactivity core를 별도 패키지로 분리. README 첫 문장은 reactivity 자체의 가치 명제.

이 사례들의 공통점: **코드 레벨에서 어댑터 동등 격리가 가능하면, 메시지도 framework 중립적으로 표현 가능하다**.

###### 기술적 정의

README 첫 문장:
"REST 리소스를 동기화 단위로 다루는 framework-agnostic 엔진. jquery / react 어댑터 제공."

페르소나 명시 없이 "framework-agnostic" 키워드로 어댑터 동등성을 어필.

###### 본 라이브러리에 적용했을 때의 형태

README 첫 문단이 "엔진 + 어댑터" 구도로 자연스럽게 흐른다. 페르소나(SI 개발자, React 개발자)는 두 번째 문단의 사용 예시에서 자연스럽게 분기.

###### 검토한 한계

평가자가 30초 내 파악해야 하는 것은 **"이 라이브러리가 누구의 어떤 통증을 풀어주는가"**이지 "어떤 모듈로 구성되어 있는가"가 아니다.

"framework-agnostic 엔진"이라는 메시지는 정직하지만 페르소나가 추상적이다. 평가자가 "그래서 누구를 위한 거지?"라는 질문을 안고 두 번째 문단으로 넘어가야 한다. 30초 평가에서 두 번째 문단까지 도달할 시간이 충분하지 않다.

또한 TanStack Query는 이미 글로벌 인지도가 있어서 "for the web"이라는 추상 표현으로도 사용자가 이미지를 떠올린다. 본 라이브러리는 인지도 0이라 추상 표현은 위험하다.

##### Option B — 코드 격리는 별개, 마케팅 메시지는 한 트랙을 메인으로

###### 학습 출처와 접한 내용

- **마케팅 학술 자료 — Beachhead market 전략** — Geoffrey Moore의 "Crossing the Chasm"에 나오는 개념. 신생 제품은 한 명확한 페르소나(beachhead)를 먼저 점령한 뒤 인접 시장으로 확장한다. 동시에 두 시장을 공략하면 양쪽 모두에게 약한 메시지가 된다.
- **Product positioning literature** — April Dunford의 "Obviously Awesome"에서 강조하는 원칙: "If your product is for everyone, it's for no one". 한 페르소나를 명시적으로 선택해야 그 페르소나의 통증과 라이브러리의 가치가 1:1로 매핑된다.
- **OSS 라이브러리의 첫 문장 분석** —
  - Day.js: "Fast 2kB alternative to Moment.js with the same modern API". 페르소나(Moment.js 사용자) + 가치(빠르고 가벼움)가 명확.
  - Tailwind CSS: "Rapidly build modern websites without ever leaving your HTML". 페르소나(웹 개발자) + 가치(HTML 안에서 스타일 작성).
  - Prisma: "Next-generation Node.js and TypeScript ORM". 페르소나(Node/TS) + 가치(차세대 ORM).
  - 본 라이브러리: 메인 페르소나가 미정인 상태에서는 같은 형식의 첫 문장을 작성할 수 없다.

###### 기술적 정의

코드는 동등 격리되더라도 README 첫 문장은 한 명확한 사용자 페르소나를 답해야 함. 모듈 구조는 두 번째 문단의 답.

예시:

```markdown
[SI 트랙 메인 결정 시 README 첫 문장]
JSP + Spring 환경의 1:N 그리드 보일러플레이트를 10줄로 줄이는 zero-dependency 라이브러리.
React/Vue 어댑터도 함께 제공.

[React 트랙 메인 결정 시 README 첫 문장]
React 18+ 환경에서 GET → 수정 → PATCH 사이클을 useDomainState() 한 줄로 자동화하는
zero-dependency 상태 관리자. jQuery 어댑터도 함께 제공.
```

각 첫 문장이 페르소나(JSP 개발자 / React 개발자) + 가치 명제(보일러플레이트 제거 / 사이클 자동화)를 1:1로 매핑.

###### 본 라이브러리에 적용했을 때의 형태

ROADMAP Phase 4(포지셔닝 결정)는 마케팅 결정으로 환원된다. 코드 격리(Option B)가 이미 완료되었으므로, 이 결정은 "어떤 페르소나를 첫 문장의 주인공으로 정할 것인가"의 단일 마케팅 선택이 된다.

본 사이클은 이 마케팅 선택을 ADR-0006에서 별도로 다루기로 합의한다.

###### 검토한 한계

한 트랙을 메인으로 정하는 결정 자체가 여전히 필요. 다만 코드는 양쪽 모두 작동하므로 마케팅 결정만의 문제가 됨. 코드 결정과 마케팅 결정이 분리됨으로써 한쪽이 변경되어도 다른 쪽이 영향받지 않는다.

#### 결정 또는 미룬 이유

**Option B 채택.**

코드 동등 격리가 가능하다는 사실은 두 번째 문단의 보조 카드로 활용할 수 있을 뿐 첫 문단의 답이 되지 않는다. 첫 문단은 여전히 "이 라이브러리는 ___ 환경의 ___ 를 위한 것이다"라는 한 문장 답이 필요하다.

다만 Option B 후 이 결정의 성격이 바뀐다. 코드 격리 전에는 "한 트랙을 메인으로 정하면 다른 트랙은 코드 측면에서도 불완전해진다"는 부담이 있었으나, 코드 격리 후에는 "마케팅 메시지만 한 트랙을 강조해도 코드는 모두 동등하게 작동한다"는 자유도가 생긴다. 즉 마케팅 결정이 코드 결정으로부터 분리된다.

이 분리가 본 사이클의 중요한 발견 중 하나다. 마케팅 메시지 결정은 ADR-0006으로 별도 분리되었다.

---

### Sub-topic 4: Core의 시장적 가치 분석

#### 발단

Option B 후 어댑터를 떼어내고 core만 남겼을 때 어떤 시장적 가치를 갖는지 명확히 해야 마케팅 메시지가 결정된다. core의 정체성이 흐리면 어떤 사용자 페르소나를 메인으로 정할지도 결정할 수 없다.

본 sub-topic은 core를 다섯 가지 평가 축으로 분석하고, 동시에 시장에 존재하는 7개의 인접 라이브러리와 직접 비교한다.

#### 수집한 선택지와 그 이유

##### 평가 축 1 — 기술적 독창성

###### 학습 출처와 접한 내용

- **Immer (immerjs/immer)** — `produce(state, draft => { draft.name = 'x' })` 패턴. 변경 추적은 있지만 HTTP 자동 분기 없음. 5만+ Star, 매우 인지도 높음.
- **Valtio (pmndrs/valtio)** — Proxy 기반 React 상태 관리. `proxy({})` + `useSnapshot()`. Proxy 추적은 있지만 HTTP 자동 분기 없음. 8천+ Star.
- **MobX (mobxjs/mobx)** — 데코레이터 기반 reactivity. 대규모 React 앱의 상태 관리. 변경 추적은 강력하지만 HTTP 자동 분기는 없음. 27천+ Star.
- **TanStack Query (TanStack/query)** — server state cache + mutation + optimistic update. mutation은 자유롭게 짤 수 있지만 client-side 변경 추적은 없음. 39천+ Star, 매우 인지도 높음.
- **SWR (vercel/swr)** — TanStack Query와 유사하나 더 가벼움. fetcher 함수만 제공. 변경 추적 없음. 28천+ Star.
- **Apollo Client** — GraphQL 전용. cache + mutation. 본 라이브러리와 직접 비교 어려움.
- **fast-json-patch (Starcounter-Jack/JSON-Patch)** — RFC 6902 직렬화 라이브러리. 변경 추적/롤백/HTTP 분기 없음. JSON Patch만 생성. 1천+ Star.

이 7개 라이브러리 중 어느 것도 다음 4가지를 모두 통합하지 않는다:
1. Proxy 기반 자동 변경 추적
2. dirty ratio 기반 HTTP 메서드 자동 분기 (POST/PATCH/PUT)
3. structuredClone 기반 보상 트랜잭션 (실패 시 자동 롤백)
4. RFC 6902 JSON Patch 직렬화

각각의 부품은 시장에 존재하지만 통합된 솔루션이 비어 있다.

###### 본 라이브러리의 위치

본 라이브러리는 Immer(변경 추적) + fast-json-patch(직렬화) + TanStack Query(롤백) + 자체 HTTP 분기 로직의 조합이지만, 통합되어 있어 사용자가 4개 라이브러리를 조합하지 않아도 된다.

###### 평가

**STRONG.** 4중 통합은 시장에서 비어 있는 슬롯이며, 본 라이브러리의 차별화 포인트.

##### 평가 축 2 — 시장 사이즈

###### 학습 출처와 접한 내용

- **REST API의 시장 점유율 추이** — Postman의 2023 State of API Report에 따르면 REST는 여전히 86%로 압도적이지만, GraphQL이 28%, gRPC가 15%로 빠르게 성장.
- **모던 스택의 RPC 방향 이동** — tRPC(Theo Browne 주도, GitHub Star 35천+), Server Actions(Next.js 14+), React Server Components(RSC) 등이 REST를 우회.
- **React Query 사용자 통계** — 86% 이상이 REST API 사용 (TanStack Survey 2023). 그러나 신규 프로젝트에서는 GraphQL/RPC 비율 증가.
- **한국 엔터프라이즈의 REST 비중** — JSP+Spring 환경이 여전히 90% 이상. REST가 향후 5~10년간 유지될 가능성 높음.

###### 평가

**WEAK.** REST가 점진적으로 비주류화 흐름. 글로벌 시장에서 신규 프로젝트의 RPC 채택률 증가. 단, 한국 엔터프라이즈는 예외.

##### 평가 축 3 — 시장 진입 가능성

###### 학습 출처와 접한 내용

- **TanStack Query의 시장 점령** — 2020년 이후 React 서버 상태 관리의 사실상 표준. mutation + optimistic update 슬롯을 거의 독점.
- **Redux Toolkit Query** — TanStack Query와 유사한 기능을 Redux 사용자에게 제공. Redux 생태계 내부 점유.
- **SWR의 위치** — TanStack Query보다 가벼움이라는 차별화. 그러나 기능 매트릭스는 좁음.
- **본 라이브러리의 진입 가능성** — TanStack Query와 직접 경쟁 슬롯("REST 클라이언트 + mutation")에서는 인지도/생태계 차이가 너무 큼. 차별화 슬롯("자동 변경 추적 + 자유 직렬화")에서만 진입 가능.

###### 평가

**WEAK.** TanStack Query 그늘. 직접 경쟁 슬롯 진입은 거의 불가능. 차별화 슬롯에서만 niche 점유 가능.

##### 평가 축 4 — 포트폴리오 시그널

###### 학습 출처와 접한 내용

- **시니어 개발자 면접 시그널 분석** — Hacker News, Reddit r/cscareerquestions 등의 면접 후기에서 반복적으로 언급되는 시그널: "표준 명세를 읽고 코드 결정에 연결하는 능력", "분산 시스템 패턴을 client-side에 적용하는 사고", "Framework-agnostic 설계 능력".
- **본 라이브러리가 증명하는 것** — Proxy + Reflect + WeakMap (Vue 3 internals 수준), RFC 6902/9110/IETF Draft/OWASP 직접 참조, 보상 트랜잭션과 Idempotency-Key의 client-side 적용, structuredClone 기반 4종 상태 원자적 롤백, BroadcastChannel + Web Worker 활용.
- **이런 시그널은 사용자 수에 좌우되지 않는다** — "이 라이브러리를 만든 사람"이라는 시그널은 라이브러리의 인기와 별개로 평가됨. 면접관이 코드를 직접 읽으면 시그널 강도가 그대로 전달됨.

###### 평가

**EXCELLENT.** 5축 중 가장 강함. 본 라이브러리의 진정한 자산은 사용자 풀이 아니라 시그널 강도.

##### 평가 축 5 — 장기 OSS 가치

###### 학습 출처와 접한 내용

- **OSS 라이브러리의 생존 패턴** — 99% 이상의 npm 패키지가 1년 내 비활성화. 살아남는 라이브러리는 유지보수자(maintainer)의 지속적 commit 또는 도메인 특화로 작은 사용자 풀을 안정적으로 확보.
- **niche but real 사례** — date-fns(Moment.js 대안, 작지만 꾸준), zustand(Redux 대안, 작지만 진성 사용자), Valtio(Proxy 상태, niche지만 확실한 페르소나).
- **본 라이브러리의 장기 위치** — JSON Patch + 보상 트랜잭션 + 한국 SI 트랙은 niche 시장이지만 진성 사용자 100~1000명 정도의 안정적 풀 확보 가능.

###### 평가

**ADEQUATE.** Niche but real. 글로벌 트렌딩은 어렵지만 안정적 사용자 풀 확보 가능.

#### 결정 또는 미룬 이유

**종합 결론:** 글로벌 트렌딩 라이브러리가 되기는 어렵지만, 기술적 깊이를 증명하는 도구로서는 매우 강하다. 이 강함은 사용자 수에 좌우되지 않는다.

가치 명제의 1차 진화: "RFC 6902로 자동 분기되는 REST 상태 관리자"에서 "REST 리소스를 동기화 단위로 다루는 framework-agnostic 엔진"으로.

이 시점에서는 가치 명제가 확정되지 않았다. 백엔드 종속성 문제가 §5에서 풀린 후 §7에서 최종 가치 명제가 결정된다.

---

### Sub-topic 5: PATCH 강제로 인한 백엔드 종속성 인식

#### 발단

§4의 시장 가치 분석에서 확인된 결정적 약점이 있었다. SOM(Serviceable Obtainable Market)이 "RFC 6902 JSON Patch를 받는 백엔드를 가진 팀"으로 좁혀진다는 점이다. 본 라이브러리가 PATCH 페이로드를 RFC 6902 형식으로 강제하므로, 백엔드가 이 형식을 받지 못하면 라이브러리 자체가 무용해진다. 이것이 시장 침투의 결정적 장벽이다.

이 장벽을 기술적으로 풀 수 있는가? "JSON Patch 알고리즘을 라이브러리 내부 로직으로는 살려두면서, 외부에 노출되는 페이로드 형식과 HTTP 메서드를 개발자가 자유롭게 커스터마이즈할 수 있는가?"라는 질문이 제기되었다.

분석 결과, "PATCH를 쓸지 말지 선택"이라는 단순한 표현 안에 실제로는 6개의 독립된 자유도가 숨겨져 있음을 발견했다.

#### 수집한 선택지와 그 이유 (자유도의 차원)

##### 자유도 (1) — 메서드 분기 로직

###### 현재 동작

```javascript
// DomainState.save() 내부 (현재)
const dirtyRatio = this._getDirtyFields().size / Object.keys(target).length;
const method = isNew ? 'POST'
             : dirtyRatio >= DIRTY_THRESHOLD ? 'PUT'
             : 'PATCH';
```

`DIRTY_THRESHOLD = 0.7`이 라이브러리 내부 상수. 사용자가 변경할 수 없음.

###### 학습 출처와 접한 내용

- **RFC 9110 (HTTP Semantics)** — 메서드 의미론을 표준화. PUT은 "리소스 전체 교체", PATCH는 "부분 변경", POST는 "새 리소스 생성 또는 처리". 라이브러리의 자동 분기는 이 의미론을 따르지만, 백엔드가 다른 의미론을 채택할 수 있음.
- **한국 SI POST-only 컨벤션** — 모든 mutation을 POST로. RFC 9110 위반이지만 70~80% 점유율. URL에 action을 명시(`/api/user/update`).
- **GraphQL 영향** — 모든 mutation이 POST. RESTful 의미론 자체를 우회.
- **Hibernate Dirty Checking** — 변경된 필드만 추적해 SQL UPDATE를 자동 생성. 본 라이브러리의 dirtyFields 패턴의 영감 출처.

###### 자유도 부여 시 가능한 변형

```javascript
// 사용자 정의 분기 로직 1: 항상 PUT
decide: () => 'PUT'

// 사용자 정의 분기 로직 2: 항상 POST (한국 SI)
decide: () => 'POST'

// 사용자 정의 분기 로직 3: threshold 변경
decide: ({ dirtyRatio }) => dirtyRatio >= 0.5 ? 'PUT' : 'PATCH'

// 사용자 정의 분기 로직 4: 자체 룰
decide: ({ isNew, dirtyFields, target }) => {
    if (isNew) return 'POST';
    if (dirtyFields.has('passwordHash')) return 'PUT'; // 보안 필드는 전체 교체
    return 'PATCH';
}
```

##### 자유도 (2) — PATCH 페이로드 포맷

###### 현재 동작

```javascript
// api-mapper.js의 toPatch()
return JSON.stringify(changeLog); // RFC 6902 array 그대로
```

###### 학습 출처와 접한 내용

- **RFC 6902 JSON Patch** — operation 배열 (`[{"op": "replace", "path": "/name", "value": "x"}]`). Microsoft API, Kubernetes API 등 채택. 정확하지만 verbose.
- **RFC 7396 JSON Merge Patch** — 변경 부분만 객체로 (`{"name": "x", "email": null}`). null이 삭제 시그널. GitHub API, OpenAPI 권장. 더 직관적.
- **JSON:API spec** — envelope 구조 (`{"data": {"type": "users", "attributes": {...}}}`). Ember.js 생태계.
- **Rails ActiveResource** — 리소스 명을 키로 (`{"user": {"name": "x"}}`).
- **OData (Microsoft)** — metadata 포함 (`{"@odata.context": "...", "Name": "x"}`).
- **자체 envelope** — `{"data": {...}}`, `{"payload": {...}}`, `{"updates": {...}}` 등 변형.

###### 자유도 부여 시 가능한 변형

```javascript
serialize: {
    PATCH: (ctx) => ({
        body: JSON.stringify(ctx.changeLog),
        headers: { 'Content-Type': 'application/json-patch+json' }
    }),
    // 또는 Merge Patch
    PATCH: (ctx) => {
        const patch = {};
        for (const field of ctx.dirtyFields) {
            patch[field] = ctx.target[field] ?? null;
        }
        return {
            body: JSON.stringify(patch),
            headers: { 'Content-Type': 'application/merge-patch+json' }
        };
    }
}
```

##### 자유도 (3) — PUT/POST 페이로드 포맷

###### 현재 동작

```javascript
// api-mapper.js의 toPayload()
return JSON.stringify(target); // 전체 객체
```

###### 학습 출처와 접한 내용

- **Spring Data REST** — PUT으로 전체 객체 전송. 표준 JSON.
- **JSON:API** — POST/PUT 모두 envelope 구조 (`{"data": {...}}`).
- **한국 SI 패턴** — POST에 action + data envelope.
- **REST Maturity Model (Richardson)** — Level 0~3. Level 0은 단일 endpoint POST, Level 3은 HATEOAS. 페이로드 포맷이 Level에 따라 다름.

###### 자유도 부여 시 가능한 변형

```javascript
serialize: {
    POST: (ctx) => ({
        body: JSON.stringify({ data: ctx.target }), // envelope
        headers: {}
    }),
    PUT: (ctx) => ({
        body: JSON.stringify(ctx.target), // 전체 객체
        headers: {}
    })
}
```

##### 자유도 (4) — 메서드별 헤더

###### 현재 동작

```javascript
// ApiHandler._fetch() 내부 (현재)
headers = {
    'Content-Type': 'application/json',
    ...(MUTATING_METHODS.has(method) ? csrfHeaders : {}),
    ...(idempotent ? idempotencyHeaders : {})
};
```

`Content-Type`이 항상 `application/json`. PATCH 페이로드가 RFC 6902여도 `application/json-patch+json`이 아님.

###### 학습 출처와 접한 내용

- **RFC 6902 권장 Content-Type** — `application/json-patch+json`. 라이브러리들이 종종 이를 누락.
- **RFC 7396 권장 Content-Type** — `application/merge-patch+json`.
- **JSON:API 권장 Content-Type** — `application/vnd.api+json`.
- **백엔드의 Content-Type 검증** — Spring `@PatchMapping`은 Content-Type으로 페이로드 포맷을 추론. 잘못된 Content-Type이면 415 Unsupported Media Type 반환.

###### 자유도 부여 시 가능한 변형

```javascript
serialize: {
    PATCH: (ctx) => ({
        body: JSON.stringify(ctx.changeLog),
        headers: { 'Content-Type': 'application/json-patch+json' }
    })
}

// 또는 사용자 정의 헤더 추가
const customStrategy = composeStrategy({
    serialize: {
        PATCH: (ctx) => ({
            body: ...,
            headers: {
                'Content-Type': 'application/json-patch+json',
                'X-API-Version': 'v2',
                'X-Tenant-Id': getTenantId()
            }
        })
    }
});
```

##### 자유도 (5) — URL 변형

###### 현재 동작

```javascript
// DomainState.save() 내부 (현재)
const url = buildURL(handler._urlConfig, requestPath);
handler._fetch(url, { method, body });
```

URL 그대로 사용. 메서드와 무관.

###### 학습 출처와 접한 내용

- **한국 SI URL 패턴** — `/api/user/update`, `/api/user/insert`, `/api/user/delete`. 메서드 대신 URL suffix로 액션을 구분.
- **HTTP method override** — `X-HTTP-Method-Override: PATCH` 헤더로 POST를 PATCH처럼 처리. 일부 백엔드(특히 폐쇄망 환경)에서 PATCH를 차단할 때 우회 패턴.
- **RPC over REST** — `/api/users/1/update`처럼 명시적 액션. RESTful 위반이지만 보편적.

###### 자유도 부여 시 가능한 변형

```javascript
serialize: {
    POST: (ctx) => ({
        body: ...,
        url: '/api/user/update', // URL 변형
        headers: {}
    })
}

// 또는 method override
serialize: {
    PATCH: (ctx) => ({
        method: 'POST', // 실제로 보내는 메서드 변경
        body: ...,
        headers: { 'X-HTTP-Method-Override': 'PATCH' }
    })
}
```

##### 자유도 (6) — 응답 파싱

###### 현재 동작

```javascript
// ApiHandler._fetch() 내부 (현재)
const text = await res.text();
return text || null;
```

응답 본문을 그대로 반환. 사용자가 직접 JSON.parse 해야 함.

###### 학습 출처와 접한 내용

- **JSON:API 응답** — `{"data": {...}, "included": [...], "meta": {}}`. data만 추출하려면 `response.data`로 unwrap.
- **자체 envelope** — `{"success": true, "data": {...}, "errors": null}` 같은 패턴이 보편적.
- **Rails 응답** — `{"user": {...}}`. 리소스 명으로 wrap.
- **백엔드 응답 형식 다양성** — 사용자가 매번 unwrap 코드를 작성하는 부담.

###### 자유도 부여 시 가능한 변형

```javascript
parseResponse: (method, response) => {
    const json = JSON.parse(response);
    return json.data; // envelope unwrap
}

// 또는 메서드별 다른 파싱
parseResponse: (method, response) => {
    const json = JSON.parse(response);
    if (method === 'POST') return json.data; // 새 리소스
    if (method === 'PATCH') return null;     // 빈 응답
    return json;
}
```

##### 종합 — 6개 자유도의 독립성

각 자유도는 독립적이며, 한 차원만 풀고 나머지를 강제하면 진짜 자유가 아니다.

예를 들어 envelope을 쓰는 백엔드(`{"data": {...}}` 응답)에서 PATCH 포맷만 자유롭게 만들면, 응답 파싱(`response.data`)이 강제되어 절반의 시장만 잡힌다.

또 다른 예: PATCH 포맷과 헤더는 자유롭지만 메서드 분기 로직(dirtyRatio >= 0.7 → PUT)이 강제되면, 한국 SI(POST-only) 사용자는 라이브러리를 쓸 수 없다.

#### 결정 또는 미룬 이유

**6개 자유도 모두를 풀어주는 방향으로 결정.**

동시에 core의 5가지 핵심 자산은 보존해야 한다는 제약을 명시했다:

1. **Proxy 변경 추적 + changeLog + dirtyFields** — 직렬화 전 단계의 표준 내부 표현. 모든 strategy의 입력. 형식: `{ op: 'add'|'replace'|'remove', path: '/...', oldValue?, newValue? }[]`
2. **structuredClone 기반 4종 상태 스냅샷 + 롤백** — `_rollback()`이 메서드/포맷과 무관하게 동작해야 함. data + changeLog + dirtyFields + isNew의 원자적 복원.
3. **Microtask 배칭 + Shadow State** — 변경 감지 메커니즘. `_scheduleFlush()`가 strategy와 무관.
4. **Idempotency-Key 생명주기** — 메서드와 무관 (POST/PATCH/PUT 모두 적용 가능). UUID 발급/재사용/초기화.
5. **Lazy mode + LCS deep diff** — 변경 추적 모드. `trackingMode === 'lazy'` 시 deepDiff 결과가 changeLog로 변환.

이 자산들은 **L1 (변경 추적 엔진)**으로 묶이고, 자유도가 풀리는 영역은 **L2 (직렬화) + L3 (라우팅) + L4 (전송)**이라는 레이어 분리가 도출되었다.

```
L1 — 변경 추적 (불변)        Proxy → changeLog → dirtyFields
                                ↓
L2 — Serialize (자유)         strategy.serialize(method, ctx) → { body, headers, url? }
                                ↓
L3 — Decide (자유)            strategy.decide(ctx) → method
                                ↓
L4 — Transport (이미 있음)    ApiHandler._fetch
                                ↓
응답
                                ↓
L4' — Parse Response (자유)   strategy.parseResponse(method, response) → parsed
```

이 분리가 가능하다는 것이 본 사이클의 가장 큰 발견이다. **"변경 추적은 표준 내부 포맷, 직렬화는 자유"**라는 메시지가 성립한다.

이 메시지는 다른 라이브러리에서 부분적으로만 구현되었다:
- Immer는 변경 추적은 있지만 직렬화 자유 없음.
- TanStack Query는 mutationFn으로 직렬화 자유 있지만 변경 추적 없음.
- 본 라이브러리는 두 가지를 모두 통합.

---

### Sub-topic 6: Save Strategy 인터페이스 옵션 검토

#### 발단

§5에서 6개 자유도를 풀어주기로 결정한 뒤, 이를 어떤 형태의 API로 노출할지 결정이 필요했다. 사용자가 자기 백엔드 컨벤션을 라이브러리에 알려주는 방식이 학습 곡선과 사용성을 결정한다.

이 결정은 strategy 패턴의 다양한 구현 방식 중 어느 것이 본 라이브러리의 다른 설계 결정(특히 §2의 어댑터 함수화, V8 Hidden Class 친화성)과 일관되는지를 묻는다.

#### 수집한 선택지와 그 이유

##### Option α — 옵션 객체 트리

###### 학습 출처와 접한 내용

- **Axios 설정 객체** — `axios({ method, url, data, headers, transformRequest, transformResponse })` 형식. 깊은 옵션 트리. 학습 비용 낮으나 재사용 어려움.
- **React Query의 queryClient 설정** — `new QueryClient({ defaultOptions: { queries: { staleTime, ... }, mutations: { ... } } })`. 깊은 옵션 트리.
- **Webpack 설정** — 매우 깊은 옵션 트리. 사용자가 흔히 헷갈림. webpack-merge 같은 헬퍼 라이브러리가 등장한 이유.
- **JSON Schema 기반 검증의 한계** — 깊은 객체에 대한 IDE 자동완성은 TypeScript 정의가 매우 정교해야 작동. 그렇지 않으면 옵션 키를 외워야 함.

###### 기술적 정의

```javascript
const api = new ApiHandler({
    host: 'localhost:8080',
    save: {
        decide: ({ isNew, dirtyRatio }) =>
            isNew ? 'POST' : dirtyRatio > 0.7 ? 'PUT' : 'PATCH',
        serialize: {
            POST:  ({ target }) => ({ body: target }),
            PATCH: ({ changeLog }) => ({
                body: changeLog,
                headers: { 'Content-Type': 'application/json-patch+json' }
            }),
            PUT:   ({ target }) => ({ body: target })
        },
        parseResponse: (method, response) => JSON.parse(response).data
    }
});
```

###### 본 라이브러리에 적용했을 때의 형태

ApiHandler 옵션 객체 안에 `save` 키로 깊이 들어감. 사용자가 옵션 객체 전체를 매번 정의해야 함.

###### 검토한 한계

깊은 옵션 트리는 IDE 자동완성/타입 체킹이 어렵다. TypeScript 타입 정의가 매우 정교해야 자동완성이 작동하며, 사용자가 옵션 키 이름을 외워야 한다.

또한 재사용 단위가 명확하지 않다. 다른 ApiHandler 인스턴스에서 같은 컨벤션을 재사용하려면 옵션 객체를 통째로 복사하거나 spread해야 한다.

```javascript
// 재사용 부담
const myConvention = {
    decide: ...,
    serialize: { ... },
    parseResponse: ...
};

const api1 = new ApiHandler({ host: '...', save: myConvention });
const api2 = new ApiHandler({ host: '...', save: { ...myConvention, parseResponse: customParse } });
```

##### Option β — Strategy 클래스 인터페이스

###### 학습 출처와 접한 내용

- **GoF Strategy Pattern (Design Patterns: Elements of Reusable Object-Oriented Software, 1994)** — 알고리즘을 캡슐화한 클래스. Context가 Strategy 인터페이스를 받아 알고리즘을 위임. 객체지향 설계의 고전.
- **Java Spring의 Strategy 인터페이스** — `interface PasswordEncoder { String encode(String); boolean matches(...) }`. 빌트인 구현(`BCryptPasswordEncoder`, `Pbkdf2PasswordEncoder` 등) 제공. 사용자가 자체 구현 가능.
- **Java EE의 Filter 패턴** — `interface Filter { void doFilter(...) }`. Servlet 컨테이너가 호출.
- **Apollo Link의 클래스 기반 미들웨어** — `class HttpLink extends ApolloLink { request(operation) {...} }`. extends로 자체 미들웨어 작성.

###### 기술적 정의

```javascript
class SaveStrategy {
    decide({ isNew, dirtyFields, totalFields, changeLog, target }) {
        throw new Error('SaveStrategy.decide() must be implemented');
    }
    serialize(method, { target, changeLog, dirtyFields }) {
        throw new Error('SaveStrategy.serialize() must be implemented');
    }
    parseResponse(method, response) {
        return JSON.parse(response); // default
    }
}

class Rfc6902Strategy extends SaveStrategy {
    decide({ isNew, dirtyFields, totalFields }) {
        if (isNew) return 'POST';
        return (dirtyFields.size / totalFields) >= 0.7 ? 'PUT' : 'PATCH';
    }
    serialize(method, { target, changeLog }) {
        if (method === 'PATCH') {
            return {
                body: JSON.stringify(changeLog),
                headers: { 'Content-Type': 'application/json-patch+json' }
            };
        }
        return { body: JSON.stringify(target), headers: {} };
    }
}

class MergePatchStrategy extends SaveStrategy { /* ... */ }
class FullPutStrategy extends SaveStrategy { /* ... */ }
class PostOnlyStrategy extends SaveStrategy { /* ... */ }

const api = new ApiHandler({ host: '...', strategy: new Rfc6902Strategy() });
```

###### 본 라이브러리에 적용했을 때의 형태

빌트인 프리셋이 모두 클래스. 사용자 정의는 `class extends SaveStrategy`로. 인스턴스를 ApiHandler 옵션으로 주입.

###### 검토한 한계

클래스 문법 부담 — 함수형 선호 사용자에게 클래스가 무겁게 느껴짐. JavaScript는 클래스가 prototype 기반의 syntactic sugar라 진정한 OOP가 아니지만, 사용자 정의 시 `extends`/`super` 등을 사용해야 함.

Option B(어댑터 함수화)와 패러다임 불일치. 라이브러리 안에서 어댑터는 함수, strategy는 클래스라는 두 가지 패러다임이 공존하면 학습 부담이 두 배가 된다.

또한 V8 측면에서 클래스 인스턴스는 함수보다 약간 무겁다. Hidden Class 생성 비용 + prototype 체인 lookup.

```javascript
// 매번 인스턴스 생성 비용
const api1 = new ApiHandler({ strategy: new Rfc6902Strategy() }); // 인스턴스 1
const api2 = new ApiHandler({ strategy: new Rfc6902Strategy() }); // 인스턴스 2 (다른 객체)
```

##### Option γ — 함수형 빌더 + 빌트인 프리셋

###### 학습 출처와 접한 내용

- **TanStack Query의 mutationFn 패턴** — `useMutation({ mutationFn: async (variables) => fetch(...) })`. mutation 로직 자체를 함수로 받아 사용자 자유도 부여. 단순하고 강력한 패턴.
- **Apollo Link의 함수 기반 미들웨어** — `new ApolloLink((operation, forward) => { ... return forward(operation); })`. 미들웨어가 함수.
- **Redux Toolkit의 createSlice + createReducer** — slice는 함수 호출 결과로 생성된 객체. 함수형 빌더 패턴.
- **Ramda, lodash/fp의 함수 합성** — `R.compose(f, g, h)(x)`처럼 작은 함수를 조합. JavaScript 함수형 프로그래밍의 표준.
- **Koa middleware compose** — `koa.use(async (ctx, next) => { ... await next(); })`. 함수가 미들웨어.
- **Zod의 schema 빌더** — `z.object({ name: z.string() })`. 함수 호출로 schema 생성.
- **Effect-TS의 service pattern** — Effect 생태계는 함수형 합성을 핵심에 둠. 클래스 거의 없음.

이 모든 패턴의 공통점: **작은 함수를 조합해 큰 동작을 만든다. 클래스의 무게 없이 재사용 가능.**

###### 기술적 정의

```javascript
// 빌트인 프리셋 (모두 함수)
import { strategies, composeStrategy } from '@2davi/rest-dsm';

// 사용 1: 빌트인 프리셋 직접 사용
const api1 = new ApiHandler({
    host: '...',
    strategy: strategies.rfc6902()
});

// 사용 2: 빌트인 프리셋의 일부만 변경 (composeStrategy)
const api2 = new ApiHandler({
    host: '...',
    strategy: composeStrategy({
        ...strategies.rfc6902(),
        parseResponse: (method, response) => JSON.parse(response).data
    })
});

// 사용 3: 사용자 정의 strategy
const api3 = new ApiHandler({
    host: '...',
    strategy: composeStrategy({
        decide: () => 'POST', // 한국 SI
        serialize: {
            POST: ({ target, changeLog }) => ({
                body: JSON.stringify({
                    method: 'update',
                    payload: target,
                    diff: changeLog
                }),
                headers: { 'X-Action': 'mutate' }
            })
        }
    })
});
```

내부 구현:

```javascript
// strategies.js
export const strategies = {
    rfc6902: () => ({
        decide: ({ isNew, dirtyFields, totalFields }) => {
            if (isNew) return 'POST';
            const ratio = dirtyFields.size / totalFields;
            return ratio >= 0.7 ? 'PUT' : 'PATCH';
        },
        serialize: (method, { target, changeLog }) => {
            if (method === 'PATCH') {
                return {
                    body: JSON.stringify(changeLog),
                    headers: { 'Content-Type': 'application/json-patch+json' }
                };
            }
            return {
                body: JSON.stringify(target),
                headers: { 'Content-Type': 'application/json' }
            };
        },
        parseResponse: (method, response) => JSON.parse(response)
    }),

    mergePatch: () => ({ /* ... */ }),
    fullPut: () => ({ /* ... */ }),
    postOnly: () => ({ /* ... */ }),
    jsonApi: () => ({ /* ... */ }),
    envelope: ({ wrap, unwrap }) => ({ /* ... */ })
};

export function composeStrategy(spec) {
    const defaults = strategies.rfc6902();
    return {
        decide: spec.decide ?? defaults.decide,
        serialize: spec.serialize
            ? (method, ctx) => {
                if (typeof spec.serialize === 'function') return spec.serialize(method, ctx);
                if (spec.serialize[method]) return spec.serialize[method](ctx);
                return defaults.serialize(method, ctx);
            }
            : defaults.serialize,
        parseResponse: spec.parseResponse ?? defaults.parseResponse
    };
}
```

###### 본 라이브러리에 적용했을 때의 형태

ApiHandler 옵션에 `strategy` 키 하나. 빌트인 프리셋은 함수 호출(`strategies.rfc6902()`). 사용자 정의는 `composeStrategy({ ... })`로 부분 오버라이드.

Tree-shaking 효과:

```javascript
// 사용자가 RFC 6902만 import
import { strategies } from '@2davi/rest-dsm';
const s = strategies.rfc6902();
// → 번들에 mergePatch, fullPut 등은 포함되지 않음 (rollup tree-shaking)
```

###### 검토한 한계

학습 곡선 — composeStrategy의 의미를 이해하려면 함수 합성 사고 필요. 그러나 빌트인 프리셋만 직접 사용하는 사용자(README의 첫 예시)는 학습 곡선 없음. composeStrategy는 고급 사용자만 접함.

타입 추론은 TypeScript 정의가 정교해야 작동. `composeStrategy<TStrategy>` 같은 generic으로 빌트인의 타입을 보존해야 함.

#### 결정 또는 미룬 이유

**Option γ 채택.**

근거는 두 가지다.

첫째, Option B(어댑터 함수화)와 동일한 함수형 정신을 유지한다. 라이브러리 안에 두 패러다임이 섞이지 않는다. 클래스(Option β)와 함수(어댑터)가 공존하면 학습 부담이 두 배가 된다. TanStack Query, Apollo Link, Redux Toolkit, Zustand, Jotai, Vue 3 reactivity 등 모던 라이브러리가 모두 함수형 빌더 패턴을 채택했다는 사실도 시장 학습 곡선과의 일관성을 의미한다.

둘째, Tree-shaking 친화성이다. 사용자가 import한 프리셋만 번들에 포함되므로 빌트인을 6~7개로 늘려도 번들 크기 부담이 비선형 증가하지 않는다. 클래스(Option β)의 경우 빌트인 클래스가 모두 export되어 있으면 사용자가 import한 클래스만 사용해도 다른 클래스가 번들에 포함될 수 있음 (rollup의 클래스 tree-shaking은 함수보다 보수적).

인터페이스 시그니처의 정확한 형태(ctx 객체 필드 셋, serialize/decide 함수 시그니처)는 본 CDR이 아닌 별도 ADR(ADR-0002)에서 결정된다. 본 CDR에서는 "함수형 빌더 + 빌트인 프리셋" 패턴 자체에 대한 합의만 기록.

또한 `parseResponse`는 strategy 객체의 한 필드로 통합한다. 별도 모듈이나 별도 옵션이 아니라 strategy 컨벤션의 양면(요청 직렬화 + 응답 파싱)이 한 strategy에 묶이도록.

---

### Sub-topic 7: 가치 명제의 최종 진화

#### 발단

§5와 §6의 결정을 거친 후 라이브러리의 메시지가 어떻게 변하는지 정리해야 했다. 가치 명제가 명확해야 README 첫 문장과 영문화 메시지가 결정 가능하다.

가치 명제는 라이브러리의 정체성을 한 문장으로 압축하는 것이다. 본 사이클이 진행되면서 가치 명제 후보가 진화했다.

#### 수집한 선택지와 그 이유

##### Candidate 1 — 현재 (v1.2.4)

> "RFC 6902로 자동 분기되는 REST 상태 관리자"

###### 학습 출처와 접한 내용

이 메시지는 v1.0.0 시점에 PORTFOLIO에서 강조된 기술적 자산을 그대로 메시지화한 것. RFC 6902가 본 라이브러리의 핵심 차별화 포인트라는 인식.

###### 한계

"RFC 6902"가 메시지에 박혀 있어 백엔드 종속성이 시장 진입을 좁힘. RFC 6902를 받지 못하는 백엔드의 프론트엔드 개발자는 이 메시지에서 즉시 이탈.

또한 "REST 상태 관리자"라는 표현이 모호. TanStack Query, SWR, Valtio 등도 모두 "상태 관리자"이며 차별화 약함.

##### Candidate 2 — Option B 채택 후

> "REST 리소스를 동기화 단위로 다루는 framework-agnostic 엔진"

###### 학습 출처와 접한 내용

- **MobX의 framework-agnostic 메시지** — "Simple, scalable state management". 어떤 framework인지 명시하지 않음.
- **Vue 3 reactivity 패키지의 framework-agnostic 분리** — `@vue/reactivity`가 Vue와 별개로 사용 가능.
- **Zustand의 minimal 메시지** — "small, fast and scalable bearbones state-management solution".

이들은 framework-agnostic 정체성을 강조해 어댑터 동등성을 어필.

###### 한계

"RFC 6902"는 빠졌지만 여전히 직렬화 형식 강제 의미가 남음. "동기화 단위"라는 표현이 추상적 — 실제 가치를 즉시 전달하지 못함. 

또한 "framework-agnostic"이 차별화로 작용하려면 모든 어댑터가 1급 시민이어야 한다는 신뢰가 필요. 본 라이브러리는 어댑터 격리를 막 결정한 시점이라 신뢰 축적 시간이 부족.

##### Candidate 3 — Save Strategy 도입 후 (목표)

> "변경은 자동 추적된다. 저장 방식은 당신이 정한다."

###### 학습 출처와 접한 내용

- **TanStack Query의 메시지 패턴 분석** — "Powerful asynchronous state management". 동사형 + 결과 강조.
- **GraphQL의 메시지 패턴** — "A query language for your API". 짧고 명확. 소유관계("your API") 명시.
- **Tailwind CSS의 자유도 메시지** — "Rapidly build modern websites without ever leaving your HTML". 자유와 통제의 균형.
- **Stripe API의 메시지** — "The new standard in online payments". 신뢰 + 명확한 영역.

위 사례들의 공통점: 짧은 두 문장 또는 한 문장으로 가치를 압축하되, **"무엇이 자동이고 무엇이 사용자 통제인가"**를 명확히 구분.

###### 본 메시지의 강점

- **"자동"과 "통제"가 한 문장에 공존** — 두 가치가 모순 없이 양립한다는 점이 라이브러리의 차별화.
- **백엔드 종속성이 메시지에서 사라짐** — RFC 6902, JSON Patch, PATCH 같은 백엔드 의존 표현이 없음.
- **TanStack Query와 차별화** — TanStack Query는 mutation을 자유롭게 짜지만 변경 추적은 없음. 본 라이브러리는 두 가지를 모두 제공.
- **자기완결적** — 백엔드가 어떤 형식을 받든 라이브러리가 적응. "당신이 정한다"가 그 약속.

###### 한계

추상적이라 즉시 페르소나가 보이지 않음. 그러나 README의 두 번째 문단에서 어댑터별 사용 예시로 페르소나를 자연스럽게 분기.

영문 번역 시 "Change tracking is automated. Serialization is up to you." 같은 형태가 가능. 영문에서도 강력한 메시지.

#### 결정 또는 미룬 이유

**Candidate 3 채택.**

"변경 자동 추적 + 저장 자유"의 조합은 시장에 비어 있는 가치 명제이며, 본 라이브러리의 차별화 위치를 가장 명료하게 표현한다.

이 메시지가 README, PORTFOLIO, NPM description, package.json description에 일관되게 반영되는 것이 본 CDR의 Settled 조건 중 하나다.

영문화는 ROADMAP Phase 6에서 본 메시지를 1:1 번역하는 형태로 진행. 메시지가 한국어/영어 모두 강력해야 글로벌 진입이 가능.

---

### Sub-topic 8: ADR 작성 순서 결정

#### 발단

본 사이클에서 6개의 단위 결정이 도출됨이 확인되었다 (인터페이스 시그니처, 시장 조사, lazy 호환성, idempotency 위치, adapter 격리, 포지셔닝 메시지). 어떤 순서로 ADR을 작성할지 의존성 분석이 필요했다.

작성 순서는 단순한 작업 순서가 아니다. 각 ADR이 다른 ADR의 입력 데이터로 작용하므로, 의존성을 무시하면 후속 ADR이 임의적 결정에 빠진다.

#### 수집한 선택지와 그 이유

##### Option A — 시장 조사를 첫 ADR

###### 학습 출처와 접한 내용

- **API 설계의 "use cases first" 원칙** — Joshua Bloch의 "How to Design a Good API and Why It Matters" (Google Tech Talk, 2007)에서 강조. API를 설계하기 전에 "이 API로 무엇을 할 것인가"의 use case를 먼저 수집.
- **"Outside-in design"** — TDD의 outside-in 접근. 외부 사용자 시나리오 → 내부 구현. 시장 조사가 외부 시나리오에 해당.
- **Strategy Pattern 구현 시의 빌트인 우선** — Spring Security의 PasswordEncoder, Jackson의 ObjectMapper 등 strategy 패턴을 채택한 라이브러리들은 빌트인 구현을 먼저 결정한 뒤 인터페이스 추상화.

###### 기술적 정의

작성 순서: ADR-0001(시장 조사) → ADR-0002(인터페이스) → ADR-0003, ADR-0004 (병렬 가능) → ADR-0005 → ADR-0006.

각 ADR의 의존:
- ADR-0001 (시장 조사): 입력 없음. 독립.
- ADR-0002 (인터페이스): ADR-0001의 빌트인 6종을 모두 표현 가능한 형태여야 함.
- ADR-0003 (lazy 호환): ADR-0002의 인터페이스가 lazy mode의 deepDiff 결과를 입력으로 받을 때 호환 가능한지.
- ADR-0004 (idempotency 위치): ADR-0002의 인터페이스에 idempotency가 strategy 내부인지 외부인지.
- ADR-0005 (adapter 격리): 독립. 본 사이클의 §2 결정의 구현.
- ADR-0006 (포지셔닝): 모든 결정이 끝난 후 메시지 정리.

###### 본 라이브러리에 적용했을 때의 형태

ADR-0001이 "12종 컨벤션 → 6종 빌트인" 결정을 담는다. 이 결과가 ADR-0002의 입력 데이터.

ADR-0002의 ctx 객체 필드 셋, serialize/decide/parseResponse 함수 시그니처가 6종 빌트인을 모두 표현 가능한 형태로 설계됨.

ADR-0003은 lazy mode의 deepDiff 결과(changeLog 형식)가 strategy.serialize의 ctx에 들어갔을 때 형식 충돌이 없는지 분석.

ADR-0004는 idempotency를 strategy 내부에 둘지 외부 ApiHandler 옵션으로 둘지 비교.

ADR-0005는 §2의 Option B 결정의 코드 구현 결정 (subpath exports 구조, package.json 변경).

ADR-0006은 §7의 메시지 결정의 README/PORTFOLIO 적용.

###### 검토한 한계

ADR-0001 작성 시간이 큼 (12종 컨벤션 조사). 그러나 이 시간은 후속 ADR의 임의성을 줄이는 비용이다. 시장 조사 없이 인터페이스를 먼저 결정하면, "이 인터페이스로 어떤 컨벤션을 표현할 수 있는가"의 검증이 사후로 미뤄진다.

##### Option B — 인터페이스 시그니처를 첫 ADR

###### 학습 출처와 접한 내용

- **"Inside-out design" 사례** — 일부 라이브러리는 내부 인터페이스를 먼저 결정한 뒤 외부 사례로 검증. 그러나 이는 도메인이 잘 알려진 경우(예: HTTP 클라이언트)에 적합.
- **API-first vs Code-first 논쟁** — OpenAPI 진영의 API-first 접근. 인터페이스를 먼저 정의하면 구현 자유도 높음. 그러나 인터페이스 자체가 잘못 설계되면 구현이 왜곡됨.

###### 기술적 정의

작성 순서: ADR-0002(인터페이스) → ADR-0001(시장 조사) → ADR-0003, 0004 → ADR-0005 → ADR-0006.

###### 본 라이브러리에 적용했을 때의 형태

인터페이스 시그니처를 먼저 결정하면 후속 시장 조사가 "이 인터페이스로 12종을 모두 표현 가능한가"의 검증이 됨.

###### 검토한 한계

인터페이스 설계 시점에 "어떤 컨벤션들을 지원해야 하는가"의 입력이 없으면 ctx 객체 필드 셋이 임의적으로 결정될 위험. 예를 들어 `ctx = { target, changeLog }`로 정해놓고 시장 조사를 했을 때 envelope 패턴이 `dirtyFields.size`를 필요로 한다면 ctx를 다시 확장해야 함.

이는 인터페이스 → 시장 조사 → 인터페이스 수정의 반복을 야기하므로 결국 시장 조사를 먼저 하는 게 효율적.

#### 결정 또는 미룬 이유

**Option A 채택 (시장 조사를 ADR-0001).**

인터페이스 시그니처를 결정하려면 "이 인터페이스로 어떤 컨벤션들을 모두 표현해야 하는가"의 입력이 필요하다. 시장 조사가 그 입력을 제공한다. 즉 ADR-0001(시장 조사) → ADR-0002(인터페이스)의 의존 방향이 자연스럽다. lazy 호환성(ADR-0003)과 idempotency 위치(ADR-0004)는 인터페이스 시그니처에 종속되므로 그 다음에 작성한다.

작성 순서: ADR-0001 → ADR-0002 → ADR-0003, ADR-0004 (병렬 가능) → ADR-0005 → ADR-0006.

---

### Sub-topic 9: 의사결정 기록 양식 정형화

#### 발단

ADR 작성에 들어가기 전, 기존 references/ 디렉토리의 "ARD" 명칭이 표준인지 점검이 필요했다. 표준은 ADR(Architecture Decision Record)이며, ARD는 일반적으로 Architectural Requirements Document를 의미하므로 명칭이 어긋난다는 점이 인지되었다. 또한 기존 ard-XXXX-alignment.md의 양식 자체가 단위 결정 기록과 다른 장르라는 점도 확인되었다.

이 sub-topic은 명칭 문제와 양식 문제를 모두 다룬다.

#### 수집한 선택지와 그 이유

##### Option A — 기존 ARD 명칭 유지, 양식만 보강

###### 학습 출처와 접한 내용

- **ThoughtWorks의 ADR 가이드** — Michael Nygard의 원전 ADR 양식(2011 article)을 표준으로 인정. ARD와 명백히 구분.
- **MADR (Markdown ADR) 0.5 spec** — `https://adr.github.io/madr/`. ADR의 markdown 양식 표준화. Status, Context, Decision Drivers, Considered Options, Decision Outcome, Pros and Cons, Consequences, Links 섹션 정의.
- **AWS Prescriptive Guidance — Architectural Decision Records** — ADR이 단위 결정 기록임을 명시.
- **Architectural Requirements Document(ARD)의 실제 의미** — 시스템의 비기능 요구사항(성능, 보안, 가용성)을 정리한 문서. ADR과 다른 장르.

기존 ard-XXXX-alignment.md를 분석하면:
- ard-0001-alignment: 한 사이클의 다중 결정 + 회고 + 학습 정리
- ard-0002-alignment: 동일
- ard-0003-alignment: 동일

이 형식은 ADR도 ARD도 아닌 "사이클 회고 + 의사결정 모음" 장르.

###### 기술적 정의

명칭은 ARD 그대로 유지. 본문에 Status/Considered Options 섹션을 추가하는 방식.

###### 본 라이브러리에 적용했을 때의 형태

기존 4편의 ard-XXXX 양식을 그대로 두고 신규 사이클도 같은 양식으로 작성. 단, Status와 Considered Options 섹션이 추가됨.

###### 검토한 한계

표준 용어 오용은 평가 시 부정적 시그널. 평가자가 "ARD"를 보고 "이 사람이 ADR을 ARD로 잘못 부르는구나"라고 인식하면 기술 용어 정확성에 의문 제기.

또한 한 문서에 여러 결정이 묶이는 기존 양식은 단위 추적성이 약하다. ADR-0042 같은 단위 검색 불가능.

##### Option B — 모두 표준 ADR로 통일

###### 학습 출처와 접한 내용

- **MADR 0.5 spec의 단위 결정 원칙** — 한 ADR = 한 결정. 작고 추적 가능.
- **Joel Parker Henderson의 ADR-template GitHub 저장소** — 1만+ Star. 표준 ADR 양식의 사실상 reference.
- **Spotify ADR 도입 사례** — Spotify가 internal blog에서 ADR을 단위 결정 기록으로 사용한다고 발표. 모든 결정 1건당 1문서.
- **Microsoft Azure ADR 가이드** — Azure 아키텍처 결정에 MADR 양식 사용.

###### 기술적 정의

기존 ard-XXXX를 ADR 양식으로 변환(rename + 본문 분해). 단위 결정 1건당 1문서. 사이클 회고는 별도로 작성하지 않거나 commit message에서만 언급.

###### 본 라이브러리에 적용했을 때의 형태

```
references/
└── decisions/
    ├── adr-0001-rfc-6902-payload.md         (구 ard-0001의 일부)
    ├── adr-0002-domain-vo-shape.md          (구 ard-0001의 일부)
    ├── adr-0003-microtask-batching.md       (구 ard-0001의 일부)
    ├── ...
    └── adr-NNNN-save-strategy.md            (신규)
```

기존 4편을 분해하여 여러 단위 ADR로 재구성.

###### 검토한 한계

기존 4편의 사이클 회고를 분해하면 회고로서의 가치가 손실됨. ard-0001-alignment.md의 가치는 "v1.0.0 사이클이 어떤 학습을 통해 어떤 결정으로 수렴했는가"의 narrative이며, 이를 단위 ADR로 분해하면 narrative가 사라짐.

또한 rename 작업도 부담. 4편의 alignment 문서 + 그 안의 sub-document들을 모두 재구성해야 함. git history도 복잡.

##### Option C — 두 장르 분리

###### 학습 출처와 접한 내용

- **OSS 프로젝트의 다층 문서 구조 사례** — 큰 프로젝트(React, Vue, Rust)는 RFC, ADR, 회고, 가이드를 각각 별도 디렉토리로 분리. 한 디렉토리에 섞지 않음.
- **Rust RFC 프로세스** — `rfcs/` 디렉토리에 단위 RFC. 회고는 별도 blog post.
- **React RFCs** — `react/rfcs/` 디렉토리. 단위 RFC 1건당 문서 1건.
- **CNCF의 KEP (Kubernetes Enhancement Proposal)** — `kep-NNNN-*.md` 단위 결정. 회고는 retrospective 디렉토리.
- **MADR과 회고 문서의 공존** — 일부 프로젝트는 ADR 외에 "engineering retrospective" 문서를 별도로 운영.

이 사례들의 공통점: **장르가 다른 문서는 디렉토리로 분리. 명칭도 다르게 부여.**

###### 기술적 정의

기존 ard-XXXX는 "사이클 회고" 장르로 보존(rename 안 함). 신규 단위 결정은 ADR(MADR 0.5)로. 사이클 회고 장르의 신규 명칭은 CDR(Cycle Discussion Record)로.

```
references/
├── cycles/
│   ├── README.md (CDR 인덱스 + ARD 보존 안내)
│   ├── CDR_TEMPLATE.md
│   ├── ard-0000-alignment.md      ← 보존
│   ├── ard-0001-alignment.md      ← 보존
│   ├── ard-0002-alignment.md      ← 보존
│   ├── ard-0003-alignment.md      ← 보존
│   └── cdr-0001-save-strategy-pivot.md  ← 신규
│
└── decisions/
    ├── README.md
    ├── ADR_TEMPLATE.md
    └── adr-0001-payload-conventions-survey.md
```

###### 본 라이브러리에 적용했을 때의 형태

명명 진화 자체가 저장소의 역사적 자산으로 남는다. 평가자가 보면 "저장소가 시간에 따라 어떻게 진화했는가"의 흔적이 그대로 보임.

신규 사이클(CDR-0001)부터 ADR/CDR 분리. 단위 결정은 ADR (짧음, 1~3p), 사이클 회고는 CDR (길음, 학습 정리 포함).

###### 검토한 한계

두 장르가 공존해서 명명 규칙을 학습해야 함. 그러나 README.md에서 한 단락으로 안내 가능.

또한 CDR이라는 신규 명칭은 표준이 아님 (ADR은 표준). 그러나 본 라이브러리가 사용하는 양식은 명확히 정의되어 있고, 평가자가 README를 읽으면 이해 가능.

###### 추가로 정해진 양식 세부 지침

본 sub-topic 진행 중에 양식에 대한 두 가지 세부 지침이 정해졌다:

1. **CDR 작성 형식** — 대화 형식의 흔적을 완전히 배제하고 (1) 발단 / (2) 수집한 선택지와 이유 / (3) 결정 또는 미룬 이유의 3단 구조로 작성. 작성 톤은 비기너/주니어 개발자가 학습 정리 노트를 만들듯 구체적이고 세세하게. 각 선택지는 학습 출처(외부 라이브러리, 표준, 학술 자료)를 명시하고 코드 예시를 포함.

2. **이모지 및 시각 장식 금지** — 모든 문서·코드 주석에서 이모지와 별점 같은 시각 장식 금지. 대체 표현은 영단어 CAPITAL CASE (PRO/CON/BENEFIT/CAUTION/NEXT, STRONG_FIT/GOOD_FIT 등).

이 지침들은 본 CDR과 ADR-0001을 즉시 재작성하는 형태로 적용되었다.

#### 결정 또는 미룬 이유

**Option C 채택.**

근거는 두 가지다.

첫째, 기존 4편 ard-XXXX-alignment.md는 사이클 회고 + 다중 결정 묶음이라는 장르적 가치를 가지며, ADR로 강제 변환하면 그 가치가 손실된다. 명명 진화 자체가 저장소의 역사적 자산으로 남는 것이 평가자 시각에서 오히려 시그널이 된다 — "저장소가 시간에 따라 어떻게 진화했는가"를 보여준다.

둘째, 디렉토리 분리(cycles/ + decisions/)가 두 장르의 추적성을 명확하게 한다. 사이클 회고를 찾을 때 cycles/만 보면 되고, 단위 결정을 추적할 때 decisions/만 grep하면 된다.

이 결정에 따라 본 사이클의 첫 외부 산출물로 `chore/docs-cycles-decisions-split` PR이 즉시 진행되었으며, references/cycles/와 references/decisions/ 디렉토리가 신설되었다. CDR_TEMPLATE.md와 ADR_TEMPLATE.md도 본 결정의 일부로 작성되었다.

---

## Outcomes

### 라이브러리 가치 명제의 Pivot

본 사이클의 가장 큰 결정. 라이브러리의 정체성이 변경된다.

| 시점 | 메시지 |
| --- | --- |
| v1.2.4 (사이클 진입 시) | "RFC 6902로 자동 분기되는 REST 상태 관리자" |
| Option B 채택 후 | "REST 리소스를 동기화 단위로 다루는 framework-agnostic 엔진" |
| Save Strategy 도입 후 (목표 메시지) | "변경은 자동 추적된다. 저장 방식은 당신이 정한다." |

이 pivot이 모든 후속 ADR(0001~0006)의 방향성을 결정한다. 본 CDR이 Settled되는 시점은 이 새 메시지가 README, PORTFOLIO, NPM description에 일관되게 반영된 후이다.

### 도출 예정 단위 결정 (ADR)

각 ADR은 본 CDR의 어느 sub-topic(§N)에서 발화했는지 추적 가능하다.

| ADR # | 제목 | Trigger Sub-topic(s) | Status |
| :---: | --- | --- | --- |
| ADR-0001 | Payload Convention 시장 조사 | §5 | Proposed |
| ADR-0002 | Save Strategy 인터페이스 시그니처 | §5, §6 | Pending |
| ADR-0003 | Lazy Mode와 Strategy 호환성 | §6 (open question) | Pending |
| ADR-0004 | Idempotency-Key 위치 분석 | §6 (open question) | Pending |
| ADR-0005 | Adapter 격리 (Option B 패키징) | §2, §3 | Pending |
| ADR-0006 | 라이브러리 포지셔닝 메시지 | §3, §4, §7 | Pending |

§1, §8, §9는 ADR을 직접 도출하지 않는다 — 각각 ROADMAP 작성(외부 산출물), ADR 작성 순서에 대한 메타 결정, 본 사이클의 첫 PR(`chore/docs-cycles-decisions-split`)로 즉시 구현된 양식 결정이다.

각 ADR이 Accepted로 전환될 때 본 CDR의 Outcomes 표 Status를 갱신하고, ADR 본문의 `Related` 필드에 `CDR-0001`을 명시한다.

### 변경된 외부 산출물

본 사이클이 코드/문서에 반영된 흔적:

- references/cycles/, references/decisions/ 디렉토리 신설 — `chore/docs-cycles-decisions-split` PR로 머지 완료.
- CDR_TEMPLATE.md, ADR_TEMPLATE.md 작성 — 본 사이클의 양식 결정의 결과물. §9의 양식 지침에 따라 재작성.

### 결정되지 않은 미해결 질문

본 사이클이 끝나기 전에 확정되어야 할 것:

- 빌트인 프리셋 1차 셋의 정확한 범위 (ADR-0001에서 결정 진행 중).
- Strategy의 parseResponse optional 여부 (ADR-0002에서 결정).
- Idempotency-Key 위치 — 현재 ApiHandler 옵션이지만 strategy 내부로 이동할지 (ADR-0004에서 결정).
- Phase 5(DomainState.js 분리)와 Save Strategy 도입 작업의 통합/분리 여부 (ADR-0006 또는 후속 CDR에서 결정).

---

## Reflections

본 사이클이 In-Progress 상태이므로 회고는 Settled 시점에 작성한다.

사이클 종료 조건: ADR-0001~0006 모두 Accepted 상태 + Save Strategy 구현 완료 + ROADMAP Phase 4c 종료 + 새 가치 명제가 README/PORTFOLIO/NPM description에 일관 반영.

---

## Links

### 직전 사이클
- ard-0003-alignment.md — v1.x 마지막 사이클, "기능 확장 + 전략 전환"

### 본 사이클의 트리거 / 산출물 (저장소 외부, 로컬 관리)
- EVALUATION.md — 외부 평가 보고서 (사이클 트리거)
- ROADMAP.md — 한국어판 개선 로드맵 (사이클 산출물)
- CLAUDE.md — Claude Code 운영 가이드

### 표준 명세
- RFC 6902 — JSON Patch
- RFC 7396 — JSON Merge Patch
- RFC 9110 — HTTP Semantics
- IETF — Idempotency-Key HTTP Header Field (draft)
- MADR 0.5 — Markdown Architecture Decision Records
- Michael Nygard, "Documenting Architecture Decisions" (2011)

### 외부 라이브러리 (학습 출처)
- Immer (immerjs/immer) — Proxy 기반 변경 추적
- Valtio (pmndrs/valtio) — Proxy + React
- MobX (mobxjs/mobx) — 데코레이터 기반 reactivity
- TanStack Query (TanStack/query) — server state, mutation
- SWR (vercel/swr) — server state cache
- Apollo Client — GraphQL cache + mutation
- fast-json-patch (Starcounter-Jack/JSON-Patch) — RFC 6902 직렬화
- Vue 3 reactivity (`@vue/reactivity`) — framework-agnostic core
- Zustand (pmndrs/zustand) — 외부 hook 패턴
- Jotai (pmndrs/jotai) — atom + useAtom 분리
- Redux Toolkit — createSlice + createReducer
- Apollo Link — 함수 기반 미들웨어
- Ramda, lodash/fp — 함수 합성
- Koa middleware — 함수 미들웨어
- Effect-TS — 함수형 합성

### 마케팅/포지셔닝 학습 자료
- Geoffrey Moore, "Crossing the Chasm" — Beachhead market 전략
- April Dunford, "Obviously Awesome" — Product positioning
- Brian Lonsdorf, Kent C. Dodds, Andre Staltz의 OSS 마케팅 강연

### 패턴 학습 자료
- Joshua Bloch, "How to Design a Good API and Why It Matters" (Google Tech Talk, 2007)
- Gang of Four, "Design Patterns" (1994) — Strategy Pattern

### 관련 PR (머지 완료)
- chore/docs-cycles-decisions-split — 디렉토리 마이그레이션 + ADR/CDR 양식 정형화
- docs/cdr-0001-save-strategy-pivot — 본 CDR 작성
- docs/adr-0001-payload-conventions-survey — ADR-0001 작성
