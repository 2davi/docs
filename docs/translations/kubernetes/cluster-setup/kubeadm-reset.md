---
title: "kubeadm reset (번역)"
original_title: "kubeadm reset"
date: 2026-07-09
lastmod: 2026-07-09
original_published: 2026-02-16

author: "The Kubernetes Authors"
translator: "Davi"

original_url: "https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/"
original_lang: "en"
translation_lang: "ko"
translation_fidelity: "faithful"

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "kubeadm init·join이 호스트에 가한 변경을 되돌리는 kubeadm reset 명령을 다룬다. 페이즈·플래그와 함께 reset이 지우지 않는 외부 etcd·CNI·네트워크 규칙·$HOME/.kube의 수동 정리 절차까지 한국어로 옮긴 레퍼런스 번역."
slug: "kubeadm-reset"

section: "translations"
category: "kubernetes/cluster-setup"
tags: [kubernetes, kubeadm, reset]

order: 118
series: "Kube ADM"
series_order: 7

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

# kubeadm reset {#kubeadm-reset}

> **원문:** [kubeadm reset](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/) · The Kubernetes Authors · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
>
> 이 문서는 원문의 절 순서와 계층을 보존해 옮기고 역자 주를 더했다. 문서 본문은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을 따른다. 비공식 번역이며 원저작자와 프로젝트의 공인을 받지 않았다. 원문과 번역이 어긋날 경우 원문이 우선한다.
>
> 원문 시점 2026-02-16 · 번역 2026-07-09

## 결론 {#conclusion}

`kubeadm reset`은 `kubeadm init`이나 `kubeadm join`이 이 호스트에 가한 변경을 최선을 다해(best effort) 되돌리는 명령이다. 노드 로컬 파일시스템에서 init·join이 만든 파일을 정리하고, 컨트롤 플레인 노드라면 이 노드의 로컬 스택 etcd 멤버를 etcd 클러스터에서 제거한다.

세 페이즈로 진행된다. `preflight`, `remove-etcd-member`, `cleanup-node`다. `kubeadm reset phase`로 개별 페이즈를 실행하고 `--skip-phases`로 건너뛸 수 있으며, `--config`로 `ResetConfiguration`을 넘길 수 있다.

핵심 한계는 reset이 '최선을 다하는' 정리라는 점이다. 외부 etcd 데이터, CNI 설정(`/etc/cni/net.d`), kube-proxy가 만든 네트워크 규칙(iptables·nftables·IPVS), `$HOME/.kube`는 reset이 지우지 않으므로 필요하면 수동으로 정리해야 한다. 특히 클러스터가 계속 존재한다면 `$HOME/.kube/config`의 admin 자격 증명이 유효한 채 남으니 삭제를 강력히 권장한다.

## 개요 {#synopsis}

`kubeadm init`이나 `kubeadm join`이 이 호스트에 가한 변경을 최선을 다해 되돌린다.

`reset` 명령은 다음 페이즈를 실행한다.

- `preflight`: 리셋 프리플라이트 검사 실행
- `remove-etcd-member`: 로컬 etcd 멤버 제거
- `cleanup-node`: 노드 정리 실행

```
kubeadm reset [flags]
```

