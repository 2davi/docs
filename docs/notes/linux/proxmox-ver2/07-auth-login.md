---
title: "07. 로그인/인증(auth) ─ 통행증을 발급하는 창구"
date: 2026-06-14
lastmod: 2026-06-16
author: "Davi"
description: "06에서 검증하던 JWT와 세션이 태어나는 곳. 로그인이 PVE access/ticket을 호출해 티켓을 받고, 세션 저장소에 보관한 뒤 sid를 담은 JWT를 발급한다. realm 누락과 %25 이중 인코딩 삽질, 401의 도메인 분류, 동적 인터셉터의 완결, 프론트 세션 영속화까지 인증 사슬을 끝맺는다."
slug: auth-login
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 7
series: "Proxmox 실습 v2."
series_order: 7
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


[06번](./06-spring-security.md)에서 검문소를 세웠다. 토큰 없는 요청은 막고, 인증된 요청엔 PVE 자격증명을 실어주는 관문. 필터는 "JWT를 검증하고 `sid`로 세션을 조회한다"고 했지만, 그 JWT와 세션이 *어디서 태어나는지*는 다루지 않았다.

```markdown
[사용자가 PVE 아이디·비밀번호 입력]
  → CMP가 PVE의 /access/ticket 호출 → PVE 티켓·CSRF 토큰 수령
  → SecuritySession에 담아 저장소에 보관 → sid 발급
  → sid를 담은 JWT를 찍어 클라이언트에 반환
```

06에서 "검증하던" 그 토큰과 세션이 여기서 **태어난다.** 07이 끝나면 발급(07) → 검증(06) → 주입(05)으로 이어지는 인증 체인이 완성된다.

<br/>

## 1. 로그인 플로우 ─ AuthController

로그인 처리 과정은 `AuthController.login()` 한 메서드에 담겨 있다.

```java
@PostMapping("/login")
public ResponseEntity<Map<String, String>> login(@RequestBody LoginRequestDto dto) {
    private final String DEFAULT_REALM;
    private final String AUTH_QUERYSTRING;
    private final JwtUtil jwtUtil;
    private final RestClient authRestClient;
    private final SecuritySessionStore sessionStore;
    //... 생성자 생략

    // (2장) PVE에 보낼 폼 데이터 조립 ── 개별 값만 인코딩
    String username = TypeUtil.encodeUTF_8(dto.username());
    String password = TypeUtil.encodeUTF_8(dto.password());
    String realm = StringUtils.hasText(dto.realm())
            ? TypeUtil.encodeUTF_8(dto.realm()) : DEFAULT_REALM;
    String formData = String.format(AUTH_QUERYSTRING, username, password, realm);

    ParameterizedTypeReference<ProxmoxResponse<ProxmoxTicketResponse>> responseType
            = new ParameterizedTypeReference<>() {};

    // (2장) PVE /access/ticket 호출
    ProxmoxResponse<ProxmoxTicketResponse> pveRes;
    try {
        pveRes = authRestClient.post()
                .uri("/access/ticket")
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(formData)
                .retrieve()
                .body(responseType);
    } catch (HttpClientErrorException.Unauthorized e) {
        // (3장) PVE 401 → 도메인 예외로 번역
        throw new InvalidCredentialsException(e);
    }

    if (pveRes == null || pveRes.data() == null) {
        throw new InvalidCredentialsException(null);
    }
    // ResourceAccessException, HttpServerErrorException 등은 잡지 않는다 → 전역 advice로

    // (4장) 세션 생성 + JWT 발급
    ProxmoxTicketResponse ticketData = pveRes.data();
    SecuritySession session = new SecuritySession(
            ticketData.username(), ticketData.ticket(),
            ticketData.CSRFPreventionToken(), java.time.Instant.now());
    String sid = sessionStore.create(session);
    String jwt = jwtUtil.createToken(ticketData.username(), sid);
    return ResponseEntity.ok(Map.of("token", jwt));
}
```

