---
title: "kubeadm join phase (번역)"
original_title: "kubeadm join phase"
date: 2026-07-09
lastmod: 2026-07-09
original_published: 2025-12-16

author: "The Kubernetes Authors"
translator: "Davi"

original_url: "https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join-phase/"
original_lang: "en"
translation_lang: "ko"
translation_fidelity: "restructured"

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "kubeadm join의 합류 단계를 개별 실행 서브명령으로 푼 kubeadm join phase 명령을 다룬다. preflight·control-plane-prepare·kubelet-start·etcd-join·control-plane-join·wait-control-plane 페이즈와 그 하위 명령, 플래그를 한국어로 옮긴 레퍼런스 번역."
slug: "kubeadm-join-phase"

section: "translations"
category: "translation"
tags: [kubernetes, kubeadm, join, phase, translation]

status: "wip"
toc: true
comments: false
draft: false

ai_assistance:
  authorship: "ai-drafted"
  role: [translation, research]
  model: ["Claude Opus 4.8"]
  review: "reviewing"
---

# kubeadm join phase {#kubeadm-join-phase}

> **원문:** [kubeadm join phase](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join-phase/) · The Kubernetes Authors · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
> 이 문서는 원문을 한국어로 옮기며 두괄식으로 재구성하고 역자 주를 더한 것이다. 문서 본문은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을, 코드·명령 예시는 [Apache License 2.0](https://github.com/kubernetes/website/blob/main/LICENSE)을 따른다. 변경 사항으로 결론 선행 재배치, 역자 주(검증·정정·적용), 그리고 분량 관리를 위한 재구성이 추가되었다. **재구성 방식:** 모든 하위 명령에 반복되는 플래그를 아래 [공통 플래그](#common-flags) 표에 한 번만 싣고, 각 하위 명령에서는 플래그 이름만 나열한다. 상속 플래그 `--rootfs`는 [상속 플래그](#inherited-options)에 한 번만 싣는다. 하위 명령·플래그 정보는 누락 없이 보존했다.
> 원문 시점 2025-12-16 · 번역 2026-07-09

## 결론 {#conclusion}

`kubeadm join phase`는 join(합류) 과정의 원자적(atomic) 단계를 개별 호출하게 해주는 명령이다. kubeadm이 일부를 처리하게 두고, 커스터마이징이 필요한 부분만 직접 채울 수 있다. `kubeadm join` 워크플로와 일관되며 내부적으로 같은 코드를 쓴다.

페이즈는 `kubeadm join`의 실행 순서를 따른다. preflight(프리플라이트 검사) → control-plane-prepare(컨트롤 플레인 서빙 준비) → kubelet-start(kubelet 설정·인증서·기동) → etcd-join(etcd 멤버 합류) → control-plane-join(컨트롤 플레인 인스턴스로 합류) → wait-control-plane(기동 대기)이다.

워커 노드 합류는 preflight·kubelet-start로 충분하고, control-plane-prepare·etcd-join·control-plane-join은 컨트롤 플레인으로 합류할 때(`--control-plane`)만 관여한다. control-plane-prepare는 all·download-certs·certs·kubeconfig·control-plane으로, control-plane-join은 all·mark-control-plane으로 세분된다. 디스커버리 관련 플래그(`--discovery-token`·`--discovery-token-ca-cert-hash` 등)가 대부분의 페이즈에 반복 등장하며, 모든 하위 명령은 `--rootfs`를 상속한다.

---

`kubeadm join phase`는 join 과정의 원자적 단계를 호출하게 해준다. 따라서 kubeadm이 일부 작업을 하게 두고, 커스터마이징을 적용하고 싶다면 그 빈틈을 직접 채울 수 있다. `kubeadm join phase`는 [kubeadm join 워크플로](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/#join-workflow)와 일관되며, 무대 뒤에서 둘 다 같은 코드를 쓴다.

## 페이즈 목록 {#phase-list}

`kubeadm join`은 다음 페이즈를 순서대로 실행하며, 각 페이즈는 `kubeadm join phase <이름>`으로 개별 호출할 수 있다.

- `preflight`: 합류 프리플라이트 검사 실행
- `control-plane-prepare`: 컨트롤 플레인 서빙을 위한 머신 준비
  - `/all`: 아래 준비 단계 전체 실행
  - `/download-certs`: 컨트롤 플레인 노드 간 공유 인증서를 `kubeadm-certs` Secret에서 다운로드
  - `/certs`: 새 컨트롤 플레인 컴포넌트용 인증서 생성
  - `/kubeconfig`: 새 컨트롤 플레인 컴포넌트용 kubeconfig 생성
  - `/control-plane`: 새 컨트롤 플레인 컴포넌트용 매니페스트 생성
- `kubelet-start`: kubelet 설정·인증서를 기록하고 kubelet을 (재)시작
- `etcd-join`: 새 etcd 멤버를 etcd 클러스터에 합류
- `control-plane-join`: 노드를 컨트롤 플레인 인스턴스로 합류
  - `/all`: 아래 합류 단계 전체 실행
  - `/mark-control-plane`: 노드를 컨트롤 플레인으로 표시
- `wait-control-plane`: 컨트롤 플레인 기동 대기

![join phase 워커 vs 컨트롤 플레인 경로 다이어그램. 전체 페이즈는 preflight, control-plane-prepare(download-certs·certs·kubeconfig·control-plane), kubelet-start, etcd-join, control-plane-join(mark-control-plane), wait-control-plane 순이다. 워커 노드 합류는 preflight와 kubelet-start만 실행하고, control-plane-prepare·etcd-join·control-plane-join·wait-control-plane는 --control-plane으로 컨트롤 플레인을 합류시킬 때만 실행한다.](./_embeds/img/kubeadm-join-phase/worker_vs_controlplane_paths.svg)

*이 그림은 각 페이즈의 `--control-plane` 관여 여부를 종합해 노드 타입별 실행 경로로 재구성한 것이다(논리적 추론에 따른 배치). 워커 노드는 컨트롤 플레인 경로의 부분집합으로, `preflight`·`kubelet-start`만 거친다.*

## 공통 플래그 {#common-flags}

아래 하위 명령들에 반복 등장하는 플래그다. 각 하위 명령에서는 이름만 나열하며, 설명은 여기서 한 번만 정의한다.

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--apiserver-advertise-address string` | | 노드가 새 컨트롤 플레인 인스턴스를 호스팅해야 하는 경우, API 서버가 수신 대기를 알릴 IP 주소. 미설정 시 기본 네트워크 인터페이스를 쓴다. |
| `--apiserver-bind-port int32` | `6443` | 노드가 새 컨트롤 플레인 인스턴스를 호스팅해야 하는 경우, API 서버가 바인딩할 포트. |
| `--certificate-key string` | | init이 업로드한 인증서 시크릿을 복호화할 때 쓸 키. 32바이트 AES 키의 hex 인코딩 문자열이다. |
| `--config string` | | kubeadm 설정 파일 경로. |
| `--control-plane` | | 이 노드에 새 컨트롤 플레인 인스턴스를 생성한다. |
| `--cri-socket string` | | 접속할 CRI(Container Runtime Interface) 소켓 경로. 비우면 자동 감지하며, CRI가 둘 이상이거나 비표준 소켓일 때만 쓴다. |
| `--discovery-file string` | | 파일 기반 디스커버리(discovery)에서, 클러스터 정보를 로드할 파일 또는 URL. |
| `--discovery-token string` | | 토큰 기반 디스커버리에서, API 서버에서 가져온 클러스터 정보를 검증하는 데 쓰는 토큰. |
| `--discovery-token-ca-cert-hash strings` | | 토큰 기반 디스커버리에서, 루트 CA 공개 키가 이 해시와 일치하는지 검증한다(형식: `<type>:<value>`). |
| `--discovery-token-unsafe-skip-ca-verification` | | 토큰 기반 디스커버리에서, `--discovery-token-ca-cert-hash` 고정 없이 합류를 허용한다. |
| `--dry-run` | | 어떤 변경도 적용하지 않고 수행될 작업만 출력한다. |
| `-h, --help` | | 해당 명령 도움말. |
| `--ignore-preflight-errors strings` | | 오류를 경고로 표시할 검사 목록. 예: `IsPrivilegedUser,Swap`. `all`이면 전체 무시. |
| `--node-name string` | | 노드 이름을 지정한다. |
| `--patches string` | | `target[suffix][+patchtype].extension` 형식의 파일을 담은 디렉터리 경로. 예: `kube-apiserver0+merge.yaml` 또는 `etcd.json`. `target`은 `kube-apiserver`·`kube-controller-manager`·`kube-scheduler`·`etcd`·`kubeletconfiguration`·`corednsdeployment` 중 하나, `patchtype`은 `strategic`·`merge`·`json` 중 하나(기본 `strategic`), `extension`은 `json`·`yaml`, `suffix`는 적용 순서를 알파벳·숫자순으로 정하는 선택적 문자열. |
| `--tls-bootstrap-token string` | | 노드가 합류하는 동안 Kubernetes 컨트롤 플레인에 임시로 인증하는 데 쓰는 토큰. |
| `--token string` | | `discovery-token`과 `tls-bootstrap-token` 값이 제공되지 않을 때, 둘 다에 이 토큰을 쓴다. |

## 상속 플래그 {#inherited-options}

아래 모든 하위 명령은 상위 명령에서 다음 플래그를 상속한다(각 하위 명령에서는 반복하지 않는다).

| 플래그 | 설명 |
| --- | --- |
| `--rootfs string` | '실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot하게 만든다. |

## kubeadm join phase {#phase-base}

`join` 워크플로의 단일 페이즈를 호출하는 데 이 명령을 쓴다.

**사용:** `kubeadm join phase [flags]`

**플래그:** `-h`

## kubeadm join phase preflight {#phase-preflight}

이 페이즈로 합류하는 노드에서 프리플라이트 검사를 실행할 수 있다. `kubeadm join`을 위한 프리플라이트 검사를 실행한다.

**사용:** `kubeadm join phase preflight [api-server-endpoint] [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--certificate-key` · `--config` · `--control-plane` · `--cri-socket` · `--discovery-file` · `--discovery-token` · `--discovery-token-ca-cert-hash` · `--discovery-token-unsafe-skip-ca-verification` · `--dry-run` · `-h` · `--ignore-preflight-errors` · `--node-name` · `--tls-bootstrap-token` · `--token`

```shell
# 설정 파일을 써서 합류 프리플라이트 검사 실행
kubeadm join phase preflight --config kubeadm-config.yaml
```

## kubeadm join phase control-plane-prepare {#phase-control-plane-prepare}

이 페이즈로 노드를 컨트롤 플레인 서빙용으로 준비할 수 있다. 하위 명령 없이 `kubeadm join phase control-plane-prepare`를 호출하면 `-h`만 받는다. `all`로 전체를, 또는 개별 하위 명령으로 조각을 실행한다.

```shell
# 컨트롤 플레인 서빙을 위한 머신 준비
kubeadm join phase control-plane-prepare all
```

### control-plane-prepare all {#cpp-all}

컨트롤 플레인 서빙을 위한 머신을 준비한다(아래 준비 단계 전체).

**사용:** `kubeadm join phase control-plane-prepare all [api-server-endpoint] [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--certificate-key` · `--config` · `--control-plane` · `--discovery-file` · `--discovery-token` · `--discovery-token-ca-cert-hash` · `--discovery-token-unsafe-skip-ca-verification` · `--dry-run` · `-h` · `--node-name` · `--patches` · `--tls-bootstrap-token` · `--token`

### control-plane-prepare download-certs {#cpp-download-certs}

컨트롤 플레인 노드 간 공유 인증서를 `kubeadm-certs` Secret에서 다운로드한다.

**사용:** `kubeadm join phase control-plane-prepare download-certs [api-server-endpoint] [flags]`

**플래그:** `--certificate-key` · `--config` · `--control-plane` · `--discovery-file` · `--discovery-token` · `--discovery-token-ca-cert-hash` · `--discovery-token-unsafe-skip-ca-verification` · `--dry-run` · `-h` · `--tls-bootstrap-token` · `--token`

### control-plane-prepare certs {#cpp-certs}

새 컨트롤 플레인 컴포넌트용 인증서를 생성한다.

**사용:** `kubeadm join phase control-plane-prepare certs [api-server-endpoint] [flags]`

**플래그:** `--apiserver-advertise-address` · `--config` · `--control-plane` · `--discovery-file` · `--discovery-token` · `--discovery-token-ca-cert-hash` · `--discovery-token-unsafe-skip-ca-verification` · `--dry-run` · `-h` · `--node-name` · `--tls-bootstrap-token` · `--token`

### control-plane-prepare kubeconfig {#cpp-kubeconfig}

새 컨트롤 플레인 컴포넌트용 kubeconfig를 생성한다.

**사용:** `kubeadm join phase control-plane-prepare kubeconfig [api-server-endpoint] [flags]`

**플래그:** `--certificate-key` · `--config` · `--control-plane` · `--discovery-file` · `--discovery-token` · `--discovery-token-ca-cert-hash` · `--discovery-token-unsafe-skip-ca-verification` · `--dry-run` · `-h` · `--tls-bootstrap-token` · `--token`

### control-plane-prepare control-plane {#cpp-control-plane}

새 컨트롤 플레인 컴포넌트용 매니페스트(정적 Pod)를 생성한다.

**사용:** `kubeadm join phase control-plane-prepare control-plane [flags]`

**플래그:** `--apiserver-advertise-address` · `--apiserver-bind-port` · `--config` · `--control-plane` · `--dry-run` · `-h` · `--patches`

## kubeadm join phase kubelet-start {#phase-kubelet-start}

이 페이즈로 kubelet 설정·인증서를 기록하고 kubelet을 (재)시작할 수 있다. `KubeletConfiguration`을 담은 파일과 노드별 kubelet 설정을 담은 환경 파일을 기록한 뒤 kubelet을 (재)시작한다.

**사용:** `kubeadm join phase kubelet-start [api-server-endpoint] [flags]`

**플래그:** `--config` · `--cri-socket` · `--discovery-file` · `--discovery-token` · `--discovery-token-ca-cert-hash` · `--discovery-token-unsafe-skip-ca-verification` · `--dry-run` · `-h` · `--node-name` · `--patches` · `--tls-bootstrap-token` · `--token`

## kubeadm join phase etcd-join {#phase-etcd-join}

새 etcd 멤버를 etcd 클러스터에 합류시킨다. 컨트롤 플레인 노드용 etcd 합류다.

**사용:** `kubeadm join phase etcd-join [flags]`

**플래그:** `--apiserver-advertise-address` · `--config` · `--control-plane` · `--dry-run` · `-h` · `--node-name` · `--patches`

```shell
# 컨트롤 플레인 인스턴스용 etcd를 합류
kubeadm join phase control-plane-join-etcd all
```

> **역자 주 · 정정**
> 위 예시는 원문에 `kubeadm join phase control-plane-join-etcd all`로 되어 있으나, 이는 현행 페이즈 트리와 맞지 않는다. 이 페이즈의 이름은 `etcd-join`이며(위 사용법 참조), `control-plane-join-etcd`라는 하위 명령은 현재 존재하지 않는다(`control-plane-join`은 `all`·`mark-control-plane`만 가진다). 옛 명령명이 예시에 남은 원문의 불일치로 보인다. 실제로는 `kubeadm join phase etcd-join`으로 호출한다. 원문 예시는 그대로 두되 정정을 덧붙였다.

## kubeadm join phase control-plane-join {#phase-control-plane-join}

이 페이즈로 노드를 컨트롤 플레인 인스턴스로 합류시킬 수 있다. 하위 명령 없이 `kubeadm join phase control-plane-join`을 호출하면 `-h`만 받는다. `all`로 전체를, 또는 개별 하위 명령으로 조각을 실행한다.

```shell
# 머신을 컨트롤 플레인 인스턴스로 합류
kubeadm join phase control-plane-join all
```

### control-plane-join all {#cpj-all}

머신을 컨트롤 플레인 인스턴스로 합류시킨다(아래 합류 단계 전체).

**사용:** `kubeadm join phase control-plane-join all [flags]`

**플래그:** `--apiserver-advertise-address` · `--config` · `--control-plane` · `--dry-run` · `-h` · `--node-name` · `--patches`

### control-plane-join mark-control-plane {#cpj-mark-control-plane}

노드를 컨트롤 플레인으로 표시한다.

**사용:** `kubeadm join phase control-plane-join mark-control-plane [flags]`

**플래그:** `--config` · `--control-plane` · `--dry-run` · `-h` · `--node-name`

## kubeadm join phase wait-control-plane {#phase-wait-control-plane}

컨트롤 플레인 컴포넌트가 기동할 때까지 대기한다.

**사용:** `kubeadm join phase wait-control-plane [flags]`

**플래그:** `-h`

> **역자 주 · 검증**
> 원문 최종 수정은 2025-12-16이며, 이는 kubeadm init/join phase 파일을 v1.36용으로 갱신한 커밋이다. 페이즈 트리(`preflight`·`control-plane-prepare`·`kubelet-start`·`etcd-join`·`control-plane-join`·`wait-control-plane`)가 번역 시점(2026-07-09) 현행과 일치한다. 디스커버리·TLS 부트스트랩 보안 모델(`--discovery-token-ca-cert-hash`·`--tls-bootstrap-token` 등)도 변동 없이 유효하다. 앞서 확인한 대로 현재 안정 버전은 v1.36이다. 출처: [kubeadm join phase 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join-phase/), [website 원본 소스](https://github.com/kubernetes/website/blob/main/content/en/docs/reference/setup-tools/kubeadm/kubeadm-join-phase.md).

## 역자 주 · 적용 {#translator-notes-application}

원문 정보에서 도출되는, 일반 독자 누구에게나 성립하는 실습·활용 안내다.

- `kubeadm join phase`는 `kubeadm join`의 원자적 단계를 개별 실행하는 툴박스다. 워커 노드 합류는 사실상 `preflight`·`kubelet-start`만 거치고, `control-plane-prepare`·`etcd-join`·`control-plane-join`은 `--control-plane`으로 컨트롤 플레인을 합류시킬 때만 관여한다.
- 이 페이즈들이 앞서 옮긴 문서들과 맞물린다. `control-plane-prepare download-certs`가 init phase의 `upload-certs`가 `kubeadm-certs` Secret에 올린 인증서를 다운로드한다. 즉 캡스톤에서 init이 쓰고 join이 읽는 흐름의 실체다. 디스커버리 플래그(`--discovery-token-ca-cert-hash`)와 TLS 부트스트랩(`--tls-bootstrap-token`)은 join 문서의 양방향 신뢰 다이어그램 그 자체다.
- `--dry-run`으로 각 페이즈가 할 일을 미리 확인한다. 워커 노드에서 `kubeadm join phase preflight --dry-run`으로 합류 전 점검만 돌릴 수 있다.
- HA 컨트롤 플레인을 추가할 때 이 페이즈들을 조합해 특정 단계(예: 인증서만 미리 준비)를 분리 실행할 수 있다.

<!-- REVIEW-REQUIRED: 아래 경험 슬롯을 실제 실습 결과로 채우거나 블록째 삭제할 것.
     채우지 않은 채 draft를 해제하지 않는다. -->
> **역자 주 · 적용(경험)**
> (직접 실습·검증한 결과가 있을 때만 1인칭으로 기록)

## 참고 출처 {#references}

원문이 링크한 출처:

- [kubeadm join 워크플로](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/#join-workflow)

역자 검증 출처(번역 시점 사실 확인에 사용):

- [kubeadm join phase 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join-phase/)
- [website 원본 소스 (kubeadm-join-phase.md)](https://github.com/kubernetes/website/blob/main/content/en/docs/reference/setup-tools/kubeadm/kubeadm-join-phase.md)

## 다음 단계 {#whats-next}

- [kubeadm join](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/): 워커 노드를 부트스트랩해 클러스터에 합류(이 페이즈들의 상위 명령)
- [kubeadm init phase](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init-phase/): 컨트롤 플레인 부트스트랩 단계(자매 문서)
