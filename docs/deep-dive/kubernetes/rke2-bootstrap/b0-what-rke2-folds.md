---
title: "[B0] RKE2가 접는 것들"
date: 2026-07-12
lastmod: 2026-07-12
author: "Davi"
description: ""
section: "deep-dive"
category: "deep-dive/kubernetes/rke2-bootstrap"
tags: [kubernetes, rke2, rke2-bootstrap, contrast, architecture, static-pod]
doc_type: "learning-guide"
series: "rke2-bootstrap"
series_order: 8
order: 8
status: wip
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

# RKE2가 접는 것들 {#what-rke2-folds}

## 개요 {#overview}

이 문서는 트랙 B(RKE2 자동 부트스트랩)의 문을 여는 대조 앵커다. 트랙 A에서 [스모크 테스트](./a7-smoke-test)까지 맨손으로 세운 클러스터의 각 층을, RKE2가 무엇으로 접는지 층별로 대응한다. 여기서는 아직 삽을 들지 않는다. RKE2를 깔기 전에, 그 설치 한 줄 안에서 접힌 층을 트랙 A의 손배선과 나란히 놓아 지도를 그리는 자리다. 실제 노드 프로비저닝과 사전준비는 [트랙 B 랩과 노드 사전준비](./b1-lab-and-node-prep)에서 손으로 밟는다.

대조 앵커를 먼저 박는 이유는 학습의 축 자체가 대조이기 때문이다. 트랙 A에서 인증서 26장, kubeconfig 6개, systemd 유닛, 노드별 라우트를 손으로 깐 값은, RKE2 설치가 블랙박스로 보이지 않는 눈에 있다. 접힌 층을 이미 손으로 펼쳐봤어야 그 자동화가 무엇을 대신하는지 읽힌다. 이 문서가 그 접힘의 지도다.

## 구조적 차이 {#structural-difference}

층별 접힘을 읽기 전에 RKE2가 트랙 A와 구조적으로 어디가 다른지부터 잡는다. 이 골격이 안 잡히면 나머지가 뜬구름이 된다.

