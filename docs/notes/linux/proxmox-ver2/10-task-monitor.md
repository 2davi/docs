---
title: "10. TaskMonitor ─ 비동기 작업 감시와 끊어진 인증 사슬"
date: 2026-06-16
lastmod: 2026-06-16
author: "Davi"
description: "VM 제어가 띄운 백그라운드 작업을 @Async로 감시하다 마주친 클라이맥스. SecurityContextHolder가 ThreadLocal이라 워커 스레드로 인증이 전파되지 않아 PVE 호출이 401로 죽는 회귀를 DelegatingSecurityContextAsyncTaskExecutor로 잇는다. TaskOutcome의 Status enum 승격, 모든 종료 경로의 수렴, Recorder 포트 패턴, MDC 상관관계까지 다룬다."
slug: task-monitor
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 10
series: "Proxmox 실습 v2."
series_order: 10
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


## 들어가며

[08번](./08-mvc-vm-task-log.md)에서 VM을 켜고 끄면 PVE가 UPID를 돌려준다고 했다. 실제 작업은 백그라운드에서 진행되고, `controlVm`은 그 UPID로 `monitor.traceTaskStatus(node, upid)`를 호출해 추적을 촉발했다. 그 `TaskMonitor`가 이 문서의 주인공이다.

`TaskMonitor`가 하는 일은 단순해 보인다 ─ 작업이 끝날 때까지 PVE에 상태를 물어보고(폴링), 끝나면 결과를 기록한다. 그런데 이 단순한 일이 **이 프로젝트에서 가장 까다로운 버그**를 데려왔다. 백그라운드 감시를 `@Async`로 비동기 실행하는 순간, [07번](./07-auth-login.md)에서 공들여 완성한 인증 사슬이 **소리 없이 끊긴다.** 감시 스레드가 PVE를 호출하면 인증 헤더가 안 붙어 401로 죽는다. 07 마무리에서 "이 사슬이 안 닿는 사각지대"라고 예고한 그것이다.

이 꼭지는 그 클라이맥스를 정면으로 다루고, 더불어 감시 결과를 어떻게 모델링하고(`TaskOutcome`) 어디에 기록하는지(`Recorder` 포트)까지 본다. 결정 로그가 가장 두꺼운 꼭지다.

<br/>

## 1. 무엇을 감시하나

`TaskMonitor`의 진입점은 `@Async`가 붙은 메서드다.

```java
@Service
public class TaskMonitor {
    private final RestClient restClient;
    private final TaskOutcomeRecorder recorder;
    // ... 생성자 생략 ...

    @Async
    public void traceTaskStatus(String node, String upid) {
        MDC.put("upid", upid);          // 이 스레드의 모든 로그에 upid 태그 (6장)
        try {
            log.info("백그라운드 감시 시작");
            TaskOutcome o = watch(node, upid);   // 폴링하며 완료 대기 (3장)
            record(o);                            // 결과 기록 (5장)
        } finally {
            MDC.remove("upid");          // ThreadLocal 정리
        }
    }
    // ...
}
```

`@Async`가 핵심이다. 이 어노테이션이 붙으면 메서드는 **호출한 스레드가 아니라 별도의 워커 스레드에서** 실행된다. 그래서 `controlVm`이 `traceTaskStatus`를 부르면, 컨트롤러는 감시가 끝나길 기다리지 않고 즉시 응답을 반환한다. 사용자는 "작업 시작됨"을 바로 받고, 감시는 뒤에서 따로 돈다. 사용자 응답을 막지 않으려는 의도다.

그런데 바로 이 "별도 워커 스레드"가 문제의 진원지다.

<br/>

## 2. 인증 사슬이 끊긴다 ─ @Async와 ThreadLocal

### 2-1. 회귀의 정체

[07번](./07-auth-login.md)에서 완성한 인증 사슬을 다시 떠올리자.

```
JwtAuthenticationFilter: 요청 스레드의 SecurityContext에 PVE 티켓 적재   (06)
  → dynamicAuthInterceptor: SecurityContext에서 티켓을 꺼내 PVE 헤더로     (05)
```

이 사슬의 토대는 **`SecurityContextHolder`가 `ThreadLocal` 기반**이라는 점이다. `ThreadLocal`은 *스레드마다 독립된 저장 공간*이다. 필터가 요청 스레드의 `ThreadLocal`에 인증 정보를 넣어두면, 같은 요청 스레드에서 도는 인터셉터가 그걸 읽을 수 있다. 동기 요청 처리에선 완벽하게 작동한다.

