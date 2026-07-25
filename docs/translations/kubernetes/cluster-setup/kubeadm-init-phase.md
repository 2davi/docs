---
title: "kubeadm init phase (번역)"
original_title: "kubeadm init phase"
date: 2026-07-09
lastmod: 2026-07-09
original_published: 2025-12-16

author: "The Kubernetes Authors"
translator: "Davi"

original_url: "https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init-phase/"
original_lang: "en"
translation_lang: "ko"
translation_fidelity: "restructured"

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "kubeadm init의 부트스트랩 단계를 개별 실행 서브명령으로 푼 kubeadm init phase 명령을 다룬다. preflight·certs·kubeconfig·etcd·control-plane 등 14개 페이즈와 그 하위 명령, 플래그를 한국어로 옮긴 레퍼런스 번역."
slug: "kubeadm-init-phase"

section: "translations"
category: "kubernetes/cluster-setup"
tags: [kubernetes, kubeadm, init, phase]

order: 112
series: "Kube ADM"
series_order: 2

status: "active"
toc: true
comments: false
draft: false

ai_assistance:
  authorship: "ai-drafted"
  role: [translation, research]
  model: ["claude-opus-4.8"]
  review: "reviewing"
---

# kubeadm init phase {#kubeadm-init-phase}

> **원문:** [kubeadm init phase](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init-phase/) · The Kubernetes Authors · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
>
> 이 문서는 원문을 한국어로 옮기며 두괄식으로 재구성하고 역자 주를 더했다. 문서 본문은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을 따른다. 비공식 번역이며 원저작자와 프로젝트의 공인을 받지 않았다. 원문과 번역이 어긋날 경우 원문이 우선한다.
>
> 원문 시점 2025-12-16 · 번역 2026-07-09

## 결론 {#conclusion}

`kubeadm init phase`는 부트스트랩 과정의 원자적(atomic) 단계를 개별 호출하게 해주는 명령이다. kubeadm이 일부를 처리하게 두고, 커스터마이징이 필요한 부분만 직접 채울 수 있다. `kubeadm init` 워크플로와 일관되며 내부적으로 같은 코드를 쓴다.

페이즈는 `kubeadm init`의 실행 순서를 따른다. preflight(프리플라이트 검사) → certs(인증서 생성) → kubeconfig(kubeconfig 파일) → etcd(로컬 etcd 정적 Pod) → control-plane(컨트롤 플레인 정적 Pod) → kubelet-start(kubelet 설정·기동) → wait-control-plane(기동 대기) → upload-config(설정 업로드) → upload-certs(인증서 업로드) → mark-control-plane(노드 표시) → bootstrap-token(부트스트랩 토큰) → kubelet-finalize(TLS 부트스트랩 후 마무리) → addon(CoreDNS·kube-proxy) → show-join-command(조인 명령 출력)이다.

대부분의 페이즈는 `all` 하위 명령으로 전체를 한 번에, 또는 개별 하위 명령으로 조각을 실행할 수 있다. 특히 `certs`는 CA·apiserver·etcd 등 12개, `kubeconfig`는 admin·kubelet 등 7개, `control-plane`은 apiserver·controller-manager·scheduler로 세분된다. 모든 하위 명령은 `--rootfs` 상위 플래그를 상속하며, `--dry-run`으로 변경 없이 미리 볼 수 있다.

---

`init phase` 명령은 부트스트랩 과정의 원자적 단계를 호출하게 해준다. 따라서 kubeadm이 일부 작업을 하게 두고, 커스터마이징을 적용하고 싶다면 그 빈틈을 직접 채울 수 있다. `kubeadm init phase`는 `kubeadm init` 워크플로와 일관되며, 무대 뒤에서 둘 다 같은 코드를 쓴다.

## 페이즈 목록 {#phase-list}

`kubeadm init`은 다음 페이즈를 순서대로 실행하며, 각 페이즈는 `kubeadm init phase <이름>`으로 개별 호출할 수 있다.

