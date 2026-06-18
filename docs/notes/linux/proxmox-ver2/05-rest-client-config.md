---
title: "05. 기본 Configuration ─ RestClient 설정과 PVE 통신 계약"
date: 2026-06-14
lastmod: 2026-06-15
author: "Davi"
description: "PVE API를 감싸는 Spring Boot 백엔드의 토대. RestClient를 고른 이유, JDK HttpClient·가상 스레드·자체 서명 인증서 처리, 그리고 ProxmoxResponse·ParameterizedTypeReference·form-urlencoded로 이어지는 PVE 통신 계약을 정리한다."
slug: rest-client-config
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 5
series: "Proxmox 실습 v2."
series_order: 5
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


[04번](./04-proxmox-api.md)에서 Proxmox VE API 토큰을 발급받고 `curl`로 엔드포인트를 찔러보는 것까지 했다. 이제 그 호출을 **Spring Boot 백엔드 안으로 들여온다.** 단일 노드 Proxmox 위에 올라탄 CMP(Cloud Management Platform; 클라우드 관리 플랫폼)의 백엔드 서버를 짓는 작업의 시작점이다.

이 문서(05)는 시리즈에서 **토대(Foundation)** 역할을 한다. 앞으로 만들 모든 기능 ─ 로그인, VM 제어, 네트워크·스토리지 관리 ─ 이 결국 "Spring Boot가 PVE에게 HTTP 요청을 보내고 응답을 받는다"는 한 가지 행위로 환원되기 때문이다. 그 행위를 담당할 두 가지를 여기서 깔아둔다.

1. **HTTP 통신 기반** ─ 어떤 HTTP 클라이언트로, 어떤 엔진 위에서, 어떤 보안·타임아웃 설정으로 PVE를 호출할 것인가. (`RestClientConfig`)
2. **PVE 통신 계약(Contract)** ─ PVE가 응답을 어떤 모양으로 감싸 보내는지, 요청은 어떤 형식으로 받는지, 그 약속을 Java 타입으로 어떻게 표현할 것인가. (`ProxmoxResponse`, DTO, 인코딩 규약)

> 이 둘은 06(Spring Security)과 07(로그인)이 그대로 위에 얹히는 바닥이다. 여기서 한 번 제대로 깔아두면, 뒤 문서들에서 "PVE 호출이 어떻게 나가는가"를 다시 설명할 필요가 없어진다.

<br/>

## 1. 왜 RestClient인가

Spring Boot에서 외부 HTTP API를 호출하는 클라이언트는 여러 개다. 신규 프로젝트에서 무엇을 고를지는 한 번 정리하고 넘어갈 가치가 있다. 선택지는 공식 문서 기준 네 가지다 ([Spring 공식 문서 ─ REST Clients](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html)).

| 클라이언트 | 방식 | 특징 |
| --- | --- | --- |
| `RestTemplate` | 동기(Synchronous) | 템플릿 메서드 패턴(Template Method Pattern). 레거시(Legacy). |
| `WebClient` | 비동기·리액티브(Reactive) | 유창한 API(Fluent API). 단, WebFlux 의존성 전체를 끌어옴. |
| **`RestClient`** | 동기 | WebClient의 유창한 API + RestTemplate의 내부 인프라. |
| HTTP Interface | (위 셋 위에 얹는 어댑터) | 어노테이션 기반 선언적 스타일. OpenFeign과 유사. |

<br/>

### 후보 검토

