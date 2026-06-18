---
title: "06. Spring Security 골격 ─ JWT 검문소와 인증 컨텍스트"
date: 2026-06-14
lastmod: 2026-06-16
author: "Davi"
description: "PVE 호출 인프라 위에 인증 관문을 세운다. SecurityConfig의 STATELESS 필터 체인, 요청마다 도는 JwtAuthenticationFilter, JWT엔 sid만 담고 티켓은 서버 세션에 두는 이중 검증 설계, 그리고 인증 실패를 401로 모으는 EntryPoint까지 다룬다."
slug: spring-security
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 6
series: "Proxmox 실습 v2."
series_order: 6
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


[05번](./05-rest-client-config.md)에서 PVE를 호출할 인프라를 깔았다. `RestClient`가 준비됐고, 요청이 나갈 때마다 현재 사용자의 PVE 티켓을 헤더로 자동 주입하는 인터셉터도 박아뒀다. 여전히 문제가 남아있다면, **지금 이 상태로는 누구나 `/api/proxmox/**`를 때릴 수 있다.** 그리고 인터셉터가 읽으려는 **`SecurityContextHolder`의 인증 정보** ─ 그 안의 `pve_ticket` ─ 는 아직 아무도 채워주지 않는다.

그 두 구멍을 메우는 **관문(Security)** 을 만들어야 한다.

1. **인증되지 않은 요청을 어떻게 걸러낼 것인가?** ─ 토큰 없는 요청은 차단하고, 열어둘 경로(로그인, 정적 파일)는 통과시키는 규칙. (`SecurityConfig`)
2. **인증된 요청에 어떻게 신분과 PVE 자격증명을 실어줄 것인가?** ─ 요청마다 JWT를 검증하고, 그 결과로 인증 컨텍스트를 세워 05의 인터셉터가 읽을 자리에 티켓을 놓아주는 일. (`JwtAuthenticationFilter`)

> 헷갈리지 말 것 ─ 06은 인증을 **검문하는** 측이다. 인증을 **발급하는** 측, 즉 "로그인이 PVE에서 티켓을 받아 세션을 만들고 JWT를 찍는" 과정은 [07. 로그인/인증](./07-auth-login.md) 꼭지다. 여기선 검문소를 짓고, 07에서 통행증을 발급한다.

<br/>

## 1. 무엇을 막고 무엇을 열 것인가 ─ SecurityConfig