- `preflight`: 프리플라이트 검사 실행
- `certs`: 인증서 생성
  - `/ca`: 다른 Kubernetes 컴포넌트의 신원을 발급할 자체 서명 Kubernetes CA 생성
  - `/apiserver`: Kubernetes API 서빙용 인증서 생성
  - `/apiserver-kubelet-client`: API 서버가 kubelet에 접속할 인증서 생성
  - `/front-proxy-ca`: 프런트 프록시 신원을 발급할 자체 서명 CA 생성
  - `/front-proxy-client`: 프런트 프록시 클라이언트 인증서 생성
  - `/etcd-ca`: etcd 신원을 발급할 자체 서명 CA 생성
  - `/etcd-server`: etcd 서빙용 인증서 생성
  - `/etcd-peer`: etcd 노드 간 통신용 인증서 생성
  - `/etcd-healthcheck-client`: etcd 헬스체크(liveness probe)용 인증서 생성
  - `/apiserver-etcd-client`: API 서버가 etcd에 접근할 인증서 생성
  - `/sa`: 서비스 어카운트 토큰 서명용 개인 키와 공개 키 생성
- `kubeconfig`: 컨트롤 플레인 확립에 필요한 모든 kubeconfig 파일과 admin kubeconfig 파일 생성
  - `/admin`: admin과 kubeadm 자신용 kubeconfig 생성
  - `/kubelet`: kubelet용 kubeconfig 생성(부트스트랩 목적 한정)
  - `/controller-manager`: 컨트롤러 매니저용 kubeconfig 생성
  - `/scheduler`: 스케줄러용 kubeconfig 생성
  - `/super-admin`: super-admin용 kubeconfig 생성
- `etcd`: 로컬 etcd용 정적 Pod 매니페스트 생성
  - `/local`: 단일 노드 로컬 etcd 정적 Pod 매니페스트 생성
- `control-plane`: 컨트롤 플레인 컴포넌트용 정적 Pod 매니페스트 생성
  - `/apiserver`: kube-apiserver 정적 Pod 매니페스트 생성
  - `/controller-manager`: kube-controller-manager 정적 Pod 매니페스트 생성
  - `/scheduler`: kube-scheduler 정적 Pod 매니페스트 생성
- `kubelet-start`: kubelet 설정·환경 파일을 기록하고 kubelet을 (재)시작
- `wait-control-plane`: 컨트롤 플레인 기동 대기
- `upload-config`: kubeadm·kubelet 설정을 ConfigMap에 업로드
  - `/kubeadm`: kubeadm `ClusterConfiguration`을 ConfigMap에 업로드
  - `/kubelet`: kubelet 설정을 ConfigMap에 업로드
- `upload-certs`: 컨트롤 플레인 인증서를 `kubeadm-certs` Secret에 업로드
- `mark-control-plane`: 노드를 컨트롤 플레인으로 표시
- `bootstrap-token`: 부트스트랩 토큰 구성
- `kubelet-finalize`: TLS 부트스트랩 후 kubelet 관련 설정 갱신
  - `/enable-client-cert-rotation`: kubelet 클라이언트 인증서 로테이션 활성화
- `addon`: 컨포먼스 테스트 통과에 필요한 애드온 설치
  - `/coredns`: CoreDNS 애드온 설치
  - `/kube-proxy`: kube-proxy 애드온 설치
- `show-join-command`: `kubeadm join`에 쓸 조인 명령 출력

## 공통 플래그 {#common-flags}

