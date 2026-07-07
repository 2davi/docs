# 축2 프롬프트 — EventTarget 기반 (Event Foundation)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 축
**축2 — EventTarget 기반.** 시그널·DOM·스트림 이벤트가 모두 올라타 있는 바닥암반. 여기를 다지면 이후 축이 전부 "이벤트 하나"로 통일되어 보인다.

## 선행 학습 상태 (이전에 정복한 축)
- **코어(AbortController)** ✅ — 특히 "signal은 EventTarget을 상속한다"는 잠금 해제 사실.
- **축1 (수명·정리)** ✅ — `using`/ERM, `Symbol.dispose`/`asyncDispose`, `WeakRef`/`FinalizationRegistry`. (리스너 자동 정리의 언어적 토대.)
- 이번이 **축2**. 이후: 축3 → 축4 → 축5.
- *(직전 축[축1]의 인계 메모를 여기 붙여넣기)*

## 코어와의 연결점
코어에서 "`signal.addEventListener('abort')`가 `button.addEventListener('click')`과 같은 기계"임을 깨달았다. 축2는 그 *기계 자체*로 내려가 EventTarget을 손에 쥔다. 그러면 시그널의 `'abort'`가 왜 그렇게 동작하는지가 근본부터 보인다.

## 이 축의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: signal·DOM·스트림이 다 같은 이벤트 추상 위에 있음을 보면 전부 한 원리로 통합된다.
2. **`EventTarget` 인터페이스**: `addEventListener`/`removeEventListener`/`dispatchEvent` 3종.
3. **직접 상속**: `class X extends EventTarget`으로 커스텀 이벤트 발신자 만들기.
4. **`Event` vs `CustomEvent`**: `detail`로 데이터 싣기, 이벤트 객체 구조.
5. **리스너 옵션 전체**: `capture` / `once` / `passive` / `signal` — 각 의미와 언제 쓰나. (코어의 `{ signal }` 자동 제거를 여기서 재조명.)
6. **이벤트 전파**: capture → target → bubble 단계. (시그널엔 전파가 없지만 DOM 모델 이해용으로 대비.)
7. **한계**: 시그널의 `'abort'`는 전파 없는 일회성 이벤트라는 특수성, EventTarget의 메모리/리스너 모델(코어 GC·축1 정리와 연결).

## 시작 지시
"네가 아는 이벤트는 `element.onclick`이 전부였다"는 출발점에서, **진단 질문 1개**(예: "EventTarget이 뭐고, 버튼·시그널·스트림의 공통 조상은 무엇인가?")로 시작. 채점 후 1번부터.

## 마감
이 축이 끝나면 공통 프롬프트 §6 **"축 마감 점검 의식"**을 실행. 다음 축은 **축3(합성·동시성)**.
