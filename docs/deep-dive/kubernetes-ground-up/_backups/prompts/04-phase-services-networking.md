# Phase 4 프롬프트 — 서비스 & 네트워킹 (Services & Networking)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 Phase
**Phase 4 — 서비스 & 네트워킹.** Pod에 도달하고, Pod끼리 통신을 제어하는 층. 과거 Istio Gateway·Cilium Ingress 삽질과 `1118` Part 3(NetworkPolicy) 미완을 **Gateway API 중심으로 현대화**한다. (Ingress NGINX는 2026-03 은퇴 → 후계는 Gateway API. 출처: [Kubernetes Blog v1.36](https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/))

## 선행 학습 상태
- **Phase 1~3** ✅ — Phase 1의 `kubeProxyReplacement=true`가 여기서 데이터 플레인으로 회수된다.
- 이번이 **Phase 4**. 이후: Phase 5(설정/보안) → … → Phase 8.
- *(Phase 3 인계 메모 붙여넣기)*

## 허브와의 연결점
Service는 "이 라벨을 가진 Pod들로 트래픽을 보내라"는 **선언**이고, Endpoints/EndpointSlice 컨트롤러가 실제 Pod IP 집합을 계속 맞추는 것이 **조정**이다. Phase 1에서 kube-proxy를 대체한 Cilium eBPF가 이 Service 추상을 O(1) 해시 맵으로 구현한다.

## 이 Phase의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: Pod IP는 덧없다(재생성마다 바뀜). 안정된 가상 IP·이름·L7 라우팅이 필요.
2. **Service 타입**: ClusterIP/NodePort/LoadBalancer/ExternalName. 각각의 도달 범위와 용도.
3. **kube-proxy(와 그 대체)**: iptables/IPVS vs Cilium eBPF. Service VIP→Pod 변환이 어디서 일어나나.
4. **DNS**: CoreDNS, 서비스 DNS 이름(`svc.ns.svc.cluster.local`), Pod DNS 정책. 해석 실패의 진단.
5. **NetworkPolicy**: 기본 허용 → deny-all → 선택 허용. Ingress/Egress, podSelector·namespaceSelector. (심화: Cilium L7 정책·Hubble 관측)
6. **Gateway API**: GatewayClass/Gateway/HTTPRoute. Ingress 대비 역할 분리(인프라 vs 앱)와 표현력. Cilium `gatewayAPI.enabled=true`로 구성.
7. **관측**: Hubble로 흐름·드롭 가시화(`hubble observe --verdict DROPPED`).
8. **한계**: **VirtualBox Host-Only 상한** — 외부 도달 LoadBalancer/L2 Announcement는 개념+최소 데모로만(ARP가 물리 L2를 못 넘음). 단 ClusterIP/NodePort/DNS/NetworkPolicy/Gateway는 전부 정상 실습 가능.

## CKA/CKAD 매핑 + 완료 정의(DoD)
- **CKA**: Services & Networking **20%**. **CKAD**: Services & Networking.
- **DoD**: ①Service 4타입의 도달 범위를 구분, ②Gateway+HTTPRoute로 L7 라우팅 구성, ③NetworkPolicy로 deny-all→선택 허용 실습(차단·허용 양쪽 검증), ④DNS 해석 실패를 유발하고 어느 컴포넌트부터 의심하는지 진단 플로우 확립.

## 시작 지시
**진단 질문 1개**부터(예: "Service의 ClusterIP로 `curl`은 되는데 DNS 이름(`svc.ns...`)으로는 안 된다. 어느 컴포넌트를 *먼저* 의심하고, 무엇으로 확인하나? 그리고 사람들이 자주 *놓치는* 확인 지점은?"). 채점 후 1번부터.

## 마감
공통 프롬프트 §7 **"Phase 마감 점검 의식"** 실행 → 인계 메모 생성. 다음 Phase는 **Phase 5(설정 & 보안)**.