RKE2는 단일 바이너리(single binary) 하나다. `rke2 server`로 켜면 컨트롤 플레인, `rke2 agent`로 켜면 워커가 된다. 트랙 A에서 `kube-apiserver`, `etcd`, `kubelet`을 따로 내려받아 각각 systemd 유닛으로 호스트에 직접 띄운 것과 정반대다. RKE2는 그 바이너리 안에 containerd를 번들로 품고, 그 위에서 컨트롤 플레인을 정적 파드(static pod)로 띄운다. 정적 파드는 apiserver를 거치지 않고 kubelet이 로컬 매니페스트(`/var/lib/rancher/rke2/agent/pod-manifests/`)를 직접 읽어 돌리는 파드다. 즉 트랙 A에서 apiserver·etcd·컨트롤러·스케줄러가 호스트 프로세스였던 것이, RKE2에선 컨테이너가 된다. ([RKE2 Architecture](https://docs.rke2.io/architecture))

이 구조를 지휘하는 것이 supervisor다. `rke2-server` 프로세스가 HTTP 서버를 하나 열어(포트 9345) 다른 서버·에이전트의 합류를 받고, 임베디드 엔진(k3s 계열)을 초기화하고, containerd를 감독한다. containerd가 죽으면 supervisor도 같이 죽는다. 트랙 A에서 손으로 챙긴 "etcd 먼저, apiserver 10초 대기, 그다음 워커"라는 기동 순서 관리를 이 supervisor가 통째로 삼킨다.

한 문장으로 접으면, 트랙 A의 흩어진 호스트 프로세스와 systemd 유닛과 수동 기동 순서가 RKE2에선 단일 바이너리, 번들 containerd, 정적 파드, supervisor로 접힌다. 아래 층별 접힘은 전부 이 구조 위에서 일어난다.

## 층별 접힘 {#layer-folding}

트랙 A의 일곱 층을 순서대로 접는다. 각 층은 트랙 A에서 손으로 한 것과 RKE2가 접는 방식, 그리고 콘솔 제품이 만질 설정 표면으로 읽는다.

### a1 PKI와 신뢰 계층 {#fold-a1-pki}

트랙 A는 단일 CA(Certificate Authority)를 세우고 `openssl`로 leaf 여덟 장을 굽고 kubeconfig 여섯 개를 손으로 만들었다. 파일 26개다. RKE2는 첫 서버 부팅에서 내부 CA 여러 벌과 전 컴포넌트 인증서·kubeconfig를 자동 생성한다. [a1](./a1-pki-and-trust) 말미에서 "Hard Way 단일 CA와 kubeadm 다중 CA"로 예고한 대조가 여기서 실물이 되며, 실측은 b2에서 `/var/lib/rancher/rke2/server/tls`를 열어 확인한다. 손이 만질 표면은 `config.yaml`의 `tls-san` 하나로, apiserver 서빙 인증서 SAN(Subject Alternative Name)에 로드밸런서 주소나 추가 이름을 넣는 자리다. 인증서 회전(rotation)도 내장이다.

### a2 저장 데이터 암호화 {#fold-a2-encryption}

트랙 A는 `/dev/urandom`으로 키를 뽑고 `EncryptionConfig` 템플릿을 `envsubst`로 채워 apiserver 플래그로 걸었다([a2](./a2-data-encryption)). RKE2는 이것을 `secrets-encryption` 기능으로 접는다. 키 생성·설정·플래그 배선이 자동이고, 그 위에 `rke2 secrets-encrypt` CLI로 키 상태 조회와 회전을 준다. [a7](./a7-smoke-test)에서 `etcdctl | hexdump`로 확인한 `k8s:enc:aescbc:v1:` 암호문이 RKE2에선 설치 시 걸린다. 기본 활성 여부와 프로바이더 순서는 b2에서 config로 실측한다.

### a3 etcd {#fold-a3-etcd}

이 대조가 결이 가장 깊다. 트랙 A는 단일 노드 etcd를 평문 루프백으로 세웠고, 인증서는 복사만 하고 유닛은 참조하지 않았고, 스냅샷 하나로 생명선을 걸었다([a3](./a3-etcd-bootstrap)). N=1이라 내결함성이 0이다. RKE2는 etcd를 정적 파드로 관리하면서 client·peer 양쪽에 TLS를 걸고 `client-cert-auth`로 상호 인증한다. 트랙 A가 "루프백이라 안 건" 그 TLS 계층을 RKE2가 도로 편다. 서버 노드를 홀수로 늘리면 임베디드 etcd HA(High Availability)가 자동 구성되고, 스케줄 스냅샷(`etcd-snapshot-schedule-cron`, `etcd-snapshot-retention`)이 내장이다. etcd 버전도 갈린다. RKE2 v1.35.6이 품은 것은 `v3.6.12-k3s1`(k3s 패치 빌드)이고, 트랙 A는 `v3.6.0`이었다. ([RKE2 v1.35.X Release Notes](https://docs.rke2.io/release-notes/v1.35.X))

### a4 컨트롤 플레인 {#fold-a4-control-plane}

트랙 A는 apiserver·controller-manager·scheduler를 호스트 유닛으로 띄우고 플래그를 손으로 배선했으며, [a6](./a6-pod-network-dns#three-layer-debug)에서 그 대가를 치렀다. apiserver에 `--advertise-address`·`--service-cluster-ip-range`가 빠져 서비스 대역이 기본 `10.0.0.0/24`로 어긋난 삼중 삽질이다. RKE2는 세 컴포넌트를 정적 파드로 띄우면서 모든 플래그를 한 소스에서 정합적으로 주입한다. `cluster-cidr`·`service-cidr`을 apiserver·controller-manager·인증서에 일관되게 뿌리니, a4·a6에서 밟은 "플래그 하나 빠져 대역이 어긋나는" 버그 클래스가 구조적으로 사라진다. 손이 만질 표면은 `config.yaml`의 `cluster-cidr`·`service-cidr`, 플래그를 더 얹을 때의 `kube-apiserver-arg`, control-plane에 워크로드를 안 앉히려는 `node-taint` 정도다.

### a5 워커 {#fold-a5-worker}

트랙 A는 containerd·runc·CNI·kubelet·kube-proxy를 노드마다 손으로 깔고, `br-netfilter` 모듈과 sysctl을 커널에 박고, 노드별 `/24`를 치환해 넣었다([a5](./a5-worker-nodes)). RKE2 에이전트는 이것을 install.sh 한 방으로 접는다. containerd·runc·kubelet·kube-proxy 번들, CNI 기본 Canal, 커널 준비·sysctl 자동이다. 에이전트가 클러스터에 붙는 데 필요한 것은 두 줄이다. `server: https://<서버>:9345`와 `token: <토큰>`. 노드별 `/24` 수동 배정은 사라지고 CNI의 IPAM(IP Address Management)이 대신한다.

### a6 파드 라우트와 DNS {#fold-a6-route-dns}

트랙 전체에서 대조가 가장 큰 층이다. 트랙 A는 CNI 없이 L3(Layer 3, 3계층) 정적 라우트를 노드마다 손으로 깔아 "파드망은 결국 라우팅"을 맨눈으로 봤고, CoreDNS를 직접 배포하며 세 겹을 통과했다([a6](./a6-pod-network-dns)). RKE2 기본 CNI Canal은 Flannel의 VXLAN(Virtual Extensible LAN) 오버레이에 Calico 정책을 얹은 조합이다. 노드 간 파드 트래픽을 VXLAN이 캡슐화해 나르니, 손으로 깐 정적 라우트가 아예 없다. 커널 라우팅 테이블 대신 오버레이가 그 일을 한다. CoreDNS도 Helm 관리 애드온으로 자동 배포된다. 이것이 시리즈의 학습 축이다. 트랙 A는 정적 라우트(오버레이 없음), 트랙 B는 VXLAN 오버레이, 트랙 C는 Cilium eBPF다. "파드망은 결국 라우팅"의 3단 변주이며, b0에서 그 2단으로 넘어간다. 확정 결정대로 트랙 B는 기본 Canal이 아니라 Calico로 가서 NS 프로덕션과 맞추고, 그 차이는 b2에서 문서화한다.

### a7 스모크 {#fold-a7-smoke}

트랙 A는 여섯 테스트를 손으로 돌려 암호화·디플로이·NodePort를 실증했다([a7](./a7-smoke-test)). RKE2에선 노드 Ready와 kubeconfig 확인이 자동 점검 표면이 되고, 이것이 제품 InstallSvc의 사후 점검으로 접힌다. a7이 곧 제품 관찰 노트의 원형이다.

## z-mapping 뼈대 {#z-mapping-skeleton}

일곱 접힘을 3원 대응표 골격으로 눕히면 다음과 같다. 이 뼈대는 `z-mapping.md`로 옮겨, b1~b4를 지나며 각 칸을 실측으로 채운다.

| 트랙 A 손조작 | RKE2 접기 | 제품 기능목록 |
| --- | --- | --- |
| 구조: 호스트 프로세스 + systemd 유닛 + 수동 기동 순서 | 단일 바이너리 + 번들 containerd + 정적 파드 + supervisor | 번들 생성 / InstallSvc 설치 |
| a1 단일 CA·leaf 8·kubeconfig 6 (파일 26) | 내부 다중 CA·전 인증서 자동, `tls-san` | InstallSvc 사전준비, config.yaml 생성 |
| a2 수동 암호화 키·EncryptionConfig | `secrets-encryption`, `rke2 secrets-encrypt` | 설치 후 검증, Day-2 키 회전 |
| a3 평문 루프백 단일 etcd·수동 스냅샷 | TLS etcd 정적 파드·임베디드 HA·스케줄 스냅샷 | UpgradeSvc etcd 백업·복구 |
| a4 apiserver 플래그 수동 배선(드리프트) | 정적 파드 플래그 정합 주입, `cluster-cidr`·`service-cidr` | InstallSvc 설치, config.yaml 키 |
| a5 containerd·CNI·kubelet·kube-proxy 수동·커널 준비 | 번들 설치·기본 Canal·에이전트 `server`+`token` | InstallSvc 사전점검·설치, 번들 전송 |
| a6 L3 정적 라우트·CoreDNS 수동 | Canal VXLAN 오버레이·CoreDNS 애드온 자동 | config.yaml `cni`, 설치 후 DNS 검증 |
| a7 수동 여섯 스모크 | 노드 Ready·kubeconfig 자동 점검 | InstallSvc 점검, 제품 관찰 노트 |

## 잔여 결정 표면 {#residual-decisions}

접힌다고 결정이 사라지지는 않는다. RKE2는 층을 자동화할 뿐, 여전히 골라야 하는 것은 `config.yaml`의 몇 키로 압축돼 남는다. CNI 선택(기본 Canal, 프로덕션 일치 Calico, 캡스톤 Cilium), `tls-san`(로드밸런서 주소), `node-taint`(control-plane 격리), HA면 로드밸런서 앞단 주소, air-gap이면 번들 구성, 그리고 토큰이다. 파일 27개가 한 YAML의 열 몇 줄로 접힐 뿐 결정 자체는 남는다. 그 키를 못 읽으면 자동화가 블랙박스가 되고, 읽으면 콘솔 제품이 무엇을 입력받아 무엇을 뿌려야 하는지가 보인다. 트랙 A를 손으로 판 값이 정확히 여기서 나온다.

토큰은 미리 짚어둔다. `token`을 주지 않으면 RKE2가 부팅 때 무작위로 하나 만든다. 이 토큰은 새 노드 합류 인증에도 쓰이고 클러스터 부트스트랩 데이터 암호화에도 쓰인다. 이중 역할이라 b2에서 다시 본다. ([RKE2 v1.35.X Release Notes](https://docs.rke2.io/release-notes/v1.35.X))

> **제품으로 접히는 지점.** 잔여 결정 표면이 곧 제품의 입력 화면이다. 노드 정보(IP·SSH·계정), 로드밸런서 주소, RKE2 버전, CNI, control-plane taint 여부가 InstallSvc의 입력이고, 그것이 config.yaml의 `tls-san`·`cni`·`node-taint`·`token`으로 렌더된다. b0의 접힘 지도가 그 입력 화면 정의서의 근거 목록이다.

## 버전 좌표 {#version-coordinates}

핀은 원장대로 stable `v1.35.6+rke2r1`이다(Kubernetes v1.35.6, etcd `v3.6.12-k3s1`, 2026-06-25 릴리스). 트랙 A가 Kubernetes 1.32.x·etcd 3.6.0이었으니 마이너 세 칸 위다. 관찰 대상 하나. v1.36부터 신규 클러스터 기본 인그레스가 ingress-nginx에서 Traefik으로 바뀐다. ingress-nginx가 2026년 3월 EOL(End of Life)이라서다. 지금 v1.35 라인은 아직 ingress-nginx 기본이고, 전환은 네 단계 수동 마이그레이션이다. 번들 생성 로직이 이 전환을 관찰해야 하는 이유이고, b2·b4에서 다시 만진다. ([Ingress NGINX to Traefik Migration](https://docs.rke2.io/reference/ingress_migration))

---

## 부록 A. 핵심 어휘 빠른 참조 {#appendix-a-glossary}

| 용어 | 한 줄 정의 |
| --- | --- |
| **단일 바이너리(single binary)** | `rke2 server`·`rke2 agent` 한 실행 파일. 트랙 A의 분리 바이너리·유닛을 대체 |
| **정적 파드(static pod)** | apiserver 없이 kubelet이 로컬 매니페스트를 읽어 돌리는 파드. RKE2 컨트롤 플레인·etcd가 이 형태 |
| **supervisor** | `rke2-server`가 여는 관리 프로세스. 포트 9345로 합류를 받고 containerd를 감독 |
| **번들 containerd** | RKE2가 품은 컨테이너 런타임. 별도 설치 없이 바이너리 안에서 제공 |
| **Canal** | Flannel(VXLAN 오버레이) + Calico(정책)의 RKE2 기본 CNI |
| **VXLAN(Virtual Extensible LAN)** | 파드 트래픽을 캡슐화해 노드 간에 나르는 오버레이. 트랙 A의 정적 라우트를 대체 |
| **`tls-san`** | apiserver 서빙 인증서 SAN에 이름·주소를 추가하는 config 키. a1 SAN 실측의 접힘 자리 |
| **`secrets-encryption`** | 저장 데이터 암호화 자동 구성 기능. a2의 수동 EncryptionConfig를 대체 |
| **`cluster-cidr` / `service-cidr`** | 파드 대역·서비스 대역 config 키. a4·a6 드리프트를 구조적으로 차단 |
| **토큰(token)** | 노드 합류 인증 + 부트스트랩 데이터 암호화. 미지정 시 무작위 생성 |
| **stable 핀** | `v1.35.6+rke2r1`(K8s 1.35.6, etcd v3.6.12-k3s1). 채널 API로 확정 |

---

## 부록 B. 명령어 빠른 참조 {#appendix-b-commands}

이 문서는 개념 대조라 노드 조작이 없다. 버전 좌표를 확정하는 참조 명령만 둔다. 실물 조작은 [b1](./b1-lab-and-node-prep)부터다.

```bash
# === RKE2 stable 채널 포인터 확인 ===
curl -sL https://update.rke2.io/v1-release/channels | jq '.data[] | select(.name=="stable")'
#   기대: 현재 stable이 v1.35.6+rke2r1을 가리키는지

# === 설치 후 버전 확인 (b2 이후 참조) ===
rke2 --version                       # RKE2·Kubernetes·Go 버전
```

---

## 개인 노트 {#personal-notes}

### 손때 검증 상태 {#hands-on-status}

이 문서는 개념 대조 앵커라 실습 산출물이 아니다. 트랙 A a1~a7 문서와 RKE2 공식 문서(아키텍처·릴리스 노트·인그레스 마이그레이션)를 교차해 접힘 지도를 세웠고, 각 접힘의 실측은 이후 b 문서에서 채운다. stable 핀 `v1.35.6+rke2r1`은 채널 API와 릴리스 노트로 확인했다(2026-07-12).

가장 값이 나가는 자산은 구조적 차이다. 트랙 A가 호스트 프로세스였던 컨트롤 플레인·etcd가 RKE2에선 정적 파드라는 한 문장이, 나머지 층별 접힘이 서는 골격이다. 이 골격이 안 잡히면 config.yaml 키가 어디에 걸리는지 읽히지 않는다.

### 심화로 가는 길 {#deeper}

- **정적 파드 대 in-process**: RKE2가 컨트롤 플레인을 정적 파드로 돌리는 것과 k3s가 in-process로 돌리는 것의 차이, 그리고 그 선택이 격리·재시작·보안에 갖는 함의.
- **RKE2 내부 CA 위상**: 다중 CA(server·client·request-header·etcd)의 실물. b2에서 `/var/lib/rancher/rke2/server/tls`로 확인하며 a1의 단일 CA 대조를 닫는다.
- **k3s 패치 etcd**: `v3.6.12-k3s1` 접미의 의미와, upstream etcd와의 차이.
- **채널 API와 버전 정책**: stable·latest 채널의 파생 규칙과, 제품 번들 생성이 버전을 고정하는 방식.

### 자기 점검 {#self-check}

각 절이 왜 성립하는지를 한 줄로 재구성한다.

1. **RKE2가 트랙 A와 구조적으로 다른 지점** → 컨트롤 플레인·etcd가 호스트 프로세스가 아니라 정적 파드이고, 단일 바이너리 supervisor가 번들 containerd 위에서 지휘한다 (→ 구조적 차이).
2. **a3가 접은 것을 RKE2가 펴는 지점** → 평문 루프백 etcd의 TLS. RKE2는 client·peer TLS와 client-cert-auth로 도로 건다 (→ a3 etcd).
3. **a6의 정적 라우트가 사라지는 이유** → 기본 CNI가 VXLAN 오버레이라, 커널 라우트 대신 캡슐화가 노드 간 파드망을 잇는다 (→ a6 파드 라우트와 DNS).
4. **접혀도 남는 결정** → CNI·tls-san·node-taint·토큰. 파일 27개가 config.yaml 몇 키로 압축될 뿐 결정은 남는다 (→ 잔여 결정 표면).

다음 [트랙 B 랩과 노드 사전준비](./b1-lab-and-node-prep)에서 이 접힘을 실물로 밟는다. 3노드 랩을 세우고, RKE2가 설치되기 전에 임의의 노드를 설치 가능 상태로 만드는 사전점검·사전준비를 손으로 건다. Rocky 노드가 RedHat 분기를 실물로 꺼내는 자리가 거기다.