문제는 `@Async`다. `traceTaskStatus`는 **요청 스레드가 아니라 워커 스레드에서** 돈다. 그리고 `ThreadLocal`은 스레드 경계를 넘지 못한다 ─ 요청 스레드의 `SecurityContext`는 워커 스레드로 **전파되지 않는다.** 그래서 감시 스레드가 PVE 상태를 조회하려 `restClient`를 부르면, 인터셉터가 `SecurityContextHolder.getContext().getAuthentication()`에서 `null`을 받고, PVE 티켓 헤더를 못 붙인다. 결과는 **모든 폴링이 401로 죽는** 것이다. VM은 멀쩡히 떴는데, 그걸 감시하는 백그라운드 작업만 조용히 인증 실패한다.

이건 **회귀(Regression)** 다. 짚어둘 가치가 있다. 예전에 PVE를 단일 API 토큰으로 호출하던 모델에선 토큰이 `RestClient`의 `defaultHeader`에 정적으로 박혀 있어서, `SecurityContext`가 필요 없었다. 어느 스레드에서 호출하든 헤더가 붙었다. 그런데 [07번](./07-auth-login.md)에서 "사용자별 PVE 티켓을 `SecurityContext`로 실어 나르는" 위임(Delegation) 모델로 옮기면서, 인증이 스레드에 묶이게 됐고, 그 결과 비동기 스레드가 인증을 잃는 부작용이 새로 생긴 것이다. 더 정교한 인증 모델이 데려온 새 문제다.

### 2-2. DelegatingSecurityContextAsyncTaskExecutor