Spring Security의 동작은 결국 **필터 체인(Filter Chain)** 하나로 수렴한다. 들어오는 모든 요청은 여러 보안 필터를 순서대로 통과하고, 그 과정에서 인증·인가가 판정된다 ([Spring Security 아키텍처](https://docs.spring.io/spring-security/reference/servlet/architecture.html)). `SecurityConfig`는 그 체인을 우리 입맛대로 구성하는 곳이다. 전체를 먼저 보자.

```java
@Configuration @EnableWebSecurity
public class SecurityConfig {

    private final AuthenticationEntryPoint entryPoint;
    // ... 생성자 생략 ...

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtUtil jwtUtil,
                                    SecuritySessionStore sessionStore) throws Exception {
        http
            // REST API라 CSRF 방어 비활성화
            .csrf(csrf -> csrf.disable())

            // 폼 로그인 / HTTP Basic 인증 비활성화
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())

            // 서버에 세션 상태를 저장하지 않는다 (HttpSession 미사용)
            .sessionManagement(session ->
                    session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // 인증 실패를 처리할 EntryPoint를 커스텀
            .exceptionHandling(e -> e.authenticationEntryPoint(entryPoint))

            // 경로별 권한 설정
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers("/", "/index.html", "/css/**", "/js/**",
                                     "/favicon.ico", "/error").permitAll()
                    .requestMatchers("/api/public/**", "/auth/**").permitAll()
                    .requestMatchers("/api/proxmox/**").authenticated()
                    .anyRequest().authenticated()
            )

            // 커스텀 JWT 필터를 표준 인증 필터 앞에 끼운다
            .addFilterBefore(new JwtAuthenticationFilter(jwtUtil, sessionStore),
                             UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
```

이 한 덩어리에 모든 검문 절차가 압축되어 있다.

### 1-1. CSRF·폼 로그인·HTTP Basic을 끈다

```java
.csrf(csrf -> csrf.disable())
.formLogin(form -> form.disable())
.httpBasic(basic -> basic.disable())
```

세 개를 모두 끈다.

- **CSRF(Cross-Site Request Forgery) 비활성화** ─ CSRF 공격은 "브라우저가 쿠키를 자동으로 실어 보낸다"는 성질을 악용하는 것이다. 그런데 이 API는 인증을 **쿠키가 아니라 `Authorization: Bearer` 헤더**로 받는다. 헤더는 브라우저가 자동으로 붙여주지 않으므로, 공격자가 사용자의 인증을 도용할 경로 자체가 없다. CSRF 토큰 검증은 무의미한 오버헤드라 끈다.
- **폼 로그인 / HTTP Basic 비활성화** ─ Spring Security가 기본 제공하는 로그인 페이지나 브라우저 기본 인증 팝업을 쓰지 않는다. 이 프로젝트는 자체 `/auth/login` 엔드포인트로 JWT를 발급하는 방식이라, 기본 인증 메커니즘이 끼어들면 오히려 방해가 된다.

### 1-2. STATELESS ─ 그런데 세션 저장소는 왜 있나

```java
.sessionManagement(session ->
        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
```

`SessionCreationPolicy.STATELESS`는 **Spring Security가 `HttpSession`을 만들지도, 참조하지도 않게** 한다. 즉 서블릿 컨테이너의 세션(`JSESSIONID` 쿠키)을 쓰지 않는다. 매 요청은 자기가 들고 온 JWT만으로 자신을 증명해야 한다.

*뒤에 가서 의문이 생길 수 있다.* **PVE 티켓을 담아두기 위한 서버측 저장소**(`SecuritySessionStore`)를 만들 것이기에 모순처럼 생각할 수 있다. 하지만 둘은 **다른 층위의 "세션"** 이다.

| 구분 | 대상 | 이 프로젝트에서 |
| --- | --- | --- |
| `HttpSession` (STATELESS로 끔) | 서블릿 컨테이너가 관리하는 사용자 세션, `JSESSIONID` | **안 쓴다.** 인증은 JWT가 무상태로 처리. |
| `SecuritySessionStore` (직접 구현) | 애플리케이션이 관리하는 PVE 자격증명 보관소 | **쓴다.** PVE 티켓이라는 상태를 서버 메모리에 보관. |

정리하면 이 시스템은 **"무상태 인증(JWT)"** 과 **"유상태 자격증명 보관(세션 저장소)"** 을 분리해서 조합한다. 클라이언트와의 인증 핸드셰이크는 무상태(JWT)로 가볍게 가져가되, 외부로 새면 안 되는 PVE 티켓만은 서버가 상태로 떠안는다. 이 분리가 꽤 중요하다고 한다.

### 1-3. 무엇을 열고 무엇을 잠그나

```java
.authorizeHttpRequests(auth -> auth
        .requestMatchers("/", "/index.html", "/css/**", "/js/**",
                         "/favicon.ico", "/error").permitAll()
        .requestMatchers("/api/public/**", "/auth/**").permitAll()
        .requestMatchers("/api/proxmox/**").authenticated()
        .anyRequest().authenticated()
)
```

규칙은 위에서 아래로 매칭된다. 정적 리소스(`/`, `css`, `js` 등)와 로그인 경로(`/auth/**`)는 인증 없이 열고(`permitAll`), PVE를 다루는 `/api/proxmox/**`는 인증을 요구하며(`authenticated`), 나머지는 전부 인증 요구로 막는다.

여기서 `/error`를 `permitAll`에 넣은 건 **실수가 아니라 의도된 처리**다.<br/>
인증 안 된 사용자가 존재하지 않는 정적 파일을 요청하면 404가 나는데, 이게 곧장 사용자에게 가지 않고 서블릿의 에러 디스패치를 거쳐 내부적으로 `/error`로 다시 포워딩된다. 만약 `/error`마저 인증을 요구하면, 보안 필터가 그 내부 포워딩을 가로채 **404를 401(권한 없음)로 덮어써 버린다.** 원래 "파일 없음"이었던 게 "인증하라"로 둔갑하는 것이다. `/error`를 열어두면 이 덮어쓰기가 사라지고, 404 에러는 404로 정직하게 나간다.

### 1-4. ignoring() 대신 permitAll() ─ 트레이드오프

정적 리소스를 보안에서 빼는 방법은 사실 두 가지다. 위에서 쓴 `permitAll()`과, 아예 보안 필터 자체를 건너뛰게 하는 `WebSecurityCustomizer.ignoring()`이다. 이 프로젝트엔 후자를 시도했다가 접은 흔적이 주석으로 남아 있다.

```java
// @Bean
// WebSecurityCustomizer webSecurityCustomizer() {
//     return web -> web.ignoring().requestMatchers(
//             "/favicon.ico", "/css/**", "/js/**", "/index.html", "/");
// }
```

둘의 차이는 **"보안 필터 체인을 통과하느냐"** 에 있다.

- `ignoring()` ─ 지정한 경로는 보안 필터 체인을 **통째로 건너뛴다.** 정적 파일 요청에 보안 로직이 한 줄도 안 돌므로 이론상 가장 가볍다.
- `permitAll()` ─ 경로가 보안 필터 체인을 **거치되**, 인가 단계에서 "통과"로 판정된다. 필터를 타긴 탄다.

성능만 보면 `ignoring()`이 유리해 보이지만, **현재 Spring Security는 `permitAll()`을 권장한다.** `ignoring()`으로 필터를 통째로 우회하면 그 경로엔 보안 헤더(예: 콘텐츠 보안 정책) 적용 같은 기본 방어도 함께 사라지고, "어디는 검문하고 어디는 아예 검문소 밖"이라는 이원화가 설정을 헷갈리게 만든다. 모든 요청을 하나의 필터 체인으로 일관되게 흘려보내고 인가 단계에서만 가르는 편이, 정적 파일 몇 개의 미세한 오버헤드를 감수하더라도 더 안전하고 명료하다. 그래서 `ignoring()`을 주석으로 남기고 `permitAll()`로 갔다.

### 1-5. 커스텀 필터를 표준 필터 앞에 끼운다

```java
.addFilterBefore(new JwtAuthenticationFilter(jwtUtil, sessionStore),
                 UsernamePasswordAuthenticationFilter.class);
```

`addFilterBefore`는 우리가 만든 `JwtAuthenticationFilter`를 `UsernamePasswordAuthenticationFilter`보다 **앞에** 배치한다. `UsernamePasswordAuthenticationFilter`는 Spring Security가 폼 로그인 자격증명을 처리하는 표준 위치인데, 그 앞에 우리 JWT 필터를 끼움으로써 **표준 인증 로직이 돌기 전에 JWT를 먼저 검증하고 인증 컨텍스트를 세우게** 한다. 다음 장의 주인공이 바로 이 필터다.

> `filterChain` 메서드가 `JwtUtil`과 `SecuritySessionStore`를 파라미터로 받아 필터 생성자에 넘기는 점을 눈여겨본다. 필터를 `new`로 직접 만들기 때문에, 의존성을 스프링이 자동 주입할 수 없어 이렇게 `@Bean` 메서드 파라미터로 받아다 손수 전달한다.

<br/>

## 2. 요청마다 신분을 검증한다 ─ JwtAuthenticationFilter

`JwtAuthenticationFilter`는 모든 요청에서 정확히 한 번 실행되며, "이 요청은 누구인가"를 판정해 인증 컨텍스트를 세운다.

```java
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final SecuritySessionStore sessionStore;
    // ... 생성자 생략 ...

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            String jwt = jwtUtil.parseJwt(request);                  // 헤더에서 토큰 추출
            Claims claims = (jwt != null) ? jwtUtil.getClaims(jwt) : null;  // 서명·만료 검증

            if (claims != null) {
                // JWT엔 sid만 들었다. 실제 PVE 티켓은 서버 저장소에서 꺼낸다.
                String sid = claims.get("sid", String.class);
                SecuritySession session = sessionStore.find(sid);   // 만료/로그아웃이면 null

                if (session != null) {
                    UsernamePasswordAuthenticationToken authentication =
                            new UsernamePasswordAuthenticationToken(
                                    session.username(), null, List.of());

                    // 05의 인터셉터가 읽을 PVE 자격증명. 서버 메모리 안에서만 흐른다.
                    Map<String, String> pveDetails = Map.of(
                            "pve_ticket", session.ticket(),
                            "pve_csrf", session.CSRFPreventionToken());
                    authentication.setDetails(pveDetails);

                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
                // session == null → 인증 미설정 → EntryPoint가 401
            }
        } catch (Exception e) {
            logger.error("cannot set user authentication:", e);
        }
        filterChain.doFilter(request, response);
    }
}
```

### 2-1. OncePerRequestFilter

`OncePerRequestFilter`를 상속한 이유는 이름 그대로다. 한 요청이 내부 포워딩(예: `/error` 디스패치) 등으로 필터 체인을 여러 번 타더라도, **인증 검증을 요청 당 딱 한 번만** 수행하도록 보장한다. 중복 검증으로 인한 낭비나 부작용을 막는 표준 베이스 클래스다.

### 2-2. 검증이 두 겹이다 ─ 이 설계의 핵심

이 필터에서 가장 중요한 줄 ─

```java
String sid = claims.get("sid", String.class);
SecuritySession session = sessionStore.find(sid);
```

JWT에서 꺼내는 건 PVE 티켓이 아니라 **`sid`(세션 ID) 하나뿐**이다. 그 `sid`로 서버 저장소를 조회하여, PVE 티켓과 CSRF 토큰을 담은 실제 세션 을 가져온다. 이게 무슨 의미인가 하면, 처음에 어떤 길을 가려다 틀었는지부터 봐야 한다.

`JwtUtil`에 그 흔적이 주석으로 남아 있다.

```java
//* public String createToken(String username, String ticket, String CSRFPreventionToken) {
public String createToken(String username, String sessionId) {
```

처음엔 **PVE 티켓과 CSRF 토큰을 JWT 안에 직접 담으려** 했다(주석 처리된 옛 시그니처). 그러면 서버 저장소가 필요 없어 단순하다. 그런데 그 방식엔 두 가지 문제가 있었다.

1. **클라이언트에 PVE 티켓이 노출된다.** JWT는 서명될 뿐 암호화되지 않는다. 페이로드는 Base64 디코드만 하면 누구나 읽는다. PVE 티켓을 JWT에 담으면, 그 티켓이 브라우저(클라이언트)까지 평문으로 흘러간다. PVE 자격증명이 서버 밖으로 나가는 건 피하고 싶었다.
2. **무효화(Revocation)가 불가능하다.** 무상태 JWT의 본질적 약점이다. 한번 발급된 JWT는 만료 시각 전까지 서버가 "이건 이제 무효"라고 취소할 방법이 없다. 로그아웃을 눌러도, 그 JWT를 가진 사람은 만료까지 계속 유효하다.

**`sid`만 담는 방식**은 이 둘을 동시에 푼다.

- PVE 티켓은 **서버 저장소(`SecuritySessionStore`)에만** 머물고, 클라이언트는 자기를 가리키는 `sid`만 들고 다닌다. 티켓이 서버 메모리 밖으로 새지 않는다.
- 검증이 **두 겹**이 된다. ① JWT 서명·만료가 유효하고, **그리고** ② 저장소에 그 `sid`의 세션이 살아 있어야 통과한다. 로그아웃하거나 세션을 폐기하면 ②가 깨지므로, JWT가 멀쩡해도 즉시 거부된다. **무상태 JWT 혼자선 못 주는 서버측 즉시 무효화를, 상태를 조금 떠안은 대가로 얻는 것이다.**

**무상태 인증 + 유상태 자격증명 보관.**

### 2-3. PVE 자격증명을 인증 객체에 싣는다

세션을 찾으면 인증 토큰을 만들어 `details`에 PVE 자격증명을 싣는다.

```java
Map<String, String> pveDetails = Map.of(
        "pve_ticket", session.ticket(),
        "pve_csrf", session.CSRFPreventionToken());
authentication.setDetails(pveDetails);
SecurityContextHolder.getContext().setAuthentication(authentication);
```

여기서 **05에서 깔아둔 체인과 연결한다.** 동적 인증 인터셉터가 읽으려던 `auth.getDetails()`의 `pve_ticket`/`pve_csrf`를 바로 여기서 채운다.

```markdown
[요청 도착]
  → JwtAuthenticationFilter:
     └JWT 검증 → sid로 세션 조회 → details에 PVE 티켓 적재 → SecurityContext에 저장(06─현 문서)
  → 컨트롤러가 PVE 호출
      → RestClient 인터셉터:
         └SecurityContext의 details에서 티켓을 꺼내 헤더에 주입(05)
      → PVE에 인증된 요청 도달
```

필터가 컨텍스트에 티켓을 **놓고**, 인터셉터가 그걸 **집어서** PVE 헤더에 붙인다. 필터와 인터셉터의 분업이 한 흐름으로 맞물린다.

### 2-4. 예외를 삼켜 인증 미설정으로 흘려보낸다

마지막으로 눈여겨볼 건, 이 필터가 인증에 실패해도 **직접 에러 응답을 쓰지 않는다**는 점이다.

```java
} catch (Exception e) {
    logger.error("cannot set user authentication:", e);
}
filterChain.doFilter(request, response);   // 어찌 됐든 다음 필터로 넘긴다
```

JWT가 없거나, 위조됐거나, 세션이 없으면 ─ 어느 경우든 `SecurityContext`에 인증을 세우지 *않은 채* 그냥 다음 필터로 넘긴다. 그러면 뒤에서 인가 필터가 "이 요청은 인증이 없는데 `authenticated`가 필요한 경로네"라고 판정하고, 그 거부 처리를 **`AuthenticationEntryPoint`(4장)에 위임**한다. 인증 판정과 에러 응답 생성을 한 군데서 섞지 않고 책임을 나누는 구조다. 필터는 "신분을 세우는 일"만, EntryPoint는 "거부를 응답하는 일"만 한다.

<br/>

## 3. 토큰을 검증하는 도구 ─ JwtUtil

`JwtUtil`은 JWT의 발급과 검증을 담당하는 유틸리티다. JWT 라이브러리로는 [JJWT](https://github.com/jwtk/jjwt)를 쓴다.

### 3-1. 서명 키

```java
public JwtUtil(@Value("${jwt.secret}") String secret) {
    this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
}
```

`application.properties`의 `jwt.secret`으로 HMAC-SHA 대칭 키를 만든다. 이 키로 토큰에 서명하고, 같은 키로 서명을 검증한다. *이 키가 노출되면 누구나 위조 토큰을 만들 수 있다 ─ 05에서 다룬 시크릿 하드코딩 문제가 그래서 위험하다.*

### 3-2. getClaims ─ 예외별로 로그 레벨을 가른다

검증의 알맹이다. JWT를 파싱하다 발생할 수 있는 예외를 종류별로 잡아, **각각 다른 로그 레벨**로 기록한다. 단순히 try-catch로 뭉뚱그리지 않은 데에 의도가 있다.

```java
public Claims getClaims(String token) {
    try {
        return Jwts.parser().verifyWith(secretKey)
                .build().parseSignedClaims(token).getPayload();
    } catch (ExpiredJwtException e) {
        // 만료된 토큰: 토큰 생명주기상 지극히 정상. 그냥 잡음이라 DEBUG.
        log.debug("만료된 토큰 거부: {}", e.getMessage());
    } catch (SignatureException e) {
        // 서명 조작된 위조 토큰: 위조 가능성 → 약한 보안 신호라 WARN.
        log.warn("서명 검증 실패 — 위조 의심 토큰 거부: {}", e.getMessage());
    } catch (MalformedJwtException | UnsupportedJwtException e) {
        // 지원 않는 형식의 토큰: 클라이언트가 쓰레기를 보낸 것. DEBUG.
        log.debug("형식 불량/미지원 토큰 거부: {}", e.getMessage());
    } catch (IllegalArgumentException e) {
        // null/빈/공백 문자열: 사실상 '토큰 없음'. DEBUG.
        log.debug("빈 토큰 거부: {}", e.getMessage());
    } catch (JwtException e) {
        // 위에서 안 걸린 그 외 JWT 예외 전부 ─ 안전망.
        log.warn("기타 JWT 예외로 토큰 거부: {}", e.getMessage());
    }
    return null;
}
```

로그 레벨을 나눈 기준은 **"이게 정상적인 잡음인가, 아니면 의심 신호인가"** 다.

| 예외 | 의미 | 레벨 | 왜 |
| --- | --- | --- | --- |
| `ExpiredJwtException` | 토큰 만료 | DEBUG | 토큰엔 수명이 있으니 만료는 당연한 일상. 운영 로그를 더럽힐 이유가 없다. |
| `SignatureException` | 서명 불일치 | **WARN** | 서명이 안 맞는다는 건 **위조 시도**일 수 있다. 약한 보안 신호라 흔적을 남긴다. |
| `MalformedJwt` / `UnsupportedJwt` | 형식 불량 | DEBUG | 클라이언트가 망가진 토큰을 보낸 것. 보안 위협은 아니다. |
| `IllegalArgumentException` | null/빈 문자열 | DEBUG | 사실상 "토큰 없음". 흔한 상황이다. |
| `JwtException` (그 외) | 미분류 예외 | WARN | 위에서 안 걸린 나머지를 받는 안전망(catch-all). |

이렇게 가르면 운영 중 로그를 볼 때 **WARN만 추려보는 것으로 "위조 의심" 신호에 집중**할 수 있다. 만료 토큰 거부 같은 일상 잡음에 파묻히지 않는다. 그리고 어떤 예외든 마지막엔 `null`을 반환하므로, 호출하는 필터 쪽은 "유효하면 `Claims`, 아니면 `null`"이라는 단순한 계약만 신경 쓰면 된다.

### 3-3. createToken ─ sid만 담는다

발급 메서드다. 위에서 다룬 설계대로 구성한다.

```java
public String createToken(String username, String sessionId) {
    long now = System.currentTimeMillis();
    return Jwts.builder()
            .subject(username)
            .claim("sid", sessionId)            // PVE 티켓이 아니라 세션 ID만
            .issuedAt(new java.util.Date(now))
            .expiration(new java.util.Date(now + 1000 * 60 * 60 * 2))  // 2시간
            .signWith(secretKey)
            .compact();
}
```

페이로드에 들어가는 건 `subject`(사용자명)와 `sid`(세션 ID), 그리고 발급·만료 시각뿐이다. PVE 티켓은 어디에도 없다. 이 토큰이 **언제, 어떤 로그인 절차의 끝에서 발급되는지**는 [07번](#) 꼭지의 몫이다. 여기서는 "발급되는 토큰의 모양"만 확정해 둔다.

> 참고로 이 프로젝트엔 `TestAuthController`와 옛 `generateToken` 류의 흔적이 남아 있는데, 이것들은 **죽은 코드**다. 거기서 찍던 토큰엔 `sid`가 없어서, 설령 발급돼도 필터의 세션 조회(②)를 통과하지 못한다 ─ 세션이 없으니 티켓도 없고, 결국 PVE에 닿지 못한다. `sid` 기반 설계로 옮기면서 쓸모를 잃은 잔재이며, 정리 대상이다.

<br/>

## 4. 인증 실패의 단일 출구 ─ AuthenticationEntryPoint

2-4에서 "거부 응답은 EntryPoint에 위임한다"고 했다. 그 EntryPoint다. 인증이 필요한 경로에 인증 없이 접근했을 때 호출되어, **일관된 401 JSON 응답**을 만든다.

```java
@Component
public class AuthenticationEntryPoint implements
        org.springframework.security.web.AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException, ServletException {

        HttpStatus status = HttpStatus.UNAUTHORIZED;   // 401 일괄
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");

        Map<String, Object> errorDetails = new HashMap<>();
        errorDetails.put("status", status.value());
        errorDetails.put("error", status.getReasonPhrase());
        errorDetails.put("message", "토큰이 유효하지 않거나 인증에 실패했습니다.");
        errorDetails.put("path", request.getRequestURI());

        ObjectMapper objectMapper = new ObjectMapper();
        response.getWriter().write(objectMapper.writeValueAsString(errorDetails));
    }
}
```

인증 실패의 원인이 토큰 없음이든, 만료든, 위조든, 세션 폐기든 ─ 사용자에게는 **하나의 일관된 401 응답**으로 나간다. 실패 원인을 응답에 시시콜콜 노출하지 않는 건 보안상으로도 바람직하다(공격자에게 힌트를 주지 않는다). 프런트엔드는 이 401만 보고 "세션 만료 → 로그인 화면으로" 같은 일괄 처리를 할 수 있다. 실제로 프런트의 axios 인터셉터가 이 401을 받아 세션을 정리하는데, 그 연결은 07에서 본다.

> 인증(Authentication) 실패는 이렇게 EntryPoint가 처리하지만, 그 외의 도메인 예외나 PVE 인프라 예외는 별도의 `GlobalExceptionHandler`가 RFC 9457 `ProblemDetail` 형식으로 처리한다. 예외 처리 체계 전반은 [11. 공통화](#) 꼭지에서 통합해 다룬다. 06에서는 "인증 실패의 출구"만 세워둔다.

<br/>

## 요약

- **관문 골격(`SecurityConfig`)** ─ CSRF·폼로그인·HTTP Basic을 끄고, `STATELESS`로 `HttpSession`을 배제하고, 경로별로 열고 잠그고(`/error`를 연 이유 포함), `ignoring()` 대신 `permitAll()`을 택한 트레이드오프, 그리고 커스텀 JWT 필터를 표준 필터 앞에 배치.
- **검증 사슬(`JwtAuthenticationFilter` + `JwtUtil`)** ─ 요청마다 JWT를 검증하고, **sid로 서버 세션을 조회하는 두 겹 검증**(무상태 인증 + 유상태 보관, 즉시 무효화의 값어치), 그리고 PVE 자격증명을 인증 컨텍스트에 실어 05의 인터셉터와 사슬을 잇는 일.
- **실패의 단일 출구(`AuthenticationEntryPoint`)** ─ 모든 인증 실패를 하나의 401 JSON으로 수렴.

검문소는 세웠으나 아직 **통행증을 발급하는 창구가 없다.** 다음 [07. 로그인/인증](./07-auth-login.md) 꼭지에서 그 창구를 짓는다.

사용자가 아이디·비밀번호를 제출하면 CMP가 PVE `/access/ticket` API를 호출해 티켓을 받아오고, 그걸 `SecuritySessionStore`에 보관한 뒤 `sid`를 담은 JWT를 사용자에게 돌려주는 ─ 이 토큰과 세션이 **태어나는** 과정을 따라간다.