아래 하위 명령들에 반복 등장하는 플래그다. 각 하위 명령에서는 이름만 나열하며, 설명은 여기서 한 번만 정의한다.

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--apiserver-advertise-address string` | | API 서버가 수신 대기를 알릴 IP 주소. 미설정 시 기본 네트워크 인터페이스를 쓴다. |
| `--apiserver-bind-port int32` | `6443` | API 서버가 바인딩할 포트. |
| `--apiserver-cert-extra-sans strings` | | API 서버 서빙 인증서에 넣을 추가 SAN(Subject Alternative Names). IP·DNS 이름 모두 가능. |
| `--cert-dir string` | `/etc/kubernetes/pki` | 인증서를 저장·보관할 경로. |
| `--config string` | | kubeadm 설정 파일 경로. |
| `--control-plane-endpoint string` | | 컨트롤 플레인의 안정적 IP 주소 또는 DNS 이름. |
| `--cri-socket string` | | 접속할 CRI 소켓 경로. 비우면 자동 감지하며, CRI가 둘 이상이거나 비표준 소켓일 때만 쓴다. |
| `--dry-run` | | 어떤 변경도 적용하지 않고 수행될 작업만 출력한다. |
| `--feature-gates string` | | 피처 게이트 `key=value` 집합. `NodeLocalCRISocket=true\|false`(기본 true), `PublicKeysECDSA=true\|false`(DEPRECATED, 기본 false), `RootlessControlPlane=true\|false`(ALPHA, 기본 false). |
| `-h, --help` | | 해당 명령 도움말. |
| `--image-repository string` | `registry.k8s.io` | 컨트롤 플레인 이미지를 받아올 컨테이너 레지스트리. |
| `--ignore-preflight-errors strings` | | 오류를 경고로 표시할 검사 목록. 예: `IsPrivilegedUser,Swap`. `all`이면 전체 무시. |
| `--kubeconfig string` | `/etc/kubernetes/admin.conf` | 클러스터와 통신할 때 쓸 kubeconfig 파일. |
| `--kubeconfig-dir string` | `/etc/kubernetes` | kubeconfig 파일을 저장할 경로. |
| `--kubernetes-version string` | `stable-1` | 컨트롤 플레인에 쓸 특정 Kubernetes 버전. |
| `--node-name string` | | 노드 이름을 지정한다. |
| `--patches string` | | `target[suffix][+patchtype].extension` 형식의 파일을 담은 디렉터리 경로. 예: `kube-apiserver0+merge.yaml` 또는 `etcd.json`. `target`은 `kube-apiserver`·`kube-controller-manager`·`kube-scheduler`·`etcd`·`kubeletconfiguration`·`corednsdeployment` 중 하나, `patchtype`은 `strategic`·`merge`·`json` 중 하나(기본 `strategic`), `extension`은 `json`·`yaml`, `suffix`는 적용 순서를 알파벳·숫자순으로 정하는 선택적 문자열. |
| `--pod-network-cidr string` | | 파드 네트워크 IP 범위. 설정하면 컨트롤 플레인이 노드마다 CIDR을 자동 할당한다. |
| `--print-manifest` | | 애드온을 설치하지 않고 매니페스트를 STDOUT에 출력한다. |
| `--service-cidr string` | `10.96.0.0/12` | 서비스 VIP에 쓸 대체 IP 범위. |
| `--service-dns-domain string` | `cluster.local` | 서비스에 쓸 대체 도메인. 예: `myorg.internal`. |

## 상속 플래그 {#inherited-options}

아래 모든 하위 명령은 상위 명령에서 다음 플래그를 상속한다(각 하위 명령에서는 반복하지 않는다).

| 플래그 | 설명 |
| --- | --- |
| `--rootfs string` | '실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot하게 만든다. |

## kubeadm init phase preflight {#phase-preflight}

`kubeadm init`을 위한 프리플라이트 검사를 실행한다.

**사용:** `kubeadm init phase preflight [flags]`

**플래그:** `--config` · `--cri-socket` · `--dry-run` · `-h` · `--ignore-preflight-errors` · `--image-repository`

```shell
# 설정 파일에서 옵션을 읽어 init에 대한 프리플라이트 검사 실행
kubeadm init phase preflight --config kubeadm-config.yaml
```

## kubeadm init phase certs {#phase-certs}

kubeadm이 필요로 하는 모든 인증서를 생성하는 데 쓸 수 있다. 하위 명령 없이 `kubeadm init phase certs`를 호출하면 `-h`만 받는다. `all`로 전체를, 또는 개별 하위 명령으로 조각을 생성한다.

![certs 인증서 서명 트리 다이어그램. 12개 인증서가 3개의 자체 서명 CA 아래로 갈린다. ca(Kubernetes CA)는 apiserver와 apiserver-kubelet-client를 서명한다. etcd-ca는 etcd-server·etcd-peer·etcd-healthcheck-client·apiserver-etcd-client를 서명한다. front-proxy-ca는 front-proxy-client를 서명한다. sa는 CA가 아니라 서비스 어카운트 토큰 서명용 개인 키·공개 키 페어로, 다른 인증서를 서명하지 않는다.](./_embeds/img/kubeadm-init-phase/certs_signing_tree.svg)

*이 그림은 아래 `certs` 하위 명령 설명을 종합해 CA와 리프 인증서의 서명 관계로 재구성한 것이다(논리적 추론에 따른 배치). 특히 `apiserver-etcd-client`는 API 서버가 etcd에 접속하는 클라이언트 인증서라 `ca`가 아닌 `etcd-ca`가 서명한다는 점에 유의한다.*

### certs all {#certs-all}

kubeadm이 필요로 하는 모든 인증서를 생성한다.

**사용:** `kubeadm init phase certs all [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-cert-extra-sans` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--kubernetes-version` · `--service-cidr` · `--service-dns-domain`

### certs ca {#certs-ca}

다른 Kubernetes 컴포넌트의 신원을 발급할 자체 서명 Kubernetes CA를 생성해 `ca.crt`·`ca.key` 파일에 저장한다. 두 파일이 이미 있으면 생성을 건너뛰고 기존 파일을 쓴다.

**사용:** `kubeadm init phase certs ca [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs apiserver {#certs-apiserver}

Kubernetes API 서빙용 인증서를 생성해 `apiserver.crt`·`apiserver.key` 파일에 저장한다. 두 파일이 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs apiserver [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-cert-extra-sans` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--kubernetes-version` · `--service-cidr` · `--service-dns-domain`

### certs apiserver-kubelet-client {#certs-apiserver-kubelet-client}

API 서버가 kubelet에 접속할 클라이언트 인증서를 생성해 `apiserver-kubelet-client.crt`·`.key` 파일에 저장한다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs apiserver-kubelet-client [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs front-proxy-ca {#certs-front-proxy-ca}

프런트 프록시 신원을 발급할 자체 서명 CA를 생성해 `front-proxy-ca.crt`·`.key` 파일에 저장한다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs front-proxy-ca [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs front-proxy-client {#certs-front-proxy-client}

프런트 프록시 클라이언트 인증서를 생성해 `front-proxy-client.crt`·`.key` 파일에 저장한다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs front-proxy-client [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs etcd-ca {#certs-etcd-ca}

etcd 신원을 발급할 자체 서명 CA를 생성해 `etcd/ca.crt`·`etcd/ca.key` 파일에 저장한다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs etcd-ca [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs etcd-server {#certs-etcd-server}

etcd 서빙용 인증서를 생성해 `etcd/server.crt`·`.key` 파일에 저장한다. 기본 SAN은 `localhost`, `127.0.0.1`, `::1`이다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs etcd-server [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs etcd-peer {#certs-etcd-peer}

etcd 노드 간 통신용 인증서를 생성해 `etcd/peer.crt`·`.key` 파일에 저장한다. 기본 SAN은 `localhost`, `127.0.0.1`, `::1`이다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs etcd-peer [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs etcd-healthcheck-client {#certs-etcd-healthcheck-client}

etcd 헬스체크(liveness probe)용 인증서를 생성해 `etcd/healthcheck-client.crt`·`.key` 파일에 저장한다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs etcd-healthcheck-client [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs apiserver-etcd-client {#certs-apiserver-etcd-client}

API 서버가 etcd에 접근할 인증서를 생성해 `apiserver-etcd-client.crt`·`.key` 파일에 저장한다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs apiserver-etcd-client [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

### certs sa {#certs-sa}

서비스 어카운트 토큰 서명용 개인 키를 생성해 `sa.key`에, 그 공개 키를 `sa.pub`에 저장한다. 이미 있으면 건너뛴다.

**사용:** `kubeadm init phase certs sa [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--kubernetes-version`

## kubeadm init phase kubeconfig {#phase-kubeconfig}

`all` 하위 명령으로 필요한 모든 kubeconfig 파일을 만들거나 개별 호출할 수 있다. 하위 명령 없이 `kubeadm init phase kubeconfig`를 호출하면 `-h`만 받는다.

### kubeconfig all {#kubeconfig-all}

컨트롤 플레인 확립에 필요한 모든 kubeconfig 파일과 admin kubeconfig 파일을 생성한다.

**사용:** `kubeadm init phase kubeconfig all [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--kubeconfig-dir` · `--kubernetes-version` · `--node-name`

### kubeconfig admin {#kubeconfig-admin}

admin과 kubeadm 자신용 kubeconfig를 생성해 `admin.conf` 파일에 저장한다.

**사용:** `kubeadm init phase kubeconfig admin [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--kubeconfig-dir` · `--kubernetes-version`

### kubeconfig kubelet {#kubeconfig-kubelet}

kubelet이 쓸 kubeconfig를 생성해 `kubelet.conf` 파일에 저장한다. 이는 클러스터 부트스트랩 목적으로만 써야 한다. 컨트롤 플레인이 뜬 뒤에는 모든 kubelet 자격 증명을 CSR API에서 요청해야 한다.

**사용:** `kubeadm init phase kubeconfig kubelet [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--kubeconfig-dir` · `--kubernetes-version` · `--node-name`

### kubeconfig controller-manager {#kubeconfig-controller-manager}

컨트롤러 매니저가 쓸 kubeconfig를 생성해 `controller-manager.conf` 파일에 저장한다.

**사용:** `kubeadm init phase kubeconfig controller-manager [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--kubeconfig-dir` · `--kubernetes-version`

### kubeconfig scheduler {#kubeconfig-scheduler}

스케줄러가 쓸 kubeconfig를 생성해 `scheduler.conf` 파일에 저장한다.

**사용:** `kubeadm init phase kubeconfig scheduler [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--kubeconfig-dir` · `--kubernetes-version`

### kubeconfig super-admin {#kubeconfig-super-admin}

super-admin이 쓸 kubeconfig를 생성해 `super-admin.conf` 파일에 저장한다.

**사용:** `kubeadm init phase kubeconfig super-admin [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--kubeconfig-dir` · `--kubernetes-version`

## kubeadm init phase etcd {#phase-etcd}

정적 Pod 파일 기반으로 로컬 etcd 인스턴스를 만든다. 하위 명령 없이 `kubeadm init phase etcd`를 호출하면 `-h`만 받는다.

### etcd local {#etcd-local}

단일 노드 로컬 etcd 인스턴스용 정적 Pod 매니페스트를 생성한다.

**사용:** `kubeadm init phase etcd local [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--image-repository` · `--patches`

```shell
# 로컬 etcd 인스턴스용 정적 Pod 매니페스트 생성
kubeadm init phase etcd local

# 설정 파일에서 읽은 옵션으로 정적 Pod 매니페스트 생성
kubeadm init phase etcd local --config config.yaml
```

## kubeadm init phase control-plane {#phase-control-plane}

이 페이즈로 컨트롤 플레인 컴포넌트에 필요한 정적 Pod 파일을 모두 만들 수 있다. 하위 명령 없이 `kubeadm init phase control-plane`을 호출하면 `-h`만 받는다.

### control-plane all {#control-plane-all}

컨트롤 플레인 컴포넌트용 정적 Pod 매니페스트를 모두 생성한다.

**사용:** `kubeadm init phase control-plane all [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `--feature-gates` · `-h` · `--image-repository` · `--kubernetes-version` · `--patches` · `--pod-network-cidr` · `--service-cidr`

```shell
# 컨트롤 플레인 컴포넌트용 정적 Pod 매니페스트를 모두 생성.
# kubeadm init이 생성하는 것과 기능적으로 동등하다.
kubeadm init phase control-plane all

# 설정 파일에서 읽은 옵션으로 정적 Pod 매니페스트를 모두 생성
kubeadm init phase control-plane all --config config.yaml
```

### control-plane apiserver {#control-plane-apiserver}

kube-apiserver 정적 Pod 매니페스트를 생성한다.

**사용:** `kubeadm init phase control-plane apiserver [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--cert-dir` · `--config` · `--control-plane-endpoint` · `--dry-run` · `--feature-gates` · `-h` · `--image-repository` · `--kubernetes-version` · `--patches` · `--service-cidr`

### control-plane controller-manager {#control-plane-controller-manager}

kube-controller-manager 정적 Pod 매니페스트를 생성한다.

**사용:** `kubeadm init phase control-plane controller-manager [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--image-repository` · `--kubernetes-version` · `--patches` · `--pod-network-cidr`

### control-plane scheduler {#control-plane-scheduler}

kube-scheduler 정적 Pod 매니페스트를 생성한다.

**사용:** `kubeadm init phase control-plane scheduler [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h` · `--image-repository` · `--kubernetes-version` · `--patches`

## kubeadm init phase kubelet-start {#phase-kubelet-start}

이 페이즈는 kubelet 설정 파일과 환경 파일을 기록한 뒤 kubelet을 시작한다. `KubeletConfiguration`을 담은 파일과 노드별 kubelet 설정을 담은 환경 파일을 기록하고 kubelet을 (재)시작한다.

**사용:** `kubeadm init phase kubelet-start [flags]`

**플래그:** `--config` · `--cri-socket` · `--dry-run` · `-h` · `--image-repository` · `--node-name` · `--patches`

```shell
# InitConfiguration 파일에서 kubelet 플래그를 읽어 동적 환경 파일을 기록
kubeadm init phase kubelet-start --config config.yaml
```

## kubeadm init phase wait-control-plane {#phase-wait-control-plane}

이 페이즈에서 kubeadm은 컨트롤 플레인 컴포넌트가 기동할 때까지 대기한다.

**사용:** `kubeadm init phase wait-control-plane [flags]`

**플래그:** `-h`

## kubeadm init phase upload-config {#phase-upload-config}

이 명령으로 kubeadm 설정을 클러스터에 업로드할 수 있다. 대안으로 `kubeadm config`를 쓸 수 있다. 하위 명령 없이 `kubeadm init phase upload-config`를 호출하면 `-h`만 받는다.

### upload-config all {#upload-config-all}

kubeadm·kubelet 설정을 ConfigMap에 업로드한다.

**사용:** `kubeadm init phase upload-config all [flags]`

**플래그:** `--config` · `--cri-socket` · `--dry-run` · `-h` · `--kubeconfig`

### upload-config kubeadm {#upload-config-kubeadm}

kubeadm `ClusterConfiguration`을 `kube-system` 네임스페이스의 `kubeadm-config` ConfigMap에 업로드한다. 이는 이후 kubeadm(예: `kubeadm upgrade`)이 정확한 설정을 붙이고 매끄러운 업그레이드를 수행하도록 보장한다. 대안으로 `kubeadm config`를 쓸 수 있다.

**사용:** `kubeadm init phase upload-config kubeadm [flags]`

**플래그:** `--config` · `--cri-socket` · `--dry-run` · `-h` · `--kubeconfig`

```shell
# kube-system 네임스페이스의 kubeadm-config ConfigMap에
# kubeadm ClusterConfiguration을 업로드
kubeadm init phase upload-config kubeadm --config kubeadm.yaml
```

### upload-config kubelet {#upload-config-kubelet}

`InitConfiguration` 파일에서 추출한 kubelet 설정을 `kubelet-config` ConfigMap에 업로드한다.

**사용:** `kubeadm init phase upload-config kubelet [flags]`

**플래그:** `--config` · `--cri-socket` · `--dry-run` · `-h` · `--kubeconfig`

```shell
# InitConfiguration 파일에서 kubelet 설정을 읽어 ConfigMap에 업로드
kubeadm init phase upload-config kubelet --config kubeadm.yaml
```

## kubeadm init phase upload-certs {#phase-upload-certs}

기본적으로 인증서와 암호화 키는 두 시간 후 만료된다. 이 페이즈는 컨트롤 플레인 인증서를 `kubeadm-certs` Secret에 업로드한다.

**사용:** `kubeadm init phase upload-certs [flags]`

**플래그(공통):** `--config` · `--dry-run` · `-h` · `--kubeconfig`
**플래그(고유):**

- `--certificate-key string`: 업로드된 인증서 시크릿을 복호화할 때 쓸 키. 지정하지 않으면 자동 생성된다.
- `--skip-certificate-key-print`: 인증서 업로드에 쓰인 키의 출력을 생략한다.
- `--upload-certs`: 컨트롤 플레인 인증서를 `kubeadm-certs` Secret에 업로드한다.

## kubeadm init phase mark-control-plane {#phase-mark-control-plane}

노드를 컨트롤 플레인으로 표시한다.

**사용:** `kubeadm init phase mark-control-plane [flags]`

**플래그:** `--config` · `--dry-run` · `-h` · `--node-name`

```shell
# 현재 노드를 컨트롤 플레인으로 표시
kubeadm init phase mark-control-plane --config config.yaml

# "foo"라는 이름의 노드를 컨트롤 플레인으로 표시
kubeadm init phase mark-control-plane --node-name foo
```

## kubeadm init phase bootstrap-token {#phase-bootstrap-token}

부트스트랩 토큰은 클러스터에 합류하는 노드와 컨트롤 플레인 노드 사이의 양방향 신뢰를 확립하는 데 쓰인다. 이 명령은 부트스트랩 토큰이 동작하는 데 필요한 모든 설정을 만든 뒤 초기 토큰을 생성한다.

**사용:** `kubeadm init phase bootstrap-token [flags]`

**플래그(공통):** `--config` · `--dry-run` · `-h` · `--kubeconfig`
**플래그(고유):** `--skip-token-print`(기본 부트스트랩 토큰의 출력을 생략).

```shell
# 부트스트랩 토큰 설정을 모두 만들고 초기 토큰을 생성한다.
# kubeadm init이 생성하는 것과 기능적으로 동등하다.
kubeadm init phase bootstrap-token
```

## kubeadm init phase kubelet-finalize {#phase-kubelet-finalize}

TLS 부트스트랩 후 kubelet 관련 설정을 갱신하는 데 쓴다. `all` 하위 명령으로 모든 kubelet-finalize 페이즈를 실행할 수 있다. 하위 명령 없이 `kubeadm init phase kubelet-finalize`를 호출하면 `-h`만 받는다.

### kubelet-finalize all {#kubelet-finalize-all}

TLS 부트스트랩 후 kubelet 관련 설정을 갱신한다.

**사용:** `kubeadm init phase kubelet-finalize all [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h`

```shell
# TLS 부트스트랩 후 kubelet 관련 설정을 갱신
kubeadm init phase kubelet-finalize all --config config.yaml
```

### kubelet-finalize enable-client-cert-rotation {#kubelet-finalize-enable-client-cert-rotation}

kubelet 클라이언트 인증서 로테이션을 활성화한다.

**사용:** `kubeadm init phase kubelet-finalize enable-client-cert-rotation [flags]`

**플래그:** `--cert-dir` · `--config` · `--dry-run` · `-h`

## kubeadm init phase addon {#phase-addon}

`all` 하위 명령으로 사용 가능한 애드온을 모두 설치하거나 선택적으로 설치할 수 있다. 하위 명령 없이 `kubeadm init phase addon`을 호출하면 `-h`만 받는다.

### addon all {#addon-all}

컨포먼스 테스트 통과에 필요한 애드온을 설치한다.

**사용:** `kubeadm init phase addon all [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--config` · `--control-plane-endpoint` · `--dry-run` · `--feature-gates` · `-h` · `--image-repository` · `--kubeconfig` · `--kubernetes-version` · `--pod-network-cidr` · `--service-cidr` · `--service-dns-domain`

### addon coredns {#addon-coredns}

API 서버를 통해 CoreDNS 애드온 컴포넌트를 설치한다. DNS 서버는 배포되지만, CNI가 설치되기 전에는 스케줄되지 않는다는 점에 유의한다.

**사용:** `kubeadm init phase addon coredns [flags]`

**플래그:** `--config` · `--dry-run` · `--feature-gates` · `-h` · `--image-repository` · `--kubeconfig` · `--kubernetes-version` · `--print-manifest` · `--service-cidr` · `--service-dns-domain`

### addon kube-proxy {#addon-kube-proxy}

API 서버를 통해 kube-proxy 애드온 컴포넌트를 설치한다.

**사용:** `kubeadm init phase addon kube-proxy [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--config` · `--control-plane-endpoint` · `--dry-run` · `-h` · `--image-repository` · `--kubeconfig` · `--kubernetes-version` · `--pod-network-cidr` · `--print-manifest`

## kubeadm init phase show-join-command {#phase-show-join-command}

`kubeadm join`에 쓸 수 있는 명령을 보여준다. 컨트롤 플레인 노드와 워커 노드 모두에 대한 조인 명령을 출력한다.

**사용:** `kubeadm init phase show-join-command [flags]`

**플래그:** `-h`

## v1beta4 설정 레퍼런스 {#config-reference}

v1beta4 설정의 각 필드에 대한 자세한 내용은 [API 레퍼런스 페이지](https://kubernetes.io/docs/reference/config-api/kubeadm-config.v1beta4/)로 이동한다.

> **역자 주 · 검증**
> 원문 최종 수정은 2025-12-16이며 그 커밋이 'v1.36용 피처 게이트 목록 갱신'이다. 페이즈 트리(`certs` 12개·`kubeconfig` 7개·`kubelet-finalize`·`show-join-command` 등)가 번역 시점(2026-07-09) GitHub main 소스와 동일하다. `super-admin` kubeconfig, `kubelet-finalize`의 `enable-client-cert-rotation`, `show-join-command` 모두 현행이며, 피처 게이트는 v1.36 기준(`NodeLocalCRISocket` 기본 활성)이다. 앞서 확인한 대로 현재 안정 버전은 v1.36이다. 출처: [kubeadm init phase 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init-phase/), [website 원본 소스](https://github.com/kubernetes/website/blob/main/content/en/docs/reference/setup-tools/kubeadm/kubeadm-init-phase.md).

## 역자 주 · 적용 {#translator-notes-application}

원문 정보에서 도출되는, 일반 독자 누구에게나 성립하는 실습·활용 안내다.

- `kubeadm init phase`는 `kubeadm init`의 원자적 단계를 개별 실행하는 툴박스다. 외부 CA·커스텀 인증서·부분 설정처럼 특정 조각만 손볼 때 쓴다(예: `certs sa`만 재생성).
- 대부분의 페이즈는 `all`로 묶어 실행하거나 개별 조각으로 나눠 실행할 수 있다. 커스터마이징 지점만 개별 페이즈로 빼고 나머지는 `kubeadm init`에 맡기는 식으로 조합한다.
- `--dry-run`으로 각 페이즈가 만들 파일을 실제 생성 없이 확인한다. `certs` 하위 명령은 대상 파일이 이미 있으면 건너뛰므로, 특정 인증서만 재발급하려면 그 파일을 먼저 지운다.
- 이 페이즈들이 앞서 옮긴 문서들의 핵심을 만든다. `upload-config kubeadm`이 캡스톤의 `kubeadm-config` ConfigMap을 쓰고, `bootstrap-token`이 join 문서의 양방향 신뢰 입력을 만들며, `etcd local`·`control-plane`이 정적 Pod 문서가 다루는 그 매니페스트를 `/etc/kubernetes/manifests`에 만든다. init phase는 시리즈 전체의 부품 목록인 셈이다.

<!-- REVIEW-REQUIRED · 경험 슬롯
     직접 실습·검증한 결과가 있으면 아래 블록의 주석을 풀고 1인칭으로 채운다.
     없으면 이 주석 블록째로 삭제한다. 채우지 않은 채 draft를 해제하지 않는다.
> **역자 주 · 적용(경험)**
> <1차 경험을 1인칭으로>
-->

## 참고 출처 {#references}

원문이 링크한 출처:

- [kubeadm Configuration (v1beta4)](https://kubernetes.io/docs/reference/config-api/kubeadm-config.v1beta4/)

역자 검증 출처(번역 시점 사실 확인에 사용):

- [kubeadm init phase 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init-phase/)
- [website 원본 소스 (kubeadm-init-phase.md)](https://github.com/kubernetes/website/blob/main/content/en/docs/reference/setup-tools/kubeadm/kubeadm-init-phase.md)

## 다음 단계 {#whats-next}

- [kubeadm init](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/): Kubernetes 컨트롤 플레인 노드 부트스트랩(이 페이즈들의 상위 명령)
- [kubeadm join](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/): 워커 노드를 부트스트랩해 클러스터에 합류
- [kubeadm reset](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/): init·join이 가한 변경 되돌리기