이 메서드가 하는 일은 네 단계다 ─ **폼 조립, PVE 호출, 실패 분류, 세션·토큰 발급.** 각 단계마다 짚을 결정과 삽질이 있다.

<br/>

## 2. PVE에 티켓을 요청한다

### 2-1. 인터셉터 없는 RestClient

로그인은 `authRestClient`라는 별도 클라이언트로 PVE를 호출한다.

```java
this.authRestClient = RestClient.builder()
        .requestFactory(pveRequestFactory)   // 요청 팩토리(TLS·타임아웃)는 공유
        .baseUrl(apiUrl)
        .build();                            // 동적 인증 인터셉터는 안 붙임
```

왜 인터셉터를 빼느냐 ─ **로그인은 티켓을 *받아오는* 요청이기 때문이다.** 05의 동적 인터셉터는 "현재 사용자의 PVE 티켓을 헤더에 주입"하는 역할인데, *로그인 시점엔 아직 티켓이 없다.* 티켓을 얻으려고 하는 요청에 티켓 주입 로직을 태우는 건 앞뒤가 안 맞는다(닭이 없는데 달걀을 붙일 수 없다). 그래서 TLS·타임아웃 설정이 담긴 요청 팩토리(`pveRequestFactory`)만 공유하고, 인터셉터는 떼어낸 클라이언트를 따로 만든다.

### 2-2. realm 누락이라는 함정

PVE에 보낼 폼 데이터를 조립하는 부분이다. *여기서 한참 헤멤.*

증상은 이랬다 ─ **PVE 웹 GUI로는 같은 계정·비밀번호로 로그인이 멀쩡히 되는데, CMP를 통하면 계속 401이 떨어졌다.** GUI와 CMP의 차이가 어디 있는지가 핵심이었다.

