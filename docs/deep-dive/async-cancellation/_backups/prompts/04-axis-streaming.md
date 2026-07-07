# 축4 프롬프트 — 스트림 취소 (Streaming Frontier)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 축
**축4 — 스트림 취소.** `loadImage`가 *이산 자원*의 취소였다면, 이건 *연속 흐름*의 취소 — 같은 문제의 어려운 버전. 네 CMP 폴링·대시보드 같은 연속 데이터에 직결.

## 선행 학습 상태 (이전에 정복한 축)
- **코어(AbortController)** ✅ — 협조적 취소, `loadImage`의 자원 teardown(`img.src=''`) 패턴.
- **축1 (수명·정리)** ✅ — ERM/`using`(스트림 리더의 자동 해제와 연결).
- **축2 (EventTarget 기반)** ✅ — 스트림 이벤트도 결국 EventTarget.
- **축3 (합성·동시성)** ✅ — 결합자·동시성 제한·백프레셔의 사촌.
- 이번이 **축4**. 이후: 축5(캡스톤).
- 「실제로 다룬 것: Promise 결합자 넷의 settle 의미(all=첫reject 단락, allSettled=전원
결판·never reject·결과객체배열, race=첫settle 승자복사, any=첫fulfill·전멸시
AggregateError, all↔any 거울상). 결합자×취소(race타임아웃의 겉보기성 → AbortSignal.timeout
우월 = '소유하는 자만 정리', 형제취소는 공유컨트롤러 fan-out + .catch가 에러삼켜
fulfilled로 되돌리는 함정→throw err 필수). 동시성 제한기 직접 구현(성크(thunk)로 실행봉인,
두 장부 queue+active, Deferred=Promise.withResolvers로 '지금 promise 반환·나중 resolve',
펌프 순환, active±는 실행 시작/종료와 한 몸). cancel-previous(다음 쏘기 전 이전 abort +
버전토큰 사후방어). 자원누수 3층(커넥션/서버작업/메모리콜백) + 증폭3겹(반복성/비가시성/정합성).

핵심 기계 (축4가 딛고 설 바닥): 이벤트 루프 = 콜스택 비면 → 마이크로큐 몽땅 → 매크로 하나 →
반복. resolve()는 실행이 아니라 '큐잉 트리거'. 태스크(콜백 하나)는 run-to-completion으로
안 끊김, 루프는 태스크 경계에서만 개입. setTimeout(,0)도 마이크로에 항상 짐. '동시 관찰'의
실체 = 마이크로태스크 큐 위 인터리빙(물리적 동시 아님). queueMicrotask = 동기보단 늦고
setTimeout보단 이르게.

다음 축(스트림 취소)이 알아야 할 것: ①await의 정체가 정확히 '.then 마이크로태스크
스케줄링'이다 — async 함수는 await에서 중단→마이크로태스크로 재개. 이게 async
이터레이터/제너레이터의 바닥. ②순서보장(ordering) 문제 회수: 동시에 쏘되 결과를 요청
순서로 정렬하는 게 스트림에서 핵심(백프레셔와 얽힘). ③'소유하는 자만 정리한다'가
스트림에서 재등장: ReadableStream의 취소·locked·cancel()이 정확히 소유권 문제. ④결합자는
'전부 모으거나(all/allSettled) 하나 고르거나(race/any)'인데, 스트림은 '흐름을 조각조각
소비'라 결합자로 안 풀리는 새 영역 — 여기서 async 이터레이터가 필요해진다. ⑤열린 실:
마이크로태스크 기아(무한 self-queueing이 렌더링 굶김)가 스트림 처리에서 실제 위험으로 등장 가능.」

## 코어와의 연결점
코어의 "협조적 취소"는 1회성 작업 기준이었다. 축4는 그걸 *흐르는 데이터*로 확장한다 — 청크가 계속 도착하는 와중에 어떻게 협조적으로 멈추고 정리하는가.

## 이 축의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: 무한/대용량 흐름은 "한 번에 받기"가 불가능. 부분 소비·중도 취소·역압이 본질 문제.
2. **async 이터레이터/제너레이터**: `for await...of`, `return()`/`throw()`로 조기 종료, 시그널 주입.
3. **Web Streams**: `ReadableStream`/`WritableStream`/`TransformStream`, `reader.cancel()`, signal 통합.
4. **백프레셔(backpressure)**: `highWaterMark`, pull 기반 흐름 제어, 큐 동작.
5. **fetch 본문 스트리밍**: `response.body`(ReadableStream)를 청크 단위로 읽기 + `abort` 결합.
6. **AbortController와 결합**: 스트림 취소 = 연속판 협조적 취소. 리더 락(locked stream) 해제.
7. **한계**: 부분 소비 후 정리 책임, 취소와 백프레셔의 상호작용, 락된 스트림 재사용 불가.

## 시작 지시
**진단 질문 1개**(예: "`for await...of` 루프 중간에 `break`하면 그 비동기 이터레이터의 자원은 어떻게 정리되나?")로 시작. 채점 후 1번부터.

## 마감
이 축이 끝나면 공통 프롬프트 §6 **"축 마감 점검 의식"**을 실행. 다음 축은 **축5(프로덕션 캡스톤)** — 시리즈 마지막.
