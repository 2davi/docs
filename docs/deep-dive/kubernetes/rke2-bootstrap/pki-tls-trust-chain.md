---
title: "PKI와 TLS 신뢰 사슬"
date: 2026-07-11
lastmod: 2026-07-11
author: "Davi"
description: "" 
section: "deep-dive"
category: "deep-dive/kubernetes/rke2-bootstrap"
tags: [kubernetes, pki, tls, certificate-authority, kubeadm]
doc_type: "learning-guide"
series: "rke2-bootstrap"
series_order: 81
order: 81
draft: false
search: true
toc: true
difficulty: "advanced"

ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "reviewing"
---

# PKI와 TLS 신뢰 사슬 {#pki-tls-trust-chain}

쿠버네티스 컴포넌트는 서로를 TLS(Transport Layer Security)로 인증한다. 그 인증이 어떻게
성립하는지를 SSH 호스트 키 검증이라는 익숙한 장면에서 출발해 풀어쓴다. 이 문서는
rke2-bootstrap 여러 카드가 근원으로 가리키는 공유 층이다.

## 평평한 신뢰의 한계 {#flat-trust-limit}

SSH의 `known_hosts`는 (이름 → 호스트 키) 쌍의 목록이다. 접속할 때마다 상대가 내미는 키를
이 목록과 대조한다. 신뢰가 평평하다. 항목 하나하나를 사용자가 직접 알아야 하고, 새 상대가
생길 때마다 목록에 손으로 추가한다.

이 방식은 클러스터 규모에서 두 지점에서 무너진다. 첫째는 규모다. 쿠버네티스의 통신 주체는
kube-apiserver, etcd, kube-controller-manager, kube-scheduler, 노드마다 도는 kubelet과
kube-proxy, 그리고 kubectl을 쥔 관리자와 각종 클라이언트다. 이들이 서로를 직접 알아야
한다면 알아야 할 관계가 주체 수 N에 대해 N² 방향으로 늘고, 컴포넌트를 하나 추가할 때마다
모든 곳의 목록을 갱신해야 한다.

둘째는 신원 검증의 부재다. `known_hosts`는 "이 키를 아는가"만 보고 "이 키의 주인이 누구라
주장하며 그 주장이 참인가"는 보지 않는다. 처음 보는 키를 그냥 신뢰하고 기록하는 이
방식을 TOFU(Trust On First Use, 첫 접속 시 신뢰)라 한다. 그 첫 접속을 중간자(MITM,
Man-In-The-Middle)가 가로채면 공격자의 키가 정당한 상대로 박제된다. TOFU의 근본 약점이다.

## 위임된 신뢰와 인증서 {#delegated-trust}

해법은 위임된 신뢰(delegated trust)다. 모두가 서로를 직접 알 필요를 없애고, 대신 모두가
공통으로 신뢰하는 단일 기관을 둔다. 그 기관이 인증기관(CA, Certificate Authority)이다. CA가
"이 키의 주인은 kube-apiserver가 맞다"고 보증하면, CA를 신뢰하는 누구나 그 보증을 검증하는
것만으로 상대를 신뢰한다. 각자가 알아야 할 대상이 CA 하나로 줄어 N² 관계가 N으로 접힌다.
이 구조 전체를 PKI(Public Key Infrastructure, 공개키 기반구조)라 한다.

CA의 "보증"이 물리적으로 존재하는 형태가 인증서(certificate)다. 인증서는 공개키와 신원
정보(주체가 누구이며 어떤 이름·IP로 불리는지)를 묶어 CA가 서명한 문서다. 비대칭 키
(asymmetric key)는 개인키·공개키 쌍으로 존재하고, 개인키로 서명한 것은 짝이 되는 공개키로만
검증된다. CA가 자기 개인키로 인증서에 서명하면, CA 공개키를 가진 누구든 그 인증서가 진짜 이
CA가 발급했음을 확인할 수 있다. 위조하려면 CA 개인키가 필요한데 그 키는 CA만 쥐고 있으므로
위조가 막힌다.

따라서 인증서의 신뢰는 두 질문으로 갈린다. 첫째, CA 서명이 유효한가. 이 질문은 CA 공개키로
검증한다. 둘째, 이 CA를 신뢰하는가. 이 질문은 그 CA가 신뢰 목록에 있느냐의 문제이며, 우리가
미리 결정해서 심어둔다.

## 자체 서명 뿌리 {#self-signed-root}

CA도 자기를 증명할 인증서가 있어야 한다. 그 인증서를 상위 CA가 서명하고, 그 상위 CA를 또
누가 서명하는가라는 물음은 무한히 올라간다. 이 후퇴를 어딘가에서 끊는 지점이 root CA다.
자기 개인키로 자기 인증서에 서명하는 인증서이며, 이를 자체 서명(self-signed)이라 한다.
발급자와 주체가 같다.