원인은 **realm(인증 영역)** 이었다. PVE는 사용자를 내부적으로 `<userid>@<realm>` 형식으로 식별한다. `@pam`은 PAM(Pluggable Authentication Module), 즉 그 노드의 리눅스 사용자 인증을 가리킨다 ([pveum 문서](https://pve.proxmox.com/pve-docs/pveum.1.html)). 그런데 **PVE 웹 GUI에는 username 칸과 별개로 Realm 드롭다운이 있어서, 사용자가 `root`만 쳐도 GUI가 뒤에서 `root@pam`으로 조립해 보낸다.** 반면 내 CMP 코드는 폼에 `root`만 들어오면 realm 없이 `username=root`로 보냈고, PVE는 그걸 알아서 pam으로 가정해주지 않으니 "사용자 조회 실패 → 401"이었던 것이다.

curl로 30초 만에 확정했다. CMP가 돌아가는 개발 환경 shell에서 직접 쏴봤다.

```bash
# realm 붙여서
curl -k -d "username=root@pam" --data-urlencode "password=<비번>" \
     https://10.10.1.11:8006/api2/json/access/ticket
# → ticket 정상 발급

# realm 빼고
curl -k -d "username=root" --data-urlencode "password=<비번>" \
     https://10.10.1.11:8006/api2/json/access/ticket
# → {"data":null} 401
```

`root@pam`은 티켓이 떨어지고 `root`는 `{"data":null}` 401 ─ realm 누락이 범인으로 확정됐다.

해결은 두 가지를 했다. realm을 `application.properties`에 외부화하고(`proxmox.auth.default-realm=pam`), 폼 본문에 **`&realm=`을 별도 파라미터로** 붙였다. 위 코드의 이 줄이 그 처리다.

```java
String realm = StringUtils.hasText(dto.realm())
        ? TypeUtil.encodeUTF_8(dto.realm()) : DEFAULT_REALM;   // 요청에 realm 없으면 기본값 pam
```

요청 DTO에 realm이 명시돼 있으면 그걸 쓰고, 없으면 기본값 `pam`으로 채운다. PVE는 `username=root&password=...&realm=pam`을 받아 `root@pam`으로 해석한다.

### 2-3. %25 이중 인코딩이라는 함정

realm을 잡고 나니 다른 게 터졌다 ─ `UnknownFormatConversionException`. 폼 조립에 쓰는 쿼리 문자열 템플릿을 통째로 URL 인코딩한 것이 문제였다.

`AUTH_QUERYSTRING`은 `String.format`에 넣을 **템플릿**이라 `%s` 플레이스홀더를 가지고 있다.

```java
private final String AUTH_QUERYSTRING;   // "username=%s&password=%s&realm=%s"
```

그런데 한때 이 템플릿 문자열 자체를 `URLEncoder.encode()`에 통과시켰더니, **`%`가 `%25`로 인코딩되면서 `%s`가 `%25s`로 변질**됐다. `String.format`은 `%25s`를 해석하지 못해 예외를 던졌다. URL 인코딩에서 `%`는 이스케이프의 시작 문자라 그 자신이 `%25`로 변환된다는 걸 간과한 것이다.

올바른 해법의 원칙은 명확하다. **인코딩은 개별 파라미터 *값*에만 적용하고, 구조 문자열(`key=%s&key=%s`)이나 URL 컴포넌트에는 절대 적용하지 않는다.** 위 1장 코드를 다시 보면 그 원칙이 지켜져 있다.

```java
String username = TypeUtil.encodeUTF_8(dto.username());   // 값만 인코딩
String password = TypeUtil.encodeUTF_8(dto.password());   // 값만 인코딩
String realm    = ... TypeUtil.encodeUTF_8(dto.realm()) : DEFAULT_REALM;
String formData = String.format(AUTH_QUERYSTRING, username, password, realm);  // 조립은 format으로
```

각 값(`username`/`password`/`realm`)만 인코딩하고, 골격인 `AUTH_QUERYSTRING`은 그대로 둔 채 `String.format`으로 조립한다. 값에 특수문자(`!`, `@` 등)가 섞여도 안전하게 이스케이프되고, 템플릿의 `%s`는 멀쩡히 살아남는다.

<br/>

## 3. 응답을 분류한다 ─ 401을 도메인 언어로

PVE 호출을 감싼 try-catch가 단순해 보이지만 설계 의도가 있다.

```java
try {
    pveRes = authRestClient.post() ... .body(responseType);
} catch (HttpClientErrorException.Unauthorized e) {
    throw new InvalidCredentialsException(e);   // 401만 콕 집어 도메인 예외로
}
// ResourceAccessException, HttpServerErrorException 등은 잡지 않는다 → 전역 advice로
```

핵심은 **잡는 예외와 안 잡는 예외를 의도적으로 가른다**는 점이다.

- **`HttpClientErrorException.Unauthorized`(PVE의 401)만 잡는다.** 그리고 그 자리에서 `InvalidCredentialsException`이라는 *도메인 예외*로 번역한다. PVE가 던진 HTTP 401을, "자격증명이 틀렸다"는 CMP의 도메인 언어로 바꾸는 것이다. 이렇게 하면 똑같은 HTTP 401이라도 *어느 호출 지점에서 났는가*에 따라 사용자에게 다른 메시지를 줄 수 있다(*로그인에서 난 401 = "아이디·비번을 확인하세요"*, 다른 곳에서 난 401 = 다른 메시지).
- **`ResourceAccessException`(PVE에 못 닿음)이나 `HttpServerErrorException`(PVE 5xx)은 일부러 안 잡는다.** 이것들은 자격증명 문제가 아니라 인프라 문제다. 로그인 컨트롤러가 떠안을 일이 아니라서, 잡지 않고 그대로 위로 흘려보내 전역 예외 처리기(`GlobalExceptionHandler`)가 502·503 같은 적절한 상태로 처리하게 둔다.

`InvalidCredentialsException`은 이런 모양이다.

```java
public class InvalidCredentialsException extends CmpException {
    public InvalidCredentialsException(Throwable cause) {
        super(HttpStatus.UNAUTHORIZED, "error.auth.invalid-credentials", cause);
    }
}
```

`CmpException`이라는 공통 베이스를 상속하고, HTTP 상태(401)와 메시지 코드(`error.auth.invalid-credentials`)를 들고 있다. 이 예외 계층 전체와 메시지 코드가 어떻게 사용자 응답으로 변환되는지 ─ `CmpException` 베이스, `MessageSource`를 통한 메시지 해석, RFC 9457 `ProblemDetail` 포맷 ─ 는 [11. 공통화](#) 에서 통합해 다룬다. 07에서는 "로그인의 401을 어떤 도메인 예외로 분류하는가"까지만 본다.

<br/>

## 4. 세션을 만들고 토큰을 찍는다 ─ 인증 Ticket과 JWT

PVE 호출이 성공하면 티켓이 손에 들어온다. 이제 06에서 검증하던 그 세션과 JWT를 만든다.

### 4-1. 세션 생성과 JWT 발급

```java
ProxmoxTicketResponse ticketData = pveRes.data();
SecuritySession session = new SecuritySession(
        ticketData.username(), ticketData.ticket(),
        ticketData.CSRFPreventionToken(), java.time.Instant.now());
String sid = sessionStore.create(session);                  // 세션 저장 → sid 반환
String jwt = jwtUtil.createToken(ticketData.username(), sid);// sid를 담은 JWT 발급
return ResponseEntity.ok(Map.of("token", jwt));
```

PVE가 준 `ticket`과 `CSRFPreventionToken`을 `SecuritySession`에 담아 저장소에 넣고(`create`), 반환 받은 `sid`를 JWT에 실어 발급한다. **여기가 06 전체의 발원지다.** 06의 필터가 "JWT에서 `sid`를 꺼내 `sessionStore.find(sid)`로 티켓을 가져온다"고 했던 ─ 그 `sid`와 세션이 바로 여기서 만들어진다. 그리고 PVE 티켓은 응답(`{"token": jwt}`)에 담기지 않는다. 클라이언트가 받는 건 `sid`가 든 JWT뿐이고, 티켓은 서버 저장소에만 머문다. "티켓 클라이언트 미노출"이 실제로 지켜지는 지점이다.

### 4-2. SecuritySession ─ 왜 110분인가

세션 객체는 PVE 티켓과 그 수명을 들고 있는 `record`다.

```java
public record SecuritySession(
        String username, String ticket, String CSRFPreventionToken, Instant issuedAt) {

    // PVE 티켓 수명은 2시간. 만료 직전 사용을 피하려고 약간 짧게(110분) 잡는다.
    private static final Duration TTL = Duration.ofMinutes(110);

    public boolean isExpired() {
        return Instant.now().isAfter(issuedAt.plus(TTL));
    }
}
```

TTL **110분:** PVE 티켓의 실제 수명은 2시간(120분)인데, 우리 세션은 그보다 10분 짧게 만료시킨다. 까닭은 경계 조건 회피다 ─ 만약 세션 TTL을 PVE와 똑같이 120분으로 두면, 119분 59초에 "세션은 아직 유효"하다고 판정해 PVE를 호출했는데 그 사이 PVE 티켓이 만료돼버리는 틈이 생긴다. 10분의 안전 마진을 둬서, "우리가 유효하다고 본 티켓은 PVE에서도 확실히 유효"하도록 보장한다.

### 4-3. SecuritySessionStore ─ ConcurrentHashMap

세션을 보관하는 저장소다. 06에서 "필터가 `find(sid)`로 조회한다"던 그 저장소의 실체다.

```java
@Component
public class SecuritySessionStore {
    private final Map<String, SecuritySession> store = new ConcurrentHashMap<>();

    public String create(SecuritySession session) {
        String sid = UUID.randomUUID().toString();   // 추측 불가능한 세션 ID
        store.put(sid, session);
        return sid;
    }

    public SecuritySession find(String sid) {
        if (sid == null) return null;
        SecuritySession session = store.get(sid);
        if (session == null) return null;
        if (session.isExpired()) {                    // 조회 시점에 만료 확인 (lazy)
            store.remove(sid);                        // 만료됐으면 청소하고
            return null;                              // 없는 셈 친다
        }
        return session;
    }

    public void remove(String sid) {
        if (sid != null) store.remove(sid);
    }
}
```

세 가지를 짚는다.

- **`ConcurrentHashMap`을 쓴다.** 여러 요청이 동시에 세션을 읽고 쓸 수 있는 멀티스레드 환경이라, 일반 `HashMap`은 동시성 문제(데이터 손상, 무한 루프)를 일으킨다. 락(lock) 없이도 스레드 안전한 `ConcurrentHashMap`이 정석이다.
- **`sid`는 `UUID.randomUUID()`로 만든다.** 순번 같은 추측 가능한 값이면 공격자가 남의 `sid`를 찍어 세션을 가로챌 수 있다. UUID는 사실상 추측이 불가능하다.
- **만료는 조회 시점에 확인한다(Lazy Expiration).** 별도의 청소 스레드를 돌리지 않고, `find`로 세션을 가져오려 할 때 만료됐으면 그제야 제거한다. 단일 노드 홈랩 규모에선 이걸로 충분하다. *논리적 추론: 세션 수가 폭증하는 환경이라면 만료된 세션이 조회되기 전까지 메모리에 쌓이므로, 주기적 스윕(sweep)이나 만료 기반 캐시(예: Caffeine)로 옮기는 게 맞다. 지금 규모에선 과한 설계라 미뤄둔다.*

<br/>

## 5. 동적 인증 인터셉터

```java
ClientHttpRequestInterceptor dynamicAuthInterceptor = (request, body, execution) -> {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth != null && auth.getDetails() instanceof Map<?, ?> details) {
        String pveTicket = (String) details.get("pve_ticket");
        String pveCsrf   = (String) details.get("pve_csrf");

        if (pveTicket != null && StringUtils.isNotBlank(pveTicket)) {
            request.getHeaders().add("Cookie", String.format("PVEAuthCookie=%s", pveTicket));
        }
        if (pveCsrf != null && StringUtils.isNotBlank(pveCsrf)) {
            request.getHeaders().add("CSRFPreventionToken", pveCsrf);
        }
    }
    return execution.execute(request, body);
};
```

`details`의 `pve_ticket`/`pve_csrf`는 **06의 `JwtAuthenticationFilter`가 채운 것**이다. 사슬을 처음부터 끝까지 다시 그리면 이렇게 맞물린다.

```markdown
[로그인]  AuthController: PVE 티켓 수령 → SecuritySession에 저장 → sid를 JWT로 발급
    ↓ (이후 모든 요청)
 [검증]    JwtAuthenticationFilter: JWT의 sid로 세션 조회 → 티켓을 details에 적재
    ↓
 [주입]    dynamicAuthInterceptor: details에서 티켓을 꺼내 PVE 헤더로 변환
    ↓
 [도달]    PVE가 인증된 요청으로 처리
```

발급(07)이 티켓을 만들고, 검증(06)이 그걸 컨텍스트에 놓고, 주입(05)이 헤더로 옮긴다. **세 문서에 걸쳐 흩어져 있던 분업이 이 한 흐름으로 모인다.**

티켓과 CSRF의 전송 채널이 다른 점도 짚어둘 만하다. **티켓은 `Cookie` 헤더(`PVEAuthCookie=`)로, CSRF 토큰은 `CSRFPreventionToken` 헤더로** 따로 실린다. PVE 규칙상 GET 요청은 쿠키(티켓)만 있으면 되지만, POST·PUT·DELETE 같은 상태 변경 요청은 쿠키와 CSRF 토큰이 **둘 다** 필요하다([PVE API Wiki](https://pve.proxmox.com/wiki/Proxmox_VE_API)). 인터셉터가 둘을 항상 함께 붙이므로, 읽기든 쓰기든 인증이 누락될 일이 없다.

<br/>

## 6. 로그아웃 ─ 즉시 무효화의 실행

06에서 "sid 방식의 값어치는 서버측 즉시 무효화"라고 했다. 그 무효화가 실제로 일어나는 곳이 로그아웃이다.

```java
@PostMapping("/logout")
public ResponseEntity<Void> logout(HttpServletRequest request) {
    String jwt = jwtUtil.parseJwt(request);
    Claims claims = (jwt != null) ? jwtUtil.getClaims(jwt) : null;
    if (claims != null) {
        sessionStore.remove(claims.get("sid", String.class));   // 서버 세션 폐기
    }
    return ResponseEntity.noContent().build();
}
```

JWT에서 `sid`를 꺼내 저장소에서 세션을 제거한다. 이 한 줄이 끝나는 순간, **그 JWT는 서명·만료가 멀쩡해도 무력화된다.** 이후 그 토큰으로 요청이 와도 06의 필터가 `find(sid)`에서 `null`을 받아(세션이 없으니) 인증을 세우지 못하기 때문이다. 무상태 JWT 단독으로는 불가능한 "발급된 토큰의 즉시 취소"가, 서버 세션을 한 줄 지우는 것으로 실현된다.

<br/>

## 7. 프론트엔드 인증

백엔드 창구가 섰으니, 브라우저 쪽도 그에 맞춰 토큰을 다루고 만료에 대응해야 한다.

### 7-1. 로그인과 토큰 영속화

처음엔 발급받은 JWT를 휘발성 Vue `ref`에만 담았다. 그랬더니 **페이지를 새로고침하면 토큰이 날아가** 로그인이 풀렸다. 그래서 `sessionStorage`에 영속화한다.

```javascript
const handleLogin = async () => {
    // ... 입력 검증 ...
    const response = await axios.post("/auth/login", loginForm.value);
    const token = response.data.token;
    jwtToken.value = token;
    sessionStorage.setItem(TOKEN_KEY, token);        // 새로고침에도 살아남게 저장
    sessionStorage.setItem(USER_KEY, loginForm.value.username);
    // ... 로그인 직후 데이터 로드 ...
};
```

그리고 앱이 다시 마운트될 때 저장소에서 토큰을 복원(rehydrate)한다.

```javascript
onMounted(async () => {
    const savedToken = sessionStorage.getItem(TOKEN_KEY);
    if (savedToken) {
        jwtToken.value = savedToken;                 // 새로고침 후 세션 복원
        // ... 저장된 토큰으로 데이터 재로드 ...
    }
});
```

`localStorage`가 아니라 [`sessionStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)를 쓴 건, 탭을 닫으면 토큰이 자동으로 사라지게 하기 위해서다. 브라우저를 닫고도 토큰이 영구히 남는 것보다는, 세션 단위로 휘발되는 편이 나아 보였다.

### 7-2. axios 인터셉터 ─ 자동 주입과 401 일괄 처리

PVE를 호출하는 모든 요청에 일일이 토큰을 붙이는 건 번거롭고 실수하기 쉽다. [axios 인터셉터](https://axios-http.com/docs/interceptors)로 자동화한다.

```javascript
const api = axios.create({ baseURL: '/api' });

// 요청 인터셉터: 나가는 모든 요청에 Bearer 토큰 자동 주입
api.interceptors.request.use(config => {
    if (jwtToken.value) {
        config.headers.Authorization = `Bearer ${jwtToken.value}`;
    }
    return config;
});

// 응답 인터셉터: 401이 오면 세션 정리하고 로그인 화면으로
api.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status == 401) {
            clearSession();
            console.warn("로그인 세션 만료");
        }
        return Promise.reject(error);
    }
);
```

여기서 응답 인터셉터의 401 처리가 **06의 `AuthenticationEntryPoint`와 짝을 이룬다.** 서버에서 인증이 깨지면(토큰 만료·세션 폐기 등) EntryPoint가 401을 내보내고, 프런트의 이 인터셉터가 그 401을 받아 `clearSession()`으로 로컬 토큰을 비우고 로그인 화면으로 되돌린다. 백엔드의 "일관된 401 출구"와 프런트의 "일관된 401 수신"이 맞물리는 구조다.

### 7-3. 로그아웃의 함정 ─ baseURL 라우팅

로그아웃은 서버 세션을 죽여야 하므로 `/auth/logout`을 호출하는데, 위에서 만든 `api` 인스턴스를 쓰면 안 된다.

```javascript
const handleLogout = async () => {
    try {
        // api 인스턴스(baseURL: '/api') 대신 root-level axios 사용
        await axios.post('/auth/logout', {}, {
            headers: { Authorization: `Bearer ${jwtToken.value}` }
        });
    } catch (error) {
        console.warn("서버 로그아웃 실패(무시 가능):", error);
    }
    clearSession();
    // ...
};
```

이유는 `api` 인스턴스에 `baseURL: '/api'`가 걸려 있어서다. `api.post('/auth/logout')`을 호출하면 실제 요청은 `/api/auth/logout`으로 나가는데, 로그아웃 엔드포인트는 `/auth/logout`이라 경로가 어긋난다. 그래서 baseURL이 없는 최상위 `axios`를 직접 써서 `/auth/logout`으로 정확히 보내고, 인증 헤더는 명시적으로 붙인다. 서버 세션을 먼저 죽인 뒤 `clearSession()`으로 로컬을 정리하므로, 저장소에 좀비 세션이 남지 않는다.

> `clearSession()`은 `sessionStorage`를 비우고 폴링 타이머를 멈추는 등 로컬 상태를 정리하는 공통 헬퍼다. 401 인터셉터(7-2)와 로그아웃(7-3)이 같은 헬퍼를 공유해, "세션 종료"라는 한 가지 일을 한 곳에서 처리한다.

<br/>

## 요약

07에서 인증 사슬을 끝맺었다.

- **로그인(`AuthController`)** ─ 인터셉터 없는 클라이언트로 PVE `/access/ticket` 호출, realm 누락 삽질(GUI는 자동 조립, CMP는 명시 필요)과 `%25` 이중 인코딩 삽질(값만 인코딩, 구조는 보존)의 해결, 401을 `InvalidCredentialsException`으로 번역하되 인프라 예외는 전역으로 흘려보내는 책임 분리.
- **세션과 토큰의 탄생** ─ PVE 티켓을 `SecuritySession`에 담아 저장하고 `sid`를 JWT로 발급(06 검증의 발원지), 110분 TTL의 안전 마진, `ConcurrentHashMap`·UUID·Lazy Expiration의 저장소.
- **사슬의 완결** ─ 05에서 미룬 동적 인터셉터의 출처를 06 필터로 확정(발급→검증→주입), 로그아웃으로 실현되는 즉시 무효화, 그리고 프런트의 토큰 영속화·axios 401 인터셉터가 백엔드 EntryPoint와 이루는 짝.

이제 인증은 완성됐다. 로그인한 사용자가 PVE를 안전하게 호출할 수 있다. 그런데 **이 사슬엔 닿지 않는 사각지대가 하나 있다** ─ `@Async`로 도는 비동기 백그라운드 스레드다.

`SecurityContextHolder`는 `ThreadLocal` 기반이라 요청 스레드에서 갈라져 나온 비동기 스레드로는 인증 컨텍스트가 전파되지 않는다. 그래서 백그라운드 작업이 PVE를 호출하면 인터셉터가 티켓을 못 찾아 401로 죽는다. 이 회귀(regression)를 어떻게 푸는지가 [10. TaskMonitor](#) 꼭지의 주제다.

그전에, 다음 [08번](#)에서는 이 인증 위에 올라타는 첫 기능 슬라이스 ─ VM 제어와 Task·Log 조회 ─ 를 만든다.
