---
title: "11. 공통화 & 리패키징 ─ 흩어진 관심사를 한자리로"
date: 2026-06-16
lastmod: 2026-06-16
author: "Davi"
description: "시리즈를 매듭짓는 공통화 꼭지. 컨트롤러마다 흩어진 try-catch를 GlobalExceptionHandler로 중앙화하고, 커스텀 응답 대신 RFC 9457 ProblemDetail로, 같은 401을 호출 지점마다 다른 메시지로 푸는 CmpException 계층과 MessageSource 외부화, 그리고 package-by-layer를 package-by-feature로 재편한 과정을 정리한다."
slug: exception-handling-packaging
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 11
series: "Proxmox 실습 v2."
series_order: 11
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


## 들어가며

지금까지 여러 꼭지에서 예외 처리를 "이건 11에서"라며 미뤄왔다. [07번](./07-auth-login.md)의 `InvalidCredentialsException`이 어떻게 사용자 응답이 되는지, [06번](./06-spring-security.md)의 인증 실패가 EntryPoint 말고 어디서 처리되는지, PVE 인프라 장애가 어떤 상태 코드로 나가는지 ─ 그 답이 전부 여기로 모인다.

이 문서(11)가 다루는 건 **공통화(Commonization)** 와 **리패키징(Repackaging)** 이다. 둘은 결이 같다. 기능을 만들다 보면 예외 처리·메시지 같은 횡단 관심사(Cross-cutting Concern)가 여러 컨트롤러에 흩어지고, 패키지는 계층별로 뭉쳐 응집이 흐려진다. 이 꼭지는 그 흩어진 것들을 **한자리로 모으는** 작업이다. 시리즈를 매듭짓는 정리 꼭지다.

> 솔직히 짚어둘 게 있다. 이 리팩터는 규모가 크고, 일부는 단일 관리자 홈랩엔 과한(speculative) 측면이 있다(특히 국제화). 그럼에도 다루는 이유는, RFC 9457 표준·예외 번역·중앙 advice가 "modern Spring을 안다"는 포트폴리오 시그널이기 때문이다. SW Architect 지망이라면 더 그렇다. 필요와 시그널을 구분해 가며 읽으면 된다.

<br/>

## 1. 예외를 하나의 출구로 ─ GlobalExceptionHandler

### 1-1. 흩어진 catch에서 중앙 advice로

처음엔 예외를 각 컨트롤러가 `try-catch`로 직접 처리했다. 그런데 그 catch 블록 여러 개가 *전부 같은 일반 메시지*를 반환하는 패턴이라, 실패의 원인(자격증명? 연결 실패? 파싱 오류?)이 응답에서 구분되지 않았다. 이걸 `@RestControllerAdvice`로 중앙화했다.

```java
@RestControllerAdvice(basePackages = "dev.the2davi.lab.api")
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final MessageSourceAccessor messageSource;

    GlobalExceptionHandler(MessageSourceAccessor messageSource) {   // package-private
        this.messageSource = messageSource;
    }
    // ...
}
```

`@RestControllerAdvice`는 `api` 패키지 전역의 컨트롤러에서 던져진 예외를 한곳에서 받는다. 컨트롤러는 이제 예외를 잡지 않고 *던지기만* 하면 되고, 변환은 여기서 일괄 처리된다.

`ResponseEntityExceptionHandler`를 상속한 건 보너스가 크다. **이 베이스 클래스가 Spring MVC의 표준 예외(400 검증 실패, 404, 405 등)를 이미 RFC 9457 형식으로 처리**해 주기 때문이다. 즉 우리가 손대지 않아도 프레임워크 레벨 예외가 자동으로 `ProblemDetail`이 되고, 우리의 커스텀 핸들러는 그 위에 얹힌다.