self-signed가 신뢰의 시작이 되는 이유는 그것이 수학적으로 특별해서가 아니다. 누구나
self-signed 인증서를 만들 수 있다. root CA가 신뢰 앵커(trust anchor)가 되는 진짜 이유는,
우리가 그 인증서를 신뢰한다고 미리 배포하기 때문이다. root CA 인증서를 모든 노드·컴포넌트의
신뢰 저장소에 심어 "이것이 우리 클러스터의 CA다"라고 대역외로 합의한다. `known_hosts`에 키를
심는 행위와 본질이 같되, 이번에는 CA 하나만 심으면 그 아래 서명된 전부가 자동으로 신뢰된다.

그래서 신뢰가 사슬(chain of trust)로 흐른다. root CA가 컴포넌트 인증서를 서명하고, 컴포넌트가
통신 상대에게 자기 인증서를 내밀고, 상대는 그 서명을 root CA 공개키로 검증하고, 자기가 root
CA를 신뢰하므로 컴포넌트를 신뢰한다. Kubernetes The Hard Way의 사슬은 1단이다. root가 말단
인증서(leaf)를 직접 서명한다. 실무 PKI는 root → 중간 CA(intermediate CA) → leaf의 다단으로
root 개인키 노출을 줄인다([CA 위상 대조](#ca-topology) 참조).

서명은 CA 개인키가 있는 곳에서만 일어난다. 인증서를 발급하려면 CA 개인키가 그 자리에 있어야
하므로, 서명하는 노드마다 CA 개인키 사본이 필요하다. Hard Way는 모든 서명을 점프박스에서
수행하므로 CA 개인키를 점프박스에만 둔다.

## 인증서가 여러 장인 이유 {#why-many-certs}

Hard Way는 CA 하나에 더해 여덟 개 컴포넌트(admin, node-0, node-1, kube-proxy, kube-scheduler,
kube-controller-manager, kube-api-server, service-accounts)의 인증서를 굽는다. 이유는 둘이다.

첫째는 상호 TLS(mTLS, mutual TLS)다. 웹에서 흔한 TLS는 한쪽만 인증한다. 브라우저가 서버 신원만
확인하고 브라우저 자신은 익명이다. 클러스터는 양방향으로 인증한다. kube-apiserver도 자기를
증명하고, 접속하는 kubelet·컨트롤러도 자기를 증명한다. 그래서 서버 역할 인증서와 클라이언트
역할 인증서가 각각 필요하다.

둘째는 신원이 곧 권한의 기반이라는 점이다. 쿠버네티스에는 사용자 계정이라는 실체가 없다.
요청자가 누구인지는 오직 제시한 인증서가 말한다. apiserver는 인증서의 주체 공통명(CN, Common
Name)과 조직(O, Organization)을 읽어 요청자의 신원과 그룹을 정하고, 거기에 RBAC(Role-Based
Access Control, 역할 기반 접근 제어) 권한을 건다. 인증서는 신분증이자 권한 배지다.

구체 매핑이 "왜 여덟 장"의 답이다.

- admin 인증서는 O를 `system:masters`로 담는다. 이 그룹이 클러스터 최고 권한이라, 인증서 한
  장이 곧 관리자 자격이다.
- node-0·node-1(kubelet용) 인증서는 CN을 `system:node:<노드명>`으로, O를 `system:nodes`로
  담아야 한다. 이는 Node Authorizer(노드 인가자)라는 전용 인가 모드의 요구사항이며, 이름 규칙
  자체가 "이 kubelet은 이 노드에 관한 것만 만진다"는 권한 경계를 만든다.
- kube-controller-manager·kube-scheduler·kube-proxy는 각각 `CN=system:kube-...`로 자기 신원을
  담고 그에 맞는 최소 권한만 받는다.
- kube-api-server는 유일한 서버 인증서이며, SAN이 박히는 자리다([SAN과 IP 규칙](#san-ip-rule)
  참조).
- service-accounts는 성격이 다르다. TLS 신원용이 아니라, 컨트롤러 매니저가 서비스어카운트
  토큰에 서명하고 apiserver가 검증하는 데 쓰는 키쌍이다. 파드 내부 워크로드의 신원 체계라
  노드 간 TLS와는 다른 트랙이다.

인증서가 많은 것은 낭비가 아니라 각 주체가 저마다 다른 신원과 권한을 가져야 하기 때문이다.
인증서 한 장이 신원 하나이고 권한 경계 하나다.

## CA 위상 대조 {#ca-topology}

"root CA"는 특정 파일 이름이 아니라 사슬 꼭대기의 자체 서명 CA라는 위치를 가리키는 말이다.
root의 개수와 배치는 부트스트랩 도구마다 다르다. 세 지점으로 대조한다.

- **Hard Way** : 자체 서명 CA 한 개가 leaf를 직접 서명한다. 1단, 평평한 구조. etcd 전용 CA는
  없다(etcd 보안은 트랙 A 페이즈 2 etcd 카드에서 별도로 확인).
- **kubeadm 기본** : `kubeadm init phase certs`가 세 개의 CA를 각각 자체 서명으로 만든다.
  `ca`(쿠버네티스 일반 CA), `etcd-ca`(etcd 전용 CA), `front-proxy-ca`(확장 API 서버용 CA).
  이 셋 위에 군림하는 단일 root는 없다. 세 CA가 각자 자기 사슬의 root다. `sa`는 CA가 아니라
  서비스어카운트 토큰 서명용 키쌍이다.
- **kubeadm과 자체 PKI** : 관리자가 진짜 root CA 하나를 만들고 그 아래 `ca`·`etcd-ca`·
  `front-proxy-ca`를 중간 CA로 서명한 뒤 이후 발급을 쿠버네티스에 위임하는 구성이 가능하다.
  이때 root → intermediate → leaf의 다단 사슬이 선다.

CA를 나누는 이유는 신뢰 경계를 나누는 것이다. CA 하나를 신뢰한다는 것은 그 CA가 서명한
전부를 신뢰한다는 뜻이므로, 그 CA로 서명된 유효한 클라이언트 인증서 하나가 탈취되면 그 CA의
신뢰 영역 전체가 뚫린다. etcd가 별도 CA를 쓰는 근거가 여기다. etcd가 메인 CA를 공유하면
유효한 클라이언트 인증서를 얻은 공격자가 클러스터의 데이터스토어 전체를 장악할 수 있으므로,
그 앞단 신뢰를 `etcd-ca`로 격리해 폭발 반경(blast radius)을 끊는다. front-proxy도 같은 논리로
분리한다.

같은 PKI 원리인데 CA 위상(topology)만 다르다. Hard Way로 단일 CA를 손에 익힌 뒤 그 대조로
kubeadm·RKE2의 다중 CA를 읽는 것이 이 시리즈의 학습 설계다.

> [!CAUTION] REVIEW-REQUIRED
> RKE2의 내부 CA 구성(서버 CA, 클라이언트 CA, request-header CA, etcd 등)은 트랙 B에서
> 실물로 확인해 이 절에 대조 행을 추가한다. Hard Way의 etcd TLS 처리(단일 CA 재사용 여부)는
> 트랙 A 페이즈 2 etcd 카드에서 확정한다.

## SAN과 IP 규칙 {#san-ip-rule}

SAN(Subject Alternative Name, 주체 대체 이름)은 하나의 인증서에 여러 호스트명·IP를 담는 X.509
확장이다. 과거 CN 하나로 하던 호스트 식별을 SAN이 대체해 지금은 표준이다. kube-api-server
인증서의 SAN에는 `127.0.0.1`, `kubernetes`, `kubernetes.default`,
`kubernetes.default.svc.cluster.local` 같은 내부 서비스 이름과 각 노드의 IP·호스트명이
함께 들어간다. 클라이언트가 이 중 어느 주소로 apiserver에 접속하든 인증서가 그 주소를
보증하게 만든다.

어떤 인증서에 IP가 들어가는지는 CA냐 leaf냐의 이분법이 아니라 세 버킷으로 갈린다.

- CA 인증서(`ca`, `etcd-ca`, `front-proxy-ca`)에는 IP가 없다. 기관의 신원이지 접속 대상이
  아니기 때문이다.
- 서빙(serving) 인증서에는 IP·호스트명 SAN이 있다. 클라이언트가 이 엔드포인트를 네트워크
  주소로 찾아가기 때문이다. kube-api-server 서빙 인증서, etcd server·peer, kubelet 서빙
  인증서가 여기 속한다.
- 클라이언트(client) 인증서에는 IP가 없다. admin, controller-manager, scheduler, kube-proxy,
  apiserver-etcd-client 등은 "내가 어디 있다"가 아니라 "내가 누구다"를 증명하므로 CN·O만
  있으면 되고 주소가 필요 없다.

규칙은 하나다. 이 엔드포인트를 누가 네트워크 주소로 찾아오는가. 그렇다면 서빙 인증서라 IP가
SAN에 들어가고, 아니면 들어가지 않는다. 그리고 어떤 CA 인증서도 노드 서빙 IP를 굽지 않으므로,
호스트의 IP가 바뀌어도 CA 인증서는 유효하고 서빙 인증서(특히 apiserver)만 실물 주소와
어긋나 깨진다. 인증서를 굽기 전에 IP를 확정하는 순서가 정당한 근거가 여기 있다.

## 이 개념을 참조하는 카드 {#referenced-by}

- (→ a1 CA와 TLS 인증서)
- (→ a1 이름 배선: `known_hosts`의 이름·키 이중성과 CA 서명 검증의 대비)
- (→ b1 RKE2 인증서 자동 관리, 예정)
- (→ a2 etcd 클러스터 부트스트랩: etcd-ca와 서빙·피어 인증서, 예정)

## 출처 {#sources}

- [Kubernetes The Hard Way · 04 Certificate Authority](https://github.com/kelseyhightower/kubernetes-the-hard-way/blob/master/docs/04-certificate-authority.md)
- [PKI certificates and requirements](https://kubernetes.io/docs/setup/best-practices/certificates/)
- [kubeadm init · certs 페이즈](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/)
- [Certificate Management with kubeadm](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/)
- [Using Node Authorization](https://kubernetes.io/docs/reference/access-authn-authz/node/)