- **`RestTemplate`은 Deprecated다.** 2025년 9월 30일, Spring 팀이 [공식 블로그](https://spring.io/blog/2025/09/30/the-state-of-http-clients-in-spring)에서 사용 중단(Deprecation) 로드맵을 공식화했다. Spring Framework 7.0에서 중단 의사 발표, 7.1에서 `@Deprecated` 부착, 8.0에서 완전 제거 수순이다. 신규 프로젝트에 RestTemplate을 쓰는 건 시작부터 기술 부채(Tech Debt)를 들이는 셈이다.
- **`WebClient`는 이 프로젝트엔 과하다.** 진짜 논블로킹(Non-blocking) 스트리밍 ─ 예컨대 SSE(Server-Sent Events) ─ 가 필요할 때 빛나는 도구인데, CMP 백엔드는 PVE에 요청 보내고 응답 받는 단순 동기 통신이 대부분이다. 이걸 위해 리액티브 스택 전체를 끌어오는 건 과하다.
- **`RestClient`가 정답이다.** Spring Framework 6.1 / Spring Boot 3.2부터 들어온 동기 클라이언트로, WebClient의 깔끔한 Fluent API를 그대로 쓰면서 내부는 RestTemplate이 쓰던 요청 팩토리(Request Factory)·인터셉터(Interceptor) 인프라를 재사용한다. 즉 기존 자산은 살리고 API만 현대화한 형태다.

<br/>

### 동기 방식의 유일한 약점, 그리고 그 무력화

`RestClient`는 Sync Blocking이다. 한 요청이 응답을 받을 때까지 스레드 하나가 점유당한다. 전통적으로 이게 동기 클라이언트의 발목을 잡았다. 그런데 **Java 21의 가상 스레드(Virtual Thread)와 결합하면 이 단점이 거의 사라진다.** 가상 스레드는 블로킹되는 순간 캐리어 스레드(Carrier Thread)에서 분리(unmount)되므로, 수천 개의 동시 PVE 호출이 OS 스레드 몇 개만으로 처리된다.

이 프로젝트는 그린필드(Greenfield) 개인 포트폴리오이고 Java 21 기반이다. 그러니 **RestClient + 가상 스레드** 조합으로 간다. 레거시 제약이 없으니 현시점 최선을 그대로 가져가는 것이다.

> SI/SM 현장의 eGovFramework 레거시(Spring 5.x 이하)에서는 RestClient를 못 쓴다. Spring 6.1+가 필요하기 때문이다. 그쪽은 팀 컨벤션대로 RestTemplate을 유지하는 게 맞다. "맥락이 선택을 결정한다"는 이야기다.

<br/>

## 2. RestClientConfig ─ HTTP 통신 기반

`RestClientConfig`는 두 개의 빈(Bean)을 만든다.

- `pveRequestFactory` ─ **어떻게 연결할 것인가** (HTTP 엔진, TLS, 타임아웃)
- `pveRestClient` ─ **무엇을 가지고 요청할 것인가** (베이스 URL, 인증 인터셉터)

요청 팩토리부터 본다.

<br/>

### 2-1. 요청 팩토리 ─ JDK HttpClient + 가상 스레드

```java
@Bean
ClientHttpRequestFactory pveRequestFactory(
        @Value("${proxmox.timeout.connect}") Integer connectTimeout
        , @Value("${proxmox.timeout.read}") Integer readTimeout) throws Exception {

    // ... (TLS 설정은 2-2에서 따로 다룬다) ...

    HttpClient httpClient = HttpClient.newBuilder()
            .sslContext(sslContext)
            .connectTimeout(Duration.ofSeconds(connectTimeout))   // 연결 수립 제한 시간
            .version(HttpClient.Version.HTTP_1_1)                 // HTTP/1.1 고정
            .proxy(HttpClient.Builder.NO_PROXY)                   // 시스템 프록시 무시
            .executor(Executors.newVirtualThreadPerTaskExecutor())// ★ 요청마다 가상 스레드
            .build();

    JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
    factory.setReadTimeout(Duration.ofSeconds(readTimeout));      // 응답 대기 제한 시간
    return factory;
}
```

짚어둘 결정이 네 가지다.

- **JDK `HttpClient`를 엔진으로 쓴다.** RestClient는 내부 HTTP 엔진을 JDK HttpClient / Apache HttpComponents / Jetty 중에서 고를 수 있는데, 여기서는 별도 라이브러리 의존성이 없는 JDK 내장 클라이언트를 골랐다. `JdkClientHttpRequestFactory`가 이 JDK HttpClient를 Spring의 `ClientHttpRequestFactory` 규격으로 감싸주는 어댑터다.
- **`executor`에 가상 스레드 실행기를 꽂는다.** `Executors.newVirtualThreadPerTaskExecutor()`는 작업(Task)마다 새 가상 스레드를 만드는 실행기다. 1절에서 말한 "동기 블로킹의 무력화"가 실제로 동작하는 지점이 바로 여기다. PVE 호출이 블로킹되어도 OS 스레드를 붙잡고 있지 않는다.
- **HTTP/1.1로 고정한다.** JDK HttpClient는 기본적으로 HTTP/2 협상을 시도하는데, PVE API 게이트웨이(`pveproxy`)와의 호환을 단순하게 가져가기 위해 1.1로 못박았다. *단일 노드 환경에서 HTTP/2 멀티플렉싱 이득이 거의 없고, 프로토콜 협상 실패 같은 변수를 줄이는 편이 디버깅에 유리하다고 판단했다.*
- **연결 타임아웃과 읽기 타임아웃을 분리한다.** `connectTimeout`은 "TCP 연결을 맺기까지" 기다리는 시간이고, `readTimeout`은 "연결된 뒤 응답 데이터를 받기까지" 기다리는 시간이다. 둘은 성격이 다른 실패를 잡아낸다. 전자는 노드가 죽었거나 방화벽에 막힌 경우, 후자는 연결은 됐는데 작업이 늘어지는 경우다. `application.properties`에서 각각 `proxmox.timeout.connect`, `proxmox.timeout.read`로 외부화했다.

<br/>

### 2-2. 자체 서명 인증서와 trust-all

내가 구성한 Proxmox는 **자체 서명 인증서(Self-signed Certificate)** 를 쓴다. 공인 인증기관(CA; Certificate Authority)이 발급한 인증서가 아니므로, Java의 기본 TLS 검증을 그대로 두면 `PKIX path building failed` 류의 핸드셰이크 실패가 난다. 그래서 검증을 통째로 우회한다.

```java
TrustManager[] trustAllCerts = {
        new X509TrustManager() {
            @Override public X509Certificate[] getAcceptedIssuers() { return null; }
            // 서버/클라이언트 인증서를 검증하지 않고 전부 통과시킨다
            @Override public void checkServerTrusted(X509Certificate[] chain, String authType) {}
            @Override public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        }
};

SSLContext sslContext = SSLContext.getInstance("TLS");
sslContext.init(null, trustAllCerts, new SecureRandom());

// 호스트네임 검증도 끈다 (IP로 접속하므로 CN/SAN 불일치 회피)
System.setProperty("jdk.internal.httpclient.disableHostnameVerification", "true");
System.setProperty("java.net.preferIPv4Stack", "true");
```

`X509TrustManager`의 검증 메서드를 빈 구현으로 덮어 **모든 인증서를 신뢰**하게 만들고, 호스트네임 검증까지 끈다. IP(`10.10.1.11`)로 직접 붙기 때문에 인증서의 CN/SAN(주체 이름)과 접속 주소가 어차피 일치하지 않아서다.

> ※※ **이건 실습이라서 허용되는 처리다.** ※※
>
> 모든 인증서를 무조건 신뢰한다는 건, 중간자 공격(MITM; Man-in-the-Middle)에 무방비라는 뜻이다. 누군가 통신 경로에 끼어들어 가짜 인증서를 내밀어도 그대로 받아준다. 폐쇄된 내부 실습망이니 감수하는 것이고, **운영(Production) 환경에서는 절대금물이다.**
>
> 개선 방향은 명확하다. PVE 노드의 자체 서명 인증서(또는 그걸 발급한 사설 CA 인증서)를 별도 트러스트스토어(Truststore)에 등록해서, "이 인증서만 신뢰"하도록 좁히는 것이다. trust-all과 달리 특정 인증서로 범위를 한정하므로 MITM 내성이 생긴다. 지금은 학습 흐름상 통신부터 뚫는 게 우선이라 판단해 미뤄둔다.

<br/>

### 2-3. 동적 인증 인터셉터

`pveRestClient` 빈에는 **요청 인터셉터(Request Interceptor)** 가 하나 달려 있다.

```java
@Bean
RestClient pveRestClient(
        @Value("${proxmox.api.url}") String apiUrl
        , ClientHttpRequestFactory pveRequestFactory) throws Exception {

    // 요청이 나갈 때마다 현재 스레드의 인증 정보를 읽어 PVE 인증 헤더를 주입한다
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

    return RestClient.builder()
                .requestFactory(pveRequestFactory)
                .baseUrl(apiUrl)
                .requestInterceptor(dynamicAuthInterceptor)
                .build();
}
```

이 인터셉터가 하는 일은 한 문장으로 요약된다. **"PVE로 나가는 모든 요청에, 현재 로그인한 사용자의 PVE 티켓(Ticket)과 CSRF 토큰을 헤더로 자동으로 붙인다."** `SecurityContextHolder`에서 현재 스레드에 박힌 인증 정보를 꺼내, 거기 들어 있는 `pve_ticket` / `pve_csrf`를 `Cookie`와 `CSRFPreventionToken` 헤더로 변환한다.

**그 `details` 안의 `pve_ticket`을 채워넣는 주체와 프로세스는,** 로그인이 PVE에서 티켓을 받아 서버 세션에 저장하고, 요청 필터가 그걸 스레드에 실어주는 **인증 흐름**의 결과물이다. [07. 로그인/인증](./07-auth-login.md) 꼭지에서 `JwtAuthenticationFilter` → `SecuritySessionStore` → 이 인터셉터로 이어지는 사슬을 통째로 다룬다. 지금은 *"PVE 인증 헤더를 자동 주입하는 훅(Hook)이 여기 박혀 있다"* 정도만 정리한다.

> **인터셉터가 없는 RestClient도 하나 더 있다.** 로그인 자체를 처리하는 `AuthController`는, 인터셉터가 달리지 않은 별도 `RestClient`를 컨트롤러 내부에서 만들어 쓴다. 로그인은 "아직 티켓이 없는 상태"에서 티켓을 **받아오는** 요청이라, 티켓을 주입하는 인터셉터를 태울 수가 없다(닭이 없는데 달걀을 붙이려는 격). 요청 팩토리(`pveRequestFactory`)는 공유하되 인터셉터만 빼는 식으로 갈라놓았다.

<br/>

## 3. PVE 통신 계약(Contract)

PVE와 Spring Boot가 주고받는 데이터의 약속을 Java 타입으로 어떻게 표현하는지 본다.

### 3-1. 응답 봉투 ─ ProxmoxResponse&lt;T&gt;

Proxmox VE API는 **모든 응답을 `{"data": ...}` 형태로 한 겹 감싸서** 돌려준다. 노드 목록을 요청하든 VM 설정을 요청하든, 실제 알맹이는 항상 `data` 키 아래에 들어 있다. 이 공통 껍데기를 제네릭(Generic) 래퍼 하나로 표현했다.

```java
public record ProxmoxResponse<T>(T data) {}
```

단 한 줄짜리 `record`다. `T` 자리에 그때그때 필요한 알맹이 타입 ─ `List<ProxmoxNodeDto>`, `ProxmoxTicketResponse`, `String` 등 ─ 을 끼워 넣으면, PVE 응답의 `data` 필드가 그 타입으로 역직렬화(Deserialization)된다.

여기서 짚어둘 설계 관점이 하나 있다. **`ProxmoxResponse`는 CMP의 도메인 타입이 아니라 인프라(Infrastructure) 타입이다.** 이 봉투의 모양(`{"data": ...}`)을 결정하는 건 우리 CMP의 사정이 아니라 *PVE의 통신 규격(Wire Format)* 이다. 그러니 패키지를 가른다면 이 타입은 도메인(`vm`, `task` 등)이 아니라 PVE 연동 계층(`infra.pve` 같은)에 속하는 게 맞다. 리패키징을 다루는 [11번](#) 꼭지에서 이 원칙이 다시 등장한다.

<br/>

### 3-2. 제네릭의 벽을 뚫는 ParameterizedTypeReference

`ProxmoxResponse<T>`를 정의했으니, 응답을 받을 때 "이 응답을 `ProxmoxResponse<List<ProxmoxNodeDto>>`로 변환해라"라고 RestClient에게 알려줘야 한다. 그런데 여기서 Java의 고질적인 한계에 부딪힌다 ─ **타입 소거(Type Erasure).**

Java 제네릭은 컴파일 시점에만 존재하고, 런타임에는 타입 인자가 지워진다. `List<ProxmoxNodeDto>`든 `List<String>`이든 런타임에는 그냥 `List`다. 그래서 `body(List.class)`처럼 `Class` 객체를 넘기는 방식으로는 "리스트 안에 무엇이 들었는지"를 전달할 방법이 없다.

이 벽을 우회하는 게 `ParameterizedTypeReference`다.

```java
public List<ProxmoxNodeDto> getClusterNodes() {
    // 익명 하위 클래스를 만들어 제네릭 타입 정보를 런타임까지 보존한다
    ParameterizedTypeReference<ProxmoxResponse<List<ProxmoxNodeDto>>> responseType
            = new ParameterizedTypeReference<>() {};

    ProxmoxResponse<List<ProxmoxNodeDto>> response = restClient.get()
            .uri("/nodes")
            .retrieve()
            .body(responseType);   // Class가 아니라 ParameterizedTypeReference를 넘긴다

    return response != null && response.data() != null
            ? response.data()
            : Collections.emptyList();
}
```

끝에 붙은 `{}`가 핵심이다. `new ParameterizedTypeReference<...>() {}`는 익명 하위 클래스(Anonymous Subclass)를 즉석에서 만드는 문법인데, **하위 클래스의 슈퍼클래스 제네릭 정보는 타입 소거를 피해 런타임까지 남는다.** 이 트릭을 슈퍼 타입 토큰(Super Type Token) 패턴이라 부른다. 덕분에 RestClient의 메시지 컨버터(`MappingJackson2HttpMessageConverter` 등)가 "이건 `ProxmoxResponse`이고 그 `data`는 `List<ProxmoxNodeDto>`구나"를 정확히 알고 역직렬화한다.

> 헷갈리지 말 것 ─ `ParameterizedTypeReference`는 **응답을 어떤 타입으로 받을지**를 정하는 도구지, 요청에 무언가를 실어 보내는 도구가 아니다. 인증 정보를 넘기거나 하는 것과는 무관하다. 순수하게 역직렬화 타입 지정용이다.

<br/>

### 3-3. 요청 본문 ─ form-urlencoded

응답은 JSON으로 받지만, **PVE에 데이터를 보낼 때는 JSON이 아니라 `application/x-www-form-urlencoded` 형식을 요구한다.** 웹 폼(Form) 제출과 같은 `key=value&key=value` 방식이다. 그래서 생성·수정 계열 요청은 `StringBuilder`로 폼 문자열을 조립한다. 스토리지 생성 코드를 보자. _나중에 리팩토링할 코드이지만, 오히려 그래서 주석 달기에 좋은 예시 같았다._

```java
public void createStorage(ProxmoxStorageDto dto) {
    StringBuilder formData = new StringBuilder();

    formData.append("type=").append(dto.type())
            .append("&storage=").append(dto.storage())
            .append("&content=").append(dto.content() != null ? dto.content() : "images");

    // 가변 설정값(config)은 키-밸류를 순회하며 이어붙인다
    if (dto.config() != null) {
        dto.config().forEach((k, v) -> {
            String ev = TypeUtil.encodeUTF_8(v);   // URL 인코딩
            if (ev != null) {
                formData.append("&").append(k).append("=").append(ev);
            }
        });
    }

    restClient.post()
            .uri("/storage")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(formData.toString())
            .retrieve()
            .toBodilessEntity();   // 응답 본문이 필요 없을 때
}
```

`Content-Type` 헤더를 `application/x-www-form-urlencoded`로 명시하고, 본문은 `type=...&storage=...` 꼴의 평문 문자열로 넘긴다. 값에 한글이나 특수문자가 섞일 수 있으므로 `TypeUtil.encodeUTF_8`(내부적으로 `URLEncoder.encode`)로 URL 인코딩을 거친다. 응답 알맹이가 필요 없는 경우엔 `.body(...)` 대신 `.toBodilessEntity()`로 본문을 버린다.

> URL 인코딩과 `String.format`을 섞어 쓸 때 **이중 인코딩(%25 함정)** 버그가 생길 수 있다. 인코딩된 문자열을 다시 포맷 문자열에 끼우면 `%`가 `%25`로 한 번 더 변환되는 식이다. 이 함정은 로그인 쿼리 문자열을 다루는 [07번](./07-auth-login.md) 꼭지에서 실제 사례와 함께 짚는다.

<br/>

### 3-4. 스네이크케이스 매핑 ─ @JsonProperty

PVE가 돌려주는 JSON의 필드명은 `bond_mode`, `bridge_ports`, `vlan-id`처럼 **스네이크케이스(snake_case)나 케밥케이스(kebab-case)** 다. 반면 Java 관례는 카멜케이스(camelCase)다. 이 간극을 `@JsonProperty`로 메운다. 네트워크 인터페이스 DTO의 일부다.

```java
public record ProxmoxNetworkIfaceDto(
        String iface
        , String node
        , String type
        // ...
        , @JsonProperty("bond_mode")
          String bondMode               // JSON의 bond_mode ↔ Java의 bondMode
        , @JsonProperty("bridge_ports")
          String bridgePorts            // JSON의 bridge_ports ↔ Java의 bridgePorts
        , @JsonProperty("bridge_vlan_aware")
          String bridgeVlanAware
        // ...
        , @JsonProperty("vlan-id")
          Integer vlanId                // 케밥케이스도 동일하게 매핑
        , @JsonProperty("vlan-raw-device")
          String vlanRawDevice
) {}
```

`@JsonProperty("bond_mode")`는 "JSON에서 이 필드는 `bond_mode`라는 이름으로 들어오지만, Java에서는 `bondMode`로 받겠다"는 매핑 선언이다. Jackson(잭슨)이 역직렬화할 때 이 어노테이션을 보고 짝을 맞춘다. 필드 이름 규칙이 두 세계에서 다를 때, 한쪽을 억지로 바꾸는 대신 매핑만 명시하는 깔끔한 방법이다.

> 전역으로 `PropertyNamingStrategies.SNAKE_CASE`를 거는 방법도 있지만, PVE 응답은 스네이크·케밥·평범한 카멜이 **뒤섞여** 있어서 전역 전략 하나로는 다 못 잡는다. 그래서 어긋나는 필드만 `@JsonProperty`로 콕 집어 매핑하는 편을 택했다. 이게 "동작이 한곳에 모여 보이는" 방식이기도 하다 ─ 이 필드가 어떤 JSON 키와 짝인지 선언 바로 옆에서 읽힌다.

<br/>

## 4. 설정 외부화와 시크릿

위에서 본 `@Value("${proxmox.api.url}")`, `${proxmox.timeout.connect}` 같은 값들은 모두 `application.properties`에서 주입된다. 설정을 코드에서 분리해 외부화(Externalized Configuration)한 것이다.

```properties
spring.application.name=restclient.pve

proxmox.api.url=https://10.10.1.11:8006/api2/json
proxmox.timeout.connect=10
proxmox.timeout.read=15

proxmox.auth.default-realm=pam

# MDC에 심은 upid를 로그 패턴에 노출 (TaskMonitor 꼭지에서 다룸)
logging.pattern.correlation=[%X{upid:-}]
```

여기에 더해, IDE가 커스텀 프로퍼티를 인식하고 자동완성·검증을 해주도록 `additional-spring-configuration-metadata.json`에 메타데이터를 등록해뒀다. `proxmox.api.url` 같은 키에 오타가 나면 IDE가 경고해주는 식의 편의다.

<br/>

### 대충 넘어간 점 ─ 시크릿이 평문으로 박혀 있다

※※ 현재 `application.properties`에는 **민감한 비밀값(Secret)이 평문으로 하드코딩**되어 있다.

```properties
jwt.secret=<JWT 서명 키>
proxmox.api.token=<PVE API 토큰>
proxmox.api.secret=<PVE API 시크릿>
```

이 상태로 공개 레포지토리에 커밋되면 그 자체로 보안 사고다. JWT 서명 키가 노출되면 누구나 위조 토큰을 만들 수 있고, PVE API 토큰이 노출되면 클러스터 제어 권한이 통째로 새어 나간다.

> **개선 방향:**
>
> 1. **즉시 조치** ─ 이미 커밋된 비밀값은 모두 무효화(Rotation)한다. PVE에서 해당 API 토큰을 삭제·재발급하고, JWT 서명 키도 새로 만든다. git 히스토리에 한 번 올라간 값은 "지웠다"고 끝나는 게 아니라 "이미 유출됐다"고 간주해야 한다.
> 2. **외부 주입** ─ 비밀값은 소스에 두지 않고 환경변수나 `.gitignore` 처리된 `application-local.properties`로 주입한다. Spring Boot의 [외부화 설정](https://docs.spring.io/spring-boot/reference/features/external-config.html)은 환경변수 → 프로파일별 프로퍼티 → 기본 프로퍼티 순으로 우선순위를 부여하므로, 공개 레포엔 더미값만 두고 실제 값은 환경에서 덮어쓰는 패턴이 가능하다.
> 3. **장기적** ─ 운영 규모로 가면 HashiCorp Vault, AWS Secrets Manager 같은 비밀 관리 시스템으로 옮긴다.
>
> *이 문서들에 노출되는 키 예시는 모두 무효화 대상으로 간주하고, 실제 값은 본문에서 가린다.*

<br/>

## 요약

- **HTTP 통신 기반** ─ RestClient를 고른 이유(RestTemplate deprecation, WebClient 과중, 가상 스레드 결합), JDK HttpClient 위에 가상 스레드 실행기를 얹은 요청 팩토리, 자체 서명 인증서를 위한 trust-all(과 그 위험), PVE 인증 헤더를 자동 주입하는 인터셉터의 존재.
- **PVE 통신 계약** ─ `{"data": ...}`를 감싸는 `ProxmoxResponse<T>`, 타입 소거를 뚫는 `ParameterizedTypeReference`, 요청용 form-urlencoded 조립, `@JsonProperty`로 메우는 이름 규칙 차이.
- **설정 외부화** ─ 프로퍼티 분리와, 아직 남아 있는 시크릿 하드코딩 문제(와 개선 로드맵).

다음 [06. Spring Security 골격](./06-spring-security.md) 꼭지에서 **"인증되지 않은 요청을 어떻게 걸러낼 것인가"** 를 다룬다. PVE 호출 인프라는 갖췄으니, 이제 그 인프라에 접근할 자격을 검문하는 관문을 만들 차례.