> 이전 버전엔 버그가 여럿이었다. 핸들러 메서드에 `@ExceptionHandler`가 빠져 *죽은 메서드*가 돼 있었고(이게 제일 컸다 ─ 어노테이션이 없으면 그 메서드는 아무것도 안 한다), 생성자가 `private`이라 스프링이 빈을 못 만들었고, 주입한 `MessageSource`를 쓰지도 않고 메시지를 하드코딩했다. 지금 코드는 이것들을 다 바로잡은 상태다 ─ `@ExceptionHandler`를 살리고, 생성자를 package-private으로 열고, `MessageSource`를 실제로 쓴다. 클래스에 주석으로 남은 옛 `unauthorized` 메서드(아래 2장의 폐기된 `ExceptionMessageResponse` 기반)가 그 전환의 흔적이다.

### 1-2. 계층화된 예외 처리 ─ 도메인 vs 인프라

핸들러는 예외를 **두 부류로 갈라** 처리한다. 우리 도메인이 의도적으로 던진 예외와, 외부(PVE)·프레임워크에서 터진 예외다.

```java
// (1) 우리 도메인 예외: code로 메시지 뽑고, 예외가 들고 온 status를 입힌다
@ExceptionHandler(CmpException.class)
public ProblemDetail handleCmp(CmpException e, Locale locale) {
    log.warn("[{}] {}", e.getStatus(), e.getMessageCode(), e);   // 서버엔 원본 스택까지
    String detail = messageSource.getMessage(
            e.getMessageCode(), e.getArgs(), e.getMessageCode(), locale);
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(e.getStatus(), detail);
    pd.setProperty("code", e.getMessageCode());   // 프론트가 분기할 안정적 코드
    return pd;
}

// (2) PVE 인프라 예외 ─ 어느 컨트롤러에서 터지든 의미가 같다 → 한 번만 매핑
@ExceptionHandler(ResourceAccessException.class)    // 연결 불가 / 타임아웃
public ProblemDetail pveUnavailable(ResourceAccessException e) {
    log.error("PVE 연결 실패", e);
    return problem(HttpStatus.SERVICE_UNAVAILABLE, "error.pve.unavailable");   // 503
}

@ExceptionHandler(HttpServerErrorException.class)   // PVE 5xx
public ProblemDetail pveServer(HttpServerErrorException e) {
    log.error("PVE 5xx", e);
    return problem(HttpStatus.BAD_GATEWAY, "error.pve.server");                // 502
}

// (3) 최후 안전망 ─ 위에서 안 걸린 모든 예외
@ExceptionHandler(Exception.class)
public ProblemDetail unknown(Exception e) {
    log.error("처리되지 않은 예외", e);
    return problem(HttpStatus.INTERNAL_SERVER_ERROR, "error.unknown");         // 500
}
```

네 단계로 그물을 친다 ─ ① 우리 도메인 예외(`CmpException`, 1-2의 핵심), ② PVE 연결 실패(503), ③ PVE 5xx(502), ④ 그 외 전부를 받는 최후 안전망(500). [07번](./07-auth-login.md)에서 로그인이 "PVE 401만 잡고 `ResourceAccessException`·`HttpServerErrorException`은 안 잡고 흘려보낸다"고 했던 ─ 그 흘려보낸 예외들의 **수신처가 바로 여기(②③)** 다. 컨트롤러는 자기 도메인 관심사만 처리하고, 인프라 예외는 의미가 동일하니 전역에서 한 번만 매핑한다.

> `handleCmp`의 `messageSource.getMessage(code, args, 기본값, locale)`에서 세 번째 인자가 *기본값*이다. 메시지 키가 프로퍼티에 없을 때 `NoSuchMessageException`으로 또 터지지 않도록, 키 자체를 기본값으로 넘겨 방어한다.

### 1-3. HTTP 상태 의미론을 존중한다

위에서 PVE 연결 실패를 503, PVE 5xx를 502로 매핑한 게 그냥 정한 숫자가 아니다. **HTTP 상태 코드의 의미를 정직하게 지킨 것**이다.