## 플래그 {#options}

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--cert-dir string` | `/etc/kubernetes/pki` | 인증서가 저장된 디렉터리 경로. 지정하면 이 디렉터리를 정리한다. |
| `--cleanup-tmp-dir` | | `/etc/kubernetes/tmp` 디렉터리를 정리한다. |
| `--config string` | | kubeadm 설정 파일 경로. |
| `--cri-socket string` | | 접속할 CRI(Container Runtime Interface) 소켓 경로. 비우면 kubeadm이 자동 감지를 시도한다. CRI를 둘 이상 설치했거나 비표준 소켓일 때만 사용한다. |
| `--dry-run` | | 어떤 변경도 적용하지 않고 수행될 작업만 출력한다. |
| `-f, --force` | | 확인 프롬프트 없이 노드를 리셋한다. |
| `-h, --help` | | reset 도움말. |
| `--ignore-preflight-errors strings` | | 오류를 경고로 표시할 검사 목록. 예: `IsPrivilegedUser,Swap`. 값이 `all`이면 모든 검사의 오류를 무시한다. |
| `--kubeconfig string` | `/etc/kubernetes/admin.conf` | 클러스터와 통신할 때 쓸 kubeconfig 파일. 미설정 시 기존 kubeconfig 파일을 표준 위치들에서 탐색할 수 있다. |
| `--skip-phases strings` | | 건너뛸 페이즈 목록. |

## 상위 명령 상속 플래그 {#inherited-options}

| 플래그 | 설명 |
| --- | --- |
| `--rootfs string` | '실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot하게 만든다. |

## 리셋 워크플로 {#reset-workflow}

`kubeadm reset`은 `kubeadm init` 또는 `kubeadm join` 명령으로 만들어진 파일들로부터 노드 로컬 파일시스템을 정리하는 일을 맡는다. 컨트롤 플레인 노드의 경우 reset은 이 노드의 로컬 스택 etcd 멤버도 etcd 클러스터에서 제거한다.

`kubeadm reset phase`로 위 워크플로의 개별 페이즈를 실행할 수 있다. 페이즈 목록을 건너뛰려면 `--skip-phases` 플래그를 쓸 수 있으며, 이는 `kubeadm join`·`kubeadm init phase` 러너와 비슷하게 동작한다.

`kubeadm reset`은 `ResetConfiguration` 구조체를 넘기기 위한 `--config` 플래그도 지원한다.

![kubeadm reset의 정리 비대칭 다이어그램. 왼쪽은 reset가 자동으로 정리하는 것으로, remove-etcd-member 페이즈가 로컬 스택 etcd 멤버를 제거하고 cleanup-node 페이즈가 /etc/kubernetes 파일을 정리하며 --cleanup-tmp-dir로 tmp를 정리한다. 오른쪽은 reset가 지우지 않아 수동 정리가 필요한 것으로, 외부 etcd 데이터(etcdctl del), CNI 설정 /etc/cni/net.d, kube-proxy 네트워크 규칙(iptables·nftables·IPVS), $HOME/.kube/config의 admin 자격 증명이다.](./_embeds/img/kubeadm-reset/reset_cleanup_asymmetry.svg)

*이 그림은 아래 정리 절들을 자동(왼쪽)과 수동(오른쪽)으로 갈라 요약한 것이다(논리적 추론에 따른 배치). 앞서 옮긴 정적 Pod 문서의 제어 비대칭과 같은 결로, reset의 'best effort' 경계를 시각화한다.*

## 외부 etcd 멤버 정리 {#external-etcd-cleanup}

외부 etcd를 쓰는 경우 `kubeadm reset`은 어떤 etcd 데이터도 삭제하지 않는다. 이는 동일한 etcd 엔드포인트로 `kubeadm init`을 다시 실행하면 이전 클러스터의 상태가 보인다는 뜻이다. etcd 데이터를 지우려면 `etcdctl` 같은 클라이언트를 쓰는 것이 권장된다. 예:

```shell
etcdctl del "" --prefix
```

자세한 내용은 [etcd 문서](https://etcd.io/docs/)를 참조한다.

## CNI 설정 정리 {#cni-cleanup}

CNI 플러그인은 설정을 저장하는 데 `/etc/cni/net.d` 디렉터리를 쓴다. `kubeadm reset` 명령은 이 디렉터리를 정리하지 않는다. 호스트에 CNI 플러그인 설정을 남겨두면, 나중에 같은 호스트가 새 Kubernetes 노드로 쓰이고 그 클러스터에 다른 CNI 플러그인이 배포될 때 문제가 될 수 있다. CNI 플러그인 간 설정 충돌로 이어질 수 있다. 이 디렉터리를 정리하려면 필요 시 내용을 백업한 뒤 다음 명령을 실행한다.

```shell
sudo rm -rf /etc/cni/net.d
```

## 네트워크 트래픽 규칙 정리 {#network-rules-cleanup}

`kubeadm reset` 명령은 kube-proxy가 호스트에 적용한 iptables, nftables, IPVS 규칙을 정리하지 않는다. kube-proxy의 컨트롤 루프가 각 노드 호스트의 규칙이 동기화되도록 보장한다. 자세한 내용은 [가상 IP와 서비스 프록시](https://kubernetes.io/docs/reference/networking/virtual-ips/)를 참조한다. 이 규칙들을 정리하지 않고 두어도, 호스트가 나중에 Kubernetes 노드로 재사용되거나 다른 용도로 쓰일 때 문제를 일으키지 않는다.

그럼에도 규칙을 정리하고 싶다면 kube-proxy 컨테이너를 `--cleanup` 인자와 함께 실행해 정리할 수 있다.

```shell
docker run --privileged --network=host -v /lib/modules:/lib/modules:ro --rm registry.k8s.io/kube-proxy:v1.36.0 sh -c "kube-proxy --cleanup && echo DONE"
```

위 명령의 출력은 끝에 `DONE`을 인쇄해야 한다. Docker 대신 선호하는 컨테이너 런타임으로 컨테이너를 시작할 수 있다.

> **역자 주 · 검증**
> 원문 최종 수정은 2026-02-16으로 번역 시점(2026-07-09) 기준 최신이며, 페이즈(`preflight`·`remove-etcd-member`·`cleanup-node`)와 정리 절차가 현행 문서와 일치한다(GitHub 원본 소스 확인). 참고로 과거에는 `update-cluster-status` 페이즈가 있었으나 제거되었다. 위 명령의 `registry.k8s.io/kube-proxy:v1.36.0` 태그는 원문 소스에서 '현재 패치 버전'(`currentPatchVersion`)으로 렌더되는 자리다. 원문 스냅숏 시점 값이 v1.36.0이며 번역 시점 현재 패치는 v1.36.2이므로, 실제로는 클러스터 버전에 맞춰 태그를 바꾼다. 출처: [kubeadm reset 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/), [website 원본 소스](https://github.com/kubernetes/website/blob/main/content/en/docs/reference/setup-tools/kubeadm/kubeadm-reset.md).

## $HOME/.kube 정리 {#home-kube-cleanup}

`$HOME/.kube` 디렉터리에는 보통 설정 파일과 kubectl 캐시가 들어 있다. `$HOME/.kube/cache`의 내용을 정리하지 않는 것은 문제가 되지 않지만, 이 디렉터리에는 중요한 파일이 하나 있다. 바로 `$HOME/.kube/config`로, kubectl이 Kubernetes API 서버에 인증하는 데 쓰인다. `kubeadm init`이 끝나면 사용자는 `/etc/kubernetes/admin.conf` 파일을 `$HOME/.kube/config` 위치로 복사하고 현재 사용자에게 접근 권한을 주도록 안내받는다. `kubeadm reset` 명령은 `$HOME/.kube` 디렉터리의 어떤 내용도 정리하지 않는다.

`$HOME/.kube/config` 파일을 삭제하지 않고 두는 것은, `kubeadm reset` 이후 이 호스트에 누가 접근하느냐에 따라 문제가 될 수 있다. 동일한 클러스터가 계속 존재한다면, 그 안에 저장된 admin 자격 증명이 계속 유효하므로 파일을 삭제할 것을 강력히 권장한다. 이 디렉터리를 정리하려면 내용을 확인하고 필요 시 백업한 뒤 다음 명령을 실행한다.

```shell
rm -rf $HOME/.kube
```

## kube-apiserver 우아한 종료 {#graceful-shutdown}

kube-apiserver를 `--shutdown-delay-duration` 플래그로 구성했다면, `kubeadm reset`을 실행하기 전에 실행 중인 API 서버 Pod의 우아한 종료(graceful shutdown)를 시도하도록 다음 명령들을 실행할 수 있다.

```shell
yq eval -i '.spec.containers[0].command = []' /etc/kubernetes/manifests/kube-apiserver.yaml
timeout 60 sh -c 'while pgrep kube-apiserver >/dev/null; do sleep 1; done' || true
```

## 역자 주 · 적용 {#translator-notes-application}

원문 정보에서 도출되는, 일반 독자 누구에게나 성립하는 실습·활용 안내다.

- reset는 init·join의 대칭(되돌리기) 명령이다. 다만 '최선을 다하는' 정리라 지우지 않는 것이 있다: 외부 etcd 데이터, CNI 설정(`/etc/cni/net.d`), kube-proxy 네트워크 규칙, `$HOME/.kube`. 노드를 완전히 재사용하려면 이 문서의 각 절차대로 수동 정리한다.
- 클러스터가 계속 존재하면 `$HOME/.kube/config`의 admin 자격 증명이 유효하게 남으니 보안상 반드시 삭제한다.
- `--dry-run`으로 무엇이 제거될지 먼저 확인하고, `-f`/`--force`로 확인 프롬프트를 생략할 수 있다.
- reset는 캡스톤 다이어그램에서 `kubeadm-config`를 읽는 주체 중 하나다(`--config`로 `ResetConfiguration`도 받는다). init이 부트스트랩하고 join이 합류시킨 것을 되돌리며, 이로써 시리즈의 kubeadm 명령 패밀리(init·join·upgrade·config·reset)가 모두 갖춰졌다.

<!-- REVIEW-REQUIRED · 경험 슬롯
     직접 실습·검증한 결과가 있으면 아래 블록의 주석을 풀고 1인칭으로 채운다.
     없으면 이 주석 블록째로 삭제한다. 채우지 않은 채 draft를 해제하지 않는다.
> **역자 주 · 적용(경험)**
> <1차 경험을 1인칭으로>
-->

## 참고 출처 {#references}

원문이 링크한 출처:

- [etcd 문서](https://etcd.io/docs/)
- [가상 IP와 서비스 프록시](https://kubernetes.io/docs/reference/networking/virtual-ips/)

역자 검증 출처(번역 시점 사실 확인에 사용):

- [kubeadm reset 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/)
- [website 원본 소스 (kubeadm-reset.md)](https://github.com/kubernetes/website/blob/main/content/en/docs/reference/setup-tools/kubeadm/kubeadm-reset.md)

## 다음 단계 {#whats-next}

- [kubeadm init](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/): Kubernetes 컨트롤 플레인 노드 부트스트랩
- [kubeadm join](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/): Kubernetes 워커 노드를 부트스트랩해 클러스터에 합류