해법은 **워커 스레드로 `SecurityContext`를 복제해 전파**하는 것이다. Spring Security가 바로 이 용도의 실행기 데코레이터를 제공한다([Spring Security 동시성 통합](https://docs.spring.io/spring-security/reference/servlet/integrations/concurrency.html)). `AsyncConfig`가 그 배선이다.

```java
@Configuration
public class AsyncConfig implements AsyncConfigurer {

    @Override
    public Executor getAsyncExecutor() {
        // Java 21 가상 스레드: sleep·blocking IO 용도
        SimpleAsyncTaskExecutor delegate = new SimpleAsyncTaskExecutor("pve-async-");
        delegate.setVirtualThreads(true);

        // SecurityContext를 워커 스레드로 복제·전파하는 겉 껍데기
        return new DelegatingSecurityContextAsyncTaskExecutor(delegate);
    }
}
```

두 겹으로 읽어야 한다.

- **안쪽 `delegate` ─ 가상 스레드 실행기.** `SimpleAsyncTaskExecutor`에 `setVirtualThreads(true)`를 줘서 Java 21 가상 스레드로 작업을 돌린다. 감시 루프는 `Thread.sleep`과 블로킹 IO(PVE 상태 조회)의 반복이라 ─ 가상 스레드가 가장 잘 맞는 부하다. 블로킹되는 순간 캐리어 스레드에서 분리되므로, 동시에 여러 작업을 감시해도 OS 스레드를 거의 안 쓴다. [05번](./05-rest-client-config.md)의 `RestClient`가 가상 스레드 위에서 도는 것과 호응하는 선택이다.
- **바깥 `DelegatingSecurityContextAsyncTaskExecutor` ─ 컨텍스트 전파 데코레이터.** 안쪽 실행기를 감싸는 껍데기다. 작업이 *제출되는 시점*(`@Async` 메서드가 호출되는 요청 스레드)의 `SecurityContext`를 스냅샷으로 떠서, 작업이 *실행되는* 워커 스레드로 복제해 넣는다. 그래서 워커 스레드 안의 인터셉터가 `SecurityContextHolder`를 조회하면 ─ 마치 요청 스레드인 것처럼 ─ PVE 티켓을 찾을 수 있다. 데코레이터 패턴(Decorator Pattern)으로 "가상 스레드 실행"과 "컨텍스트 전파"라는 두 책임을 깔끔하게 합성한 것이다.

`AsyncConfigurer`를 구현하고 `getAsyncExecutor()`를 오버라이드하면, 스프링이 `@Async` 메서드를 이 실행기로 돌린다. 이 한 클래스로 끊겼던 사슬이 다시 이어진다 ─ 감시 스레드도 PVE 티켓을 들고 호출하게 된다.

> 정리하면 인증 사슬은 이제 세 종류의 스레드를 모두 커버한다. ① 동기 요청 스레드(필터가 직접 컨텍스트 세움), ② `@Async` 워커 스레드(이 데코레이터가 컨텍스트 복제). 07에서 "사각지대"라 했던 ②가 메워졌다.

<br/>

## 3. 감시 루프 ─ watch()

인증이 이어졌으니, 실제 감시 로직을 본다.

```java
private TaskOutcome watch(String node, String upid) {
    final int maxRetries = 30;
    for (int attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            ProxmoxTaskStatusDto statusInfo = getTaskStatus(node, upid);

            if (statusInfo != null && "stopped".equals(statusInfo.status())) {
                return TaskOutcome.completed(upid, node, statusInfo.exitStatus());  // 완료
            }

            log.info("작업 진행 중... ({}/{})", attempt, maxRetries);
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();                          // ★ 플래그 복원
            return TaskOutcome.monitorFailed(upid, node, "interrupted"); // 워처 사망
        } catch (Exception e) {
            log.error("상태 조회 중 에러", e);
            return TaskOutcome.monitorFailed(upid, node, e.toString());  // 워처 사망
        }
    }
    return TaskOutcome.timedOut(upid, node);                            // 타임아웃
}
```

### 3-1. 폴링 30회

PVE에 2초 간격으로 작업 상태를 묻고, 응답의 `status`가 `stopped`면 작업이 끝난 것으로 본다. 최대 30회(약 60초)까지 시도한다. 무한정 기다릴 수 없으니 상한을 둔 것이다.

### 3-2. 모든 종료 경로가 TaskOutcome로 수렴

`watch()`에서 가장 중요한 설계는 **모든 빠져나가는 길이 `TaskOutcome`을 반환**한다는 점이다. 종료 경로가 셋이다 ─ 정상 완료(`completed`), 워처 자체 사망(`monitorFailed`), 시간 초과(`timedOut`). **이 셋 어디로 빠지든 `TaskOutcome`이 만들어진다.** 그래서 "결과를 기록하지 않고 조용히 사라지는" 경로가 구조적으로 존재할 수 없다.

이건 이전 구조의 구멍을 메운 것이다. 예전엔 타임아웃 시 `log.warn`만 찍고 그냥 빠져나갔다. 그러면 *오래 걸린 작업은 기록에서 증발*했다. 지금은 타임아웃도 `TIMED_OUT` 상태의 `TaskOutcome`으로 남는다. "감시는 결과를 *반환*하고, 기록은 바깥의 `traceTaskStatus`에서 한 곳으로" ─ 책임을 분리하니 누락이 원천 차단됐다.

### 3-3. InterruptedException과 플래그 복원

`InterruptedException`을 잡는 부분에 `Thread.currentThread().interrupt()`가 있다. 빼먹기 쉬운데 빼면 안 되는 한 줄이다.

`Thread.sleep` 중에 누가 이 스레드를 인터럽트(중단 요청)하면 `InterruptedException`이 던져지는데, **이 예외가 던져지는 순간 JVM은 스레드의 인터럽트 플래그를 *지운다*.** 그래서 예외를 잡기만 하고 끝내면, 상위 코드(실행기, 스레드 풀 등)는 "이 스레드에 중단 요청이 있었다"는 사실 자체를 알 수 없게 된다. 잡았으면 `Thread.currentThread().interrupt()`로 **플래그를 도로 세워줘서**, 중단 요청이 상위로 전달되게 하는 게 정석이다([Java Tutorials ─ Interrupts](https://docs.oracle.com/javase/tutorial/essential/concurrency/interrupt.html)). 인터럽트를 삼키지 않고 협조적으로(cooperatively) 전파하는 관례다.

<br/>

## 4. 결과 객체 ─ TaskOutcome

`watch()`가 반환하는 `TaskOutcome`은 감시 결과를 담은 불변(immutable) `record`다.

### 4-1. boolean이 아니라 Status enum

가장 중요한 설계 결정부터. 처음엔 결과를 `boolean success` 하나로 표현하려 했다. 그런데 **그건 거짓말하는 필드**라 enum으로 올렸다.

```java
public enum Status {
    SUCCEEDED,        // stopped && exitstatus "OK"
    FAILED,           // stopped && "ERROR"
    TIMED_OUT,        // 감시 한도 내에 종료 확인 못함
    MONITOR_ERROR     // 워처(Watcher) 자체가 뻗음
}
```

이유는 이렇다. **감시 스레드가 네트워크 문제로 죽었어도, PVE에선 작업이 *성공*했을 수 있다.** 워처가 죽은 것과 작업이 실패한 것은 완전히 다른 사건이다. 그런데 이걸 `boolean`으로 표현하면 둘을 구분할 수 없다 ─ 워처가 죽은 경우를 `success=false`로 박는 순간, "VM은 떴는데 기록은 실패라고 말하는" **오염된 데이터**가 된다. 미래에 이 결과를 DB에 쌓는다면, 그 행은 거짓을 말하게 된다.

그래서 상태를 넷으로 가른다. **성공(SUCCEEDED)**, **실패(FAILED)**, 그리고 *모름*에 해당하는 **타임아웃(TIMED_OUT)** 과 **워처 사망(MONITOR_ERROR)**. "작업이 실패했다"와 "작업 결과를 모른다"는 다른 상태다. `boolean`은 이 현실을 담지 못한다.

### 4-2. 파생값 ─ durationMs, resourceType/action

`TaskOutcome`엔 저장하지 않고 *계산하는* 값들이 있다.

```java
public long durationMs() {
    // 소요시간은 필드가 아니라 파생 메서드 — startedAt·finishedAt에서 매번 계산
    return Duration.between(startedAt, finishedAt).toMillis();
}

// 대상·동작은 taskType에 위임 (09의 카탈로그 재사용)
public ResourceType resourceType() { return taskType.resourceType(); }
public TaskAction action()         { return taskType.action(); }
```

`durationMs`를 필드로 저장하지 않고 파생 메서드로 둔 게 의도다. 소요 시간을 별도 필드로 들고 있으면 `startedAt`/`finishedAt`과 *어긋날* 여지가 생긴다(누가 한쪽만 바꾸면). 시작·종료 시각만 진실로 두고 차이는 매번 계산하면, **절대 불일치가 없다.** 그리고 `resourceType()`·`action()`은 [09번](./09-domain-translation-enum.md)에서 만든 `TaskType` 카탈로그에 그대로 위임한다 ─ 작업 종류 번역 지식을 여기서 중복하지 않고 재사용한다. 09의 안티-부패 계층이 여기서 빛을 발한다.

### 4-3. UPID 구조분해 빌더

상태 객체를 만드는 팩토리 메서드들이 PVE 의미론을 한곳에 모은다.

```java
public static TaskOutcome completed(String upid, String node, String exitStatus) {
    // PVE의 "OK" 판정이 도메인 객체 안으로 — 서비스 코드에 흩어지지 않는다
    Status st = "OK".equals(exitStatus) ? Status.SUCCEEDED : Status.FAILED;
    return build(upid, node, st, exitStatus);
}

// UPID 문자열을 구조분해해 필드를 채운다
private static TaskOutcome build(String upid, String node, Status status, String exitStatus) {
    String[] seg = upid.split(":");
    String starttime = seg.length > 4 ? seg[4] : "0";
    long startedAt = Long.parseLong(starttime, 16);   // ★ UPID의 시작시각은 16진수
    String type     = seg.length > 5 ? seg[5] : "";
    String targetId = seg.length > 6 ? seg[6] : "";
    return new TaskOutcome(
            upid, node, TaskType.from(type), targetId, status, exitStatus,
            Instant.ofEpochSecond(startedAt), Instant.now());
}
```

두 가지를 짚는다. 첫째, **"OK" 판정이 도메인 객체로 이사**했다. PVE가 작업 성공을 `exitstatus: "OK"`로 표현하는데, 이 PVE 고유의 의미론을 서비스 코드 여기저기가 아니라 `TaskOutcome.completed` 한 곳에서만 안다. PVE 어휘를 도메인 경계 안쪽 한 지점에 가둔 것이다(09의 ACL 정신과 같다). 둘째, **시작 시각을 UPID에서 추출**한다. UPID의 5번째 세그먼트가 작업 시작 시각인데, **16진수**라 `Long.parseLong(starttime, 16)`으로 파싱한다. 감시를 시작한 시각이 아니라 *PVE가 작업을 실제로 시작한 시각*을 쓰므로 `durationMs`가 더 정확해진다. `TaskType.from(type)`으로 작업 종류를 번역하는 것도 09 카탈로그의 재사용이다.

<br/>

## 5. 기록 포트 ─ Recorder

감시 결과를 *어디에* 기록할지는 포트(Port)로 추상화했다. 헥사고날 아키텍처(Hexagonal Architecture)의 포트-어댑터 패턴이다.

### 5-1. 포트와 어댑터

```java
/**
 * 작업 결과를 기록하는 포트.
 * - SLF4J 어댑터에 기록할 수도, JdbcClient나 MyBatis로 갈아끼울 수도 있다.
 * - 절대 예외를 발생시키지 않는다. 기록에 실패했다고 해서 모니터링은 계속 이루어진다.
 */
public interface TaskOutcomeRecorder {
    void record(TaskOutcome outcome);
}
```

```java
@Component
public class Slf4jTaskOutcomeRecorder implements TaskOutcomeRecorder {
    private static final Logger log = LoggerFactory.getLogger(Slf4jTaskOutcomeRecorder.class);

    @Override
    public void record(TaskOutcome o) {
        log.info("TASK_OUTCOME status={} type={} target={} node={} durationMs={} exit=\"{}\" upid={}",
                o.status(), o.action(), o.targetId(), o.node(), o.durationMs(), o.exitStatus(), o.upid());
    }
}
```

`TaskOutcomeRecorder`는 `void record(TaskOutcome)` 단 하나의 메서드를 가진 **인터페이스(포트)** 다. 영속 기술을 전혀 모른다. 오늘은 `Slf4jTaskOutcomeRecorder`라는 **어댑터**가 로그로 기록하지만, 내일 DB가 필요하면 `JdbcTaskOutcomeRecorder`나 `MyBatisTaskOutcomeRecorder`를 새로 만들어 끼우면 된다. **`TaskMonitor`는 인터페이스에만 의존하므로(의존성 역전, DIP), DB를 붙여도 감시 코드는 한 줄도 안 바뀐다.** 어댑터 클래스 하나를 추가할 뿐이다.

이 구조의 실용적 이점이 둘이다. 하나, **DB 없이도 지금 당장 돌아간다** ─ 포트는 자바 인터페이스일 뿐이라 클래스패스에 DB 의존성이 없다. 둘, **JPA가 아닌 어떤 RDB(PostgreSQL/MySQL/Oracle)로도 갈 수 있다** ─ 포트가 영속 기술을 모르니, 그 아래 어댑터가 무엇이든 상관없다.

### 5-2. 로그는 grep용, 원천은 객체

여기 미묘하지만 중요한 관점이 있다. `Slf4jTaskOutcomeRecorder`가 찍는 `key=value` 로그는 **사람이 `grep`으로 훑어보기 위한 것**이지, 나중에 그 로그를 *파싱해서 DB에 넣을 원천*이 아니다. DB에 넣을 원천은 **`TaskOutcome` 객체 그 자체**다. 그래서 미래에 DB로 전환할 때, 로그 파서를 만드는 게 아니라 **어댑터를 교체**하면 된다. 로그는 로그대로 사람이 보고, 데이터는 객체에서 곧장 DB로 들어간다. "스레드별 로그 파일을 만들어 나중에 파싱한다" 같은 접근보다 이게 깔끔한 이유다.

### 5-3. 절대 예외를 던지지 않는다

포트의 계약에 **"절대 예외를 발생시키지 않는다"** 가 명시돼 있다. 기록에 실패했다고 감시가 죽으면 안 되기 때문이다. 그리고 `TaskMonitor`는 호출 측에서도 한 번 더 방어한다.

```java
private void record(TaskOutcome o) {
    try {
        recorder.record(o);
    } catch (RuntimeException e) {
        // 기록 실패가 감시를 죽이지 못하게 — 결과는 최소한 로그로라도 남긴다
        log.error("TaskOutcome 기록 실패 ─ 결과 유실 방지 Trace: {}", o, e);
    }
}
```

미래에 DB 어댑터가 연결 장애로 예외를 던지더라도, 이 `try-catch`가 그걸 삼키고 `TaskOutcome`을 최소한 에러 로그로라도 남긴다. **기록 계층의 장애가 감시 계층으로 번지지 않게 하는 방어선**이다. 구현체가 1차 책임을 지고(예외 안 던짐), 호출 측이 2차 방어선을 친다.

<br/>

## 6. MDC ─ UPID 로그 상관관계

마지막으로 1장에서 지나친 `MDC`다. 비동기로 여러 작업을 동시에 감시하면, 여러 스레드의 로그가 한데 섞여 어느 줄이 어느 작업 것인지 분간이 안 된다. **MDC(Mapped Diagnostic Context)** 가 이를 푼다([SLF4J MDC](https://www.slf4j.org/manual.html#mdc)).

```java
@Async
public void traceTaskStatus(String node, String upid) {
    MDC.put("upid", upid);      // 이 스레드가 찍는 모든 로그 줄에 upid를 자동 부착
    try {
        // ... watch ... record ...  (이 안의 "작업 진행 중..." 로그에도 upid가 붙는다)
    } finally {
        MDC.remove("upid");     // ThreadLocal이므로 반드시 정리
    }
}
```

`MDC.put("upid", upid)`를 해두면, 그 스레드가 이후 찍는 *모든* 로그 줄에 `upid`가 꼬리표로 따라붙는다. `watch()` 안의 "작업 진행 중..." 같은 줄에도 자동으로 붙어서, 동시에 작업 여러 개가 돌아도 UPID로 로그를 갈라 읽을 수 있다. MDC 자체가 `ThreadLocal`이라, 작업이 끝나면 `finally`에서 반드시 `remove`로 정리한다(안 그러면 스레드 재사용 시 옛 값이 남을 수 있다).

다만 MDC 값이 로그 출력에 *보이려면* 로그 패턴에 `%X`를 넣어야 한다. `application.properties`의 이 줄이 그 설정이다.

```properties
logging.pattern.correlation=[%X{upid:-}]
```

`%X{upid:-}`는 "MDC의 `upid` 값을 출력하되, 없으면 빈 값(`-` 뒤가 기본값)"이라는 뜻이다. 이걸로 모든 로그 줄 앞에 `[UPID:...]` 꼬리표가 붙어, 작업별 추적(Correlation)이 가능해진다.

<br/>

## 마무리

10에서 다룬 것을 정리한다.

- **끊어진 사슬과 복원** ─ `@Async` 워커 스레드는 `ThreadLocal` 경계 탓에 `SecurityContext`를 잃어 PVE 호출이 401로 죽는 회귀(정적 토큰 → 위임 모델 전환의 부작용). `DelegatingSecurityContextAsyncTaskExecutor`(컨텍스트 전파)로 가상 스레드 실행기(`SimpleAsyncTaskExecutor`)를 감싸 사슬을 이었다. 07의 인증이 이제 비동기 스레드까지 닿는다.
- **감시 루프** ─ 30회 폴링, **모든 종료 경로가 `TaskOutcome`로 수렴**해 기록 누락을 원천 차단, `Thread.currentThread().interrupt()`로 인터럽트 플래그 협조적 복원.
- **결과 모델(`TaskOutcome`)** ─ `boolean`이 못 담는 "실패 vs 모름"을 `Status` enum으로 승격, `durationMs`·`resourceType`/`action`을 파생값으로 둬 불일치 차단(09 카탈로그 재사용), UPID 16진수 시작시각 구조분해와 "OK" 판정의 도메인 내재화.
- **기록 포트(`Recorder`)** ─ 헥사고날 포트-어댑터로 "오늘 로그, 내일 DB"를 어댑터 교체만으로(DB 없이도 동작), 로그는 `grep`용·원천은 객체, 그리고 "절대 예외 안 던짐" + 호출 측 방어선의 이중 안전망.
- **MDC 상관관계** ─ UPID 꼬리표로 동시 감시 로그를 갈라 읽기.

이로써 토대(05)·인증(06·07)·기능(08)·번역(09)·비동기 감시(10)가 모두 섰다. 그런데 이 다섯 꼭지를 만들며 **계속 "이건 나중에"라고 미뤄둔 것이 하나 있다** ─ 예외 처리다. 07의 `InvalidCredentialsException`, 06의 인증 실패, PVE 인프라 장애가 제각기 어떻게 사용자 응답이 되는지, 그 `CmpException` 계층과 `MessageSource`와 RFC 9457 `ProblemDetail`의 전모를 다음 [11. 공통화 & 리패키징](#) 꼭지에서 통합한다. 더불어 지금까지 `api.**` 한 덩어리였던 패키지를 기능 단위로 재편한 과정 ─ package-by-feature ─ 도 거기서 다룬다. 흩어진 공통 관심사를 한자리에 모으는, 시리즈를 매듭짓는 꼭지다.