흔한 안티패턴이 PVE 같은 업스트림(Upstream) 장애를 401이나 500으로 뭉뚱그리는 것이다. 하지만 그건 거짓말이다. PVE가 죽어서 못 닿은 건데 401(인증 실패)로 응답하면, 클라이언트는 "내 자격증명이 틀렸나?" 하고 엉뚱한 데서 원인을 찾는다. **업스트림 게이트웨이(우리 CMP)가 그 뒤의 서버(PVE)에 못 닿거나 거기서 에러를 받은 상황은 502(Bad Gateway)·503(Service Unavailable)** 이 정확한 의미다. 상태 코드가 거짓말하지 않아야, 클라이언트가 올바른 대응(재시도? 잠시 후 다시? 자격증명 확인?)을 할 수 있다.

<br/>

## 2. 표준 에러 응답 ─ RFC 9457 ProblemDetail

핸들러가 반환하는 타입이 `ProblemDetail`이다. 처음엔 직접 만든 `ExceptionMessageResponse`라는 record를 썼는데, 그걸 걷어내고 Spring 6 네이티브 타입으로 갈았다.

폐기된 `ExceptionMessageResponse`는 이랬다.

```java
// 폐기됨 — ProblemDetail이 이미 주는 걸 손수 만든 것
public record ExceptionMessageResponse<OBJECT>(
        String statusCode, String alertMessage, String debugMessage,
        OBJECT data, String changes) {}
```

`ProblemDetail`로 옮긴 이유가 셋이다.

- **표준을 손수 재발명하고 있었다.** `ProblemDetail`은 RFC 9457([Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/html/rfc9457))을 구현한 표준 타입으로, `{type, title, status, detail, instance}` 구조에 `application/problem+json` 콘텐츠 타입을 자동으로 붙인다. `ExceptionMessageResponse`의 `statusCode`·`alertMessage`는 `ProblemDetail`의 `status`·`detail`이 이미 제공하는 것이었다. 바퀴를 다시 깎고 있었던 셈이다.
- **`debugMessage`는 클라이언트에 절대 보내면 안 된다.** 옛 record엔 `debugMessage` 필드가 있어 디버깅 정보가 응답에 실릴 위험이 있었다. 내부 스택이나 예외 메시지가 클라이언트로 새는 건 보안상 위험하다. 지금은 디버그 정보가 **서버 로그(`log.warn`/`log.error`의 그 `e`)로만** 가고, 클라이언트엔 사용자용 `detail`과 분기용 `code`만 나간다.
- **`data`·`changes`는 에러 응답엔 군더더기였다.** 이 둘은 성공 응답에서나 의미 있는 페이로드 필드인데, 에러 응답 record에 들어 있었다. 에러에 성공 데이터 자리가 있는 건 모델이 어긋난 것이라 버렸다.

> 이 `data`/`changes` 필드는 SI 현장에서 흔한 `CommonResponse<T>` 같은 통합 응답 봉투(Envelope) 컨벤션의 흔적이다. 만약 목표가 *팀 컨벤션 재현*이라면 통합 봉투로 가도 된다 ─ 단 그건 ProblemDetail 표준과 **갈라서는 의도된 선택**이어야지, 둘을 섞으면 안 된다. 그린필드 포트폴리오로 modern Spring을 보일 거라면 ProblemDetail이 더 강한 패다. 무엇을 증명하려는 포트폴리오냐에 따라 갈린다.

프론트는 이 변화에 맞춰 `message`가 아니라 `detail` 키를 읽는다.

```javascript
} catch (error) {
    const pd = error.response?.data;          // ProblemDetail body
    alert(pd?.detail ?? "인증 실패 ^ㅂ^");      // detail = 사용자 메시지
    // pd?.code로 분기 처리 가능 (예: error.pve.session-expired면 로그인 화면으로)
}
```

`ProblemDetail`의 사용자 메시지는 `detail` 필드에 담기므로 `pd?.detail`을 읽고, 우리가 붙인 `code` 프로퍼티로 클라이언트가 상황별 분기를 할 수 있다.

<br/>

## 3. 맥락 있는 예외 ─ CmpException 계층

1-2의 `handleCmp`가 받던 `CmpException`이 이 프로젝트 도메인 예외의 베이스다.

```java
public class CmpException extends RuntimeException {
    private static final long serialVersionUID = -1247364066058552550L;

    private final HttpStatus status;        // 이 예외가 의미하는 HTTP 상태
    private final String messageCode;       // MessageSource 키
    private final transient Object[] args;  // 메시지 치환 인자

    protected CmpException(HttpStatus status, String messageCode, Throwable cause, Object... args) {
        super(messageCode, cause);
        this.status = status;
        this.messageCode = messageCode;
        this.args = args;
    }
    // ... 접근자 생략 ...
}
```

각 도메인 예외가 **자기가 의미하는 HTTP 상태와 메시지 코드를 스스로 들고 다닌다.** [07번](./07-auth-login.md)의 `InvalidCredentialsException`이 그 첫 서브타입이었다.

```java
public class InvalidCredentialsException extends CmpException {
    public InvalidCredentialsException(Throwable cause) {
        super(HttpStatus.UNAUTHORIZED, "error.auth.invalid-credentials", cause);
    }
}
```

이 계층의 값어치는 **같은 저수준 HTTP 상태를 맥락별로 다른 의미로** 표현할 수 있다는 점이다. PVE가 던지는 401은 그저 "인증 실패"라는 날것의 상태일 뿐인데, *어느 호출 지점에서 났는가*에 따라 사용자에게 줄 메시지가 다르다 ─ 로그인에서 난 401은 "아이디·비번을 확인하세요", 세션 만료로 난 401은 "다시 로그인하세요". `CmpException`을 상속한 서브타입마다 다른 `messageCode`를 들려 보내면, 핸들러는 그 코드로 맥락에 맞는 메시지를 골라낸다.

세부 설계 두 가지를 짚는다. 첫째, **생성자가 `protected`** 다 ─ `CmpException`을 직접 `new`하지 못하게 막고, 반드시 의미가 분명한 서브타입(`InvalidCredentialsException` 등)을 통해서만 던지도록 강제한다. 둘째, **`args`에 `transient`** 가 붙어 있다 ─ `Object[]`는 그 안에 직렬화 불가능한 객체가 들어올 수 있어, 예외 직렬화 시 문제를 일으킬 수 있다. `transient`로 직렬화에서 제외해 안전성을 확보한다.

<br/>

## 4. 메시지 외부화 ─ MessageSource

예외 메시지를 코드에 하드코딩하지 않고 외부 프로퍼티 파일로 뺐다. `MessageSourceConfig`가 그 설정이다.

```java
@Bean
MessageSource messageSource() {
    ReloadableResourceBundleMessageSource messageSource = new ReloadableResourceBundleMessageSource();
    messageSource.setBasenames(EXCEPTION_MESSAGES, VALIDATION_MESSAGES);   // 메시지 파일 위치
    messageSource.setDefaultEncoding(StandardCharsets.UTF_8.name());       // 한글 깨짐 방지
    messageSource.setDefaultLocale(Locale.KOREAN);
    messageSource.setFallbackToSystemLocale(false);                       // 시스템 로케일로 안 떨어짐
    messageSource.setCacheSeconds(MESSAGE_CACHE_SECONDS);                 // 3600초 캐싱
    return messageSource;
}
```

`EXCEPTION_MESSAGES`는 `classpath:messages/exception-messages`를 가리킨다. `error.auth.invalid-credentials` 같은 키에 실제 메시지를 매핑해 두면, 핸들러가 코드로 메시지를 조회한다. 메시지를 바꿀 때 자바 코드를 건드리지 않아도 된다.

설정에서 짚을 디테일 둘. **`setDefaultEncoding`을 UTF-8로** 한 건 프로퍼티 파일의 한글이 깨지지 않게 하기 위함이고, **`setFallbackToSystemLocale(false)`** 는 요청 로케일에 맞는 메시지가 없을 때 *서버의 시스템 로케일*로 떨어지지 않도록 막는다 ─ 배포 환경마다 시스템 로케일이 달라 메시지가 들쭉날쭉해지는 걸 방지해 예측 가능성을 확보한다.

### .properties 함정

여기 빠지기 쉬운 함정이 하나 있다. **`ReloadableResourceBundleMessageSource`는 YAML을 못 읽는다.** 메시지 파일을 `.yml`로 만들면 조용히 작동하지 않는다. 반드시 **`.properties` 확장자**여야 한다.

```properties
# exception-messages_ko.properties (.yml 아님!)
error.auth.invalid-credentials=아이디·비밀번호·REALM을 확인하세요.
error.pve.unavailable=Proxmox 서버에 연결할 수 없습니다.
error.pve.server=Proxmox 서버 오류가 발생했습니다.
error.unknown=알 수 없는 오류가 발생했습니다.
```

프로젝트의 다른 설정들이 `.yml`을 쓴다고 메시지 파일까지 무심코 `.yml`로 만들면 작동하지 않는다. 정 YAML을 고집하려면 YAML을 읽는 커스텀 `MessageSource`를 따로 구현해야 하는데, 그건 명백한 과투자다. `.properties`로 간다.

함께 두는 `LocaleResolver`(요청의 `Accept-Language` 헤더로 로케일 판별, 기본 한국어)와 `MessageSourceAccessor`(메시지 조회를 더 간결하게 감싸는 래퍼)도 같은 설정 클래스에 둔다.

> 앞서 말한 speculative 측면이 여기다. 한국인 단일 관리자에게 국제화(i18n)는 사실 당장 필요가 없다. 버리란 건 아니다 ─ 메시지 외부화 자체는 싸고, "메시지를 코드에서 분리할 줄 안다"는 시그널이 된다. 다만 이게 *필요*가 아니라 *시그널*이라는 건 알고 가는 게 정직하다.

<br/>

## 5. package-by-feature ─ 패키지 재구조화

마지막은 패키지 구조다. 처음엔 계층별로 묶는 **package-by-layer**(모든 컨트롤러를 `controller`에, 모든 서비스를 `service`에, 모든 DTO를 `dto`에) 방식이었는데, 이를 기능별로 묶는 **package-by-feature**로 재편했다.

```
dev.the2davi.lab
├── api
│   ├── auth      ├── controller ├── dto              ← 인증 기능 한 묶음
│   ├── vm        ├── controller ├── service ├── dto   ← VM 기능 한 묶음
│   ├── task      ├── controller ├── service ├── dto
│   ├── storage   ├── controller ├── service ├── dto
│   └── network   ├── controller ├── service ├── dto
├── cmmn          ├── conf ├── exception ├── security ├── format ├── type
└── monitor       ├── recorder ...
```

발상의 차이는 이렇다. package-by-layer는 "같은 *종류*의 코드"를 모으고(컨트롤러끼리, 서비스끼리), package-by-feature는 "같은 *기능*에 관여하는 코드"를 모은다(인증의 컨트롤러·서비스·DTO를 한 패키지에). 후자가 나은 이유는 **하나의 기능을 고칠 때 한 패키지만 열면 되기 때문**이다 ─ VM 기능을 손보려면 `api.vm` 하나에 컨트롤러·서비스·DTO가 다 있다. 관련된 것이 물리적으로 가까이 모이는 Locality of Behavior가 살아난다.

여기서 핵심 설계 원칙이 둘이다.

- **PVE 연동 계층은 따로 뺀다(`infra.pve`).** PVE 클라이언트(`RestClient` 설정), 응답 봉투(`ProxmoxResponse<T>`), PVE→CMP 예외 번역 ─ 이것들은 특정 도메인 기능이 아니라 *외부 시스템 연동 인프라*다. [05번](./05-rest-client-config.md)에서 짚었듯 `ProxmoxResponse<T>`의 모양은 우리 도메인이 아니라 **PVE의 통신 규격(Wire Format)이 결정**하므로, `vm`이나 `task` 같은 도메인 패키지가 아니라 인프라 계층에 속하는 게 맞다.
- **패키지 경계는 CMP 기능을 반영하지, PVE URL 경로를 따르지 않는다.** PVE API에 `/cluster` 경로가 있다고 해서 `cluster` 패키지를 만들 이유는 없다. 우리는 PVE를 *그대로 비추는 거울(mirror)* 이 아니라 *우리 기능을 가진 CMP* 를 짓는 것이라, 패키지는 "인증·VM·작업·스토리지" 같은 **CMP의 기능 경계**로 갈라야 한다.

> 이 재구조화는 아직 진행 중이다. `api` 아래에 분화 전의 잔재(`ProxmoxController`·`ProxmoxService` 같은)가 남아 있고, `ProxmoxResponse<T>`도 아직 `infra.pve`로 완전히 옮겨지지 않았다. 구조를 한 번에 갈아엎기보다, 기능을 하나씩 떼어 옮기며 점진적으로 수렴시키는 중이다. *논리적 추론: 동작하는 코드를 유지하면서 구조를 개선하려면 빅뱅 리팩터보다 점진적 이행이 안전하다.*

<br/>

## 마무리

11에서 모은 것을 정리한다.

- **중앙 예외 처리(`GlobalExceptionHandler`)** ─ 흩어진 catch를 `@RestControllerAdvice`로 모으고(`ResponseEntityExceptionHandler` 상속으로 프레임워크 예외까지 흡수), 도메인(`CmpException`)·인프라(502/503)·최후 안전망(500)으로 계층화, 그리고 업스트림 장애를 정직한 상태 코드로 표현.
- **표준 응답(`ProblemDetail`)** ─ 손수 만든 `ExceptionMessageResponse`를 RFC 9457 표준으로 대체, `debugMessage`는 서버 로그로만, `data`/`changes` 군더더기 제거, 프론트는 `detail`·`code`를 읽는다.
- **맥락 분류(`CmpException` 계층)** ─ 각 예외가 HTTP 상태·메시지 코드를 들고 다녀 같은 401을 호출 지점마다 다른 메시지로, `protected` 생성자와 `transient args`로 안전하게.
- **메시지 외부화(`MessageSource`)** ─ 프로퍼티로 분리, UTF-8·시스템 로케일 비의존, **`.properties` 필수**(YAML 함정), i18n은 필요가 아니라 시그널이라는 솔직한 인정.
- **package-by-feature** ─ 계층별에서 기능별로, `infra.pve`로 연동 인프라 분리, PVE URL이 아니라 CMP 기능으로 경계 짓기(진행 중).

여기까지가 시리즈의 **본체**다. 토대(05)·인증(06·07)·기능(08)·번역(09)·비동기 감시(10)·공통화(11)로, "PVE API와 RestClient를 활용한 백엔드 API 및 프론트엔드 서버"의 핵심 골격이 모두 섰다. 마지막 [12. 도메인 RestClient 확장](#) 꼭지에서는, 지금까지 깔아둔 이 모든 토대 위에서 아직 완성하지 못한 기능들 ─ VM 복제·삭제·템플릿, 네트워크 인터페이스, 스토리지 관리 ─ 의 현재까지를 정리하고, 무엇이 남았는지를 짚으며 시리즈를 닫는다.
