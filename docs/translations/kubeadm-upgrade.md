---
title: "kubeadm upgrade (번역)"
original_title: "kubeadm upgrade"
date: 2026-07-09
lastmod: 2026-07-09
original_published: 2024-08-17

author: "The Kubernetes Authors"
translator: "Davi"

original_url: "https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade/"
original_lang: "en"
translation_lang: "ko"
translation_fidelity: "restructured"

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "kubeadm 클러스터를 업그레이드하는 kubeadm upgrade 명령을 다룬다. plan(가능 버전 확인)·apply(컨트롤 플레인 업그레이드)·diff(매니페스트 변경 미리보기)·node(노드 업그레이드) 하위 명령의 페이즈와 전체 플래그를 한국어로 옮긴 레퍼런스 번역."
slug: "kubeadm-upgrade"

section: "translations"
category: "translation"
tags: [kubernetes, kubeadm, upgrade, translation]

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

# kubeadm upgrade {#kubeadm-upgrade}

>> **원문:** [kubeadm upgrade](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade/) · The Kubernetes Authors · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
>
> 이 문서는 원문을 한국어로 옮기며 두괄식으로 재구성하고 역자 주를 더한 것이다. 문서 본문은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을, 코드·명령 예시는 [Apache License 2.0](https://github.com/kubernetes/website/blob/main/LICENSE)을 따른다. 변경 사항으로 결론 선행 재배치와 역자 주(검증·적용)가 추가되었으며, 하위 명령·플래그·페이즈는 원문에서 누락 없이 옮겼다.
>
>> 원문 시점 2024-08-17 · 번역 2026-07-09

## 결론 {#conclusion}

`kubeadm upgrade`는 복잡한 업그레이드 로직을 한 명령으로 감싼 사용자 친화 명령이다. 업그레이드 계획과 실제 수행을 모두 지원한다. 네 개의 하위 명령으로 나뉜다. `plan`은 업그레이드 가능한 버전을 확인하고 클러스터가 업그레이드 가능한지 검증한다. `apply`는 컨트롤 플레인을 지정 버전으로 업그레이드한다. `diff`는 정적 Pod 매니페스트에 적용될 변경을 미리 보여준다. `node`는 노드 단위로 업그레이드한다.

핵심 동작은 다음과 같다. `plan`과 `apply`는 `admin.conf`가 있는 컨트롤 플레인 노드에서만 실행된다. Kubernetes v1.15.0부터 `apply`와 `node`는 kubeadm이 관리하는 인증서(kubeconfig에 저장된 것 포함)를 자동 갱신하며, `--certificate-renewal=false`로 끌 수 있다. `apply`와 `node`는 프리플라이트, 컨트롤 플레인 업그레이드, 설정 업로드, kubelet 설정, 애드온, 후처리 순의 페이즈로 진행되고, `--skip-phases`로 페이즈를 건너뛸 수 있다.

---

`kubeadm upgrade`는 복잡한 업그레이드 로직을 한 명령 뒤로 감춘 사용자 친화 명령으로, 업그레이드 계획 수립과 실제 수행을 모두 지원한다.

## kubeadm upgrade 안내 {#guidance}

kubeadm으로 업그레이드를 수행하는 단계는 [이 문서](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)에 정리되어 있다. 구버전 kubeadm은 Kubernetes 웹사이트의 이전 문서 세트를 참조한다.

`kubeadm upgrade diff`로 정적 Pod 매니페스트에 적용될 변경을 볼 수 있다.

Kubernetes v1.15.0 이상에서 `kubeadm upgrade apply`와 `kubeadm upgrade node`는 이 노드에서 kubeadm이 관리하는 인증서(kubeconfig 파일에 저장된 것 포함)도 자동 갱신한다. 이를 원치 않으면 `--certificate-renewal=false` 플래그를 전달할 수 있다. 인증서 갱신에 대한 자세한 내용은 [인증서 관리 문서](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/)를 참조한다.

> **참고:** `kubeadm upgrade apply`와 `kubeadm upgrade plan` 명령에는 레거시 `--config` 플래그가 있어, 해당 컨트롤 플레인 노드의 계획 수립이나 업그레이드를 수행하면서 클러스터를 재구성할 수 있다. 다만 업그레이드 워크플로는 이 시나리오를 염두에 두고 설계되지 않았으며, 예상치 못한 결과가 보고된 바 있다.

> **역자 주 · 검증**
> 원문 최종 수정은 2024-08-17이지만, 하위 명령(plan/apply/diff/node) 구조와 페이즈는 번역 시점(2026-07-09)에도 유효하다. 패키지 v1.36.2 매뉴얼이 동일한 `apply` 페이즈와 `-y, --yes` 플래그를 보여준다. `kubeadm upgrade node`의 `addon`·`post-upgrade` 페이즈는 v1.32에 추가되었고(원문 dump에도 반영), `post-upgrade`는 현재 no-op으로 릴리스별 후처리를 담는 자리다. 앞서 확인한 대로 현재 안정 버전은 v1.36이다. 출처: [kubeadm upgrade phases 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade-phase/), [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/).

## kubeadm upgrade plan {#cmd-plan}

### 개요 {#plan-synopsis}

업그레이드할 수 있는 버전을 확인하고 현재 클러스터가 업그레이드 가능한지 검증한다. 이 명령은 kubeconfig 파일 `admin.conf`가 있는 컨트롤 플레인 노드에서만 실행할 수 있다. 인터넷 확인을 건너뛰려면 선택적 `[version]` 파라미터를 전달한다.

```
kubeadm upgrade plan [version] [flags]
```

### 플래그 {#plan-options}

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--allow-experimental-upgrades` | | Kubernetes의 불안정 버전을 업그레이드 대안으로 표시하고 alpha/beta/RC(release candidate) 버전으로의 업그레이드를 허용한다. |
| `--allow-missing-template-keys` | `true` | true면 템플릿에서 필드나 맵 키가 없을 때 오류를 무시한다. golang과 jsonpath 출력 형식에만 적용된다. |
| `--allow-release-candidate-upgrades` | | Kubernetes의 RC 버전을 업그레이드 대안으로 표시하고 RC 버전으로의 업그레이드를 허용한다. |
| `--config string` | | kubeadm 설정 파일 경로. |
| `--etcd-upgrade` | `true` | etcd 업그레이드를 수행한다. |
| `-h, --help` | | plan 도움말. |
| `--ignore-preflight-errors strings` | | 오류를 경고로 표시할 검사 목록. 예: `IsPrivilegedUser,Swap`. 값이 `all`이면 모든 검사의 오류를 무시한다. |
| `--kubeconfig string` | `/etc/kubernetes/admin.conf` | 클러스터와 통신할 때 쓸 kubeconfig 파일. 미설정 시 기존 kubeconfig 파일을 표준 위치들에서 탐색할 수 있다. |
| `-o, --output string` | `text` | 출력 형식. `text\|json\|yaml\|kyaml\|go-template\|go-template-file\|template\|templatefile\|jsonpath\|jsonpath-as-json\|jsonpath-file` 중 하나. |
| `--print-config` | | 업그레이드에 쓰일 설정 파일을 출력할지 여부를 지정한다. |
| `--show-managed-fields` | | true면 JSON 또는 YAML 형식으로 오브젝트를 출력할 때 `managedFields`를 유지한다. |

### 상위 명령 상속 플래그 {#plan-inherited}

| 플래그 | 설명 |
| --- | --- |
| `--rootfs string` | '실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot하게 만든다. |

## kubeadm upgrade apply {#cmd-apply}

### 개요 {#apply-synopsis}

Kubernetes 클러스터를 지정한 버전으로 업그레이드한다.

`apply [version]` 명령은 다음 페이즈를 실행한다.

- `preflight`: 업그레이드 전 프리플라이트 검사 실행
- `control-plane`: 컨트롤 플레인 업그레이드
- `upload-config`: kubeadm·kubelet 설정을 ConfigMap에 업로드
  - `/kubeadm`: kubeadm `ClusterConfiguration`을 ConfigMap에 업로드
  - `/kubelet`: kubelet 설정을 ConfigMap에 업로드
- `kubelet-config`: 이 노드의 kubelet 설정 업그레이드
- `bootstrap-token`: 부트스트랩 토큰과 `cluster-info` RBAC 규칙 구성
- `addon`: 기본 kubeadm 애드온 업그레이드
  - `/coredns`: CoreDNS 애드온 업그레이드
  - `/kube-proxy`: kube-proxy 애드온 업그레이드
- `post-upgrade`: 업그레이드 후 작업 실행

```
kubeadm upgrade apply [version]
```

![kubeadm upgrade apply와 node의 페이즈 비교 다이어그램. apply는 preflight, control-plane, upload-config(/kubeadm·/kubelet), kubelet-config, bootstrap-token, addon(/coredns·/kube-proxy), post-upgrade 순으로 실행된다. node는 이 중 upload-config와 bootstrap-token 두 페이즈를 실행하지 않으며, 나머지 다섯 페이즈만 수행한다.](./_embeds/img/kubeadm-upgrade/apply_node_phases.svg)

*node는 apply에서 `upload-config`와 `bootstrap-token`을 제외한 부분집합이다. 두 페이즈는 클러스터 설정 업로드와 부트스트랩 토큰·RBAC 구성이라 첫 컨트롤 플레인 업그레이드에서만 필요하다(논리적 추론에 따른 배치).*

### 플래그 {#apply-options}

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--allow-experimental-upgrades` | | Kubernetes의 불안정 버전을 업그레이드 대안으로 표시하고 alpha/beta/RC 버전으로의 업그레이드를 허용한다. |
| `--allow-release-candidate-upgrades` | | Kubernetes의 RC 버전을 업그레이드 대안으로 표시하고 RC 버전으로의 업그레이드를 허용한다. |
| `--certificate-renewal` | `true` | 업그레이드 중 변경되는 컴포넌트가 쓰는 인증서의 갱신을 수행한다. |
| `--config string` | | kubeadm 설정 파일 경로. |
| `--dry-run` | | 어떤 상태도 바꾸지 않고 수행될 작업만 출력한다. |
| `--etcd-upgrade` | `true` | etcd 업그레이드를 수행한다. |
| `-f, --force` | | 일부 요구 사항이 충족되지 않아도 강제로 업그레이드한다. 이는 비대화형 모드도 함의한다. |
| `-h, --help` | | apply 도움말. |
| `--ignore-preflight-errors strings` | | 오류를 경고로 표시할 검사 목록. 예: `IsPrivilegedUser,Swap`. 값이 `all`이면 모든 검사의 오류를 무시한다. |
| `--kubeconfig string` | `/etc/kubernetes/admin.conf` | 클러스터와 통신할 때 쓸 kubeconfig 파일. 미설정 시 기존 kubeconfig 파일을 표준 위치들에서 탐색할 수 있다. |
| `--patches string` | | `target[suffix][+patchtype].extension` 형식의 파일을 담은 디렉터리 경로. 예: `kube-apiserver0+merge.yaml` 또는 단순히 `etcd.json`. `target`은 `kube-apiserver`, `kube-controller-manager`, `kube-scheduler`, `etcd`, `kubeletconfiguration`, `corednsdeployment` 중 하나다. `patchtype`은 `strategic`, `merge`, `json` 중 하나이며 kubectl이 지원하는 패치 포맷과 대응한다. 기본 `patchtype`은 `strategic`이다. `extension`은 `json` 또는 `yaml`이어야 한다. `suffix`는 패치 적용 순서를 알파벳·숫자순으로 정하는 선택적 문자열이다. |
| `--print-config` | | 업그레이드에 쓰일 설정 파일을 출력할지 여부를 지정한다. |
| `--skip-phases strings` | | 건너뛸 페이즈 목록. |
| `-y, --yes` | | 확인 프롬프트 없이 업그레이드를 수행한다(비대화형 모드). |

### 상위 명령 상속 플래그 {#apply-inherited}

| 플래그 | 설명 |
| --- | --- |
| `--rootfs string` | '실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot하게 만든다. |

## kubeadm upgrade diff {#cmd-diff}

### 개요 {#diff-synopsis}

기존 정적 Pod 매니페스트에 적용될 차이를 보여준다. 참고: `kubeadm upgrade apply --dry-run`.

```
kubeadm upgrade diff [version] [flags]
```

### 플래그 {#diff-options}

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--config string` | | kubeadm 설정 파일 경로. |
| `-c, --context-lines int` | `3` | diff에 표시할 컨텍스트 줄 수. |
| `-h, --help` | | diff 도움말. |
| `--kubeconfig string` | `/etc/kubernetes/admin.conf` | 클러스터와 통신할 때 쓸 kubeconfig 파일. 미설정 시 기존 kubeconfig 파일을 표준 위치들에서 탐색할 수 있다. |

### 상위 명령 상속 플래그 {#diff-inherited}

| 플래그 | 설명 |
| --- | --- |
| `--rootfs string` | '실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot하게 만든다. |

## kubeadm upgrade node {#cmd-node}

### 개요 {#node-synopsis}

클러스터 내 노드를 위한 업그레이드 명령.

`node` 명령은 다음 페이즈를 실행한다.

- `preflight`: 노드 업그레이드 프리플라이트 검사 실행
- `control-plane`: 이 노드에 배포된 컨트롤 플레인 인스턴스가 있으면 업그레이드
- `kubelet-config`: 이 노드의 kubelet 설정 업그레이드
- `addon`: 기본 kubeadm 애드온 업그레이드
  - `/coredns`: CoreDNS 애드온 업그레이드
  - `/kube-proxy`: kube-proxy 애드온 업그레이드
- `post-upgrade`: 업그레이드 후 작업 실행

```
kubeadm upgrade node [flags]
```

### 플래그 {#node-options}

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--certificate-renewal` | `true` | 업그레이드 중 변경되는 컴포넌트가 쓰는 인증서의 갱신을 수행한다. |
| `--config string` | | kubeadm 설정 파일 경로. |
| `--dry-run` | | 어떤 상태도 바꾸지 않고 수행될 작업만 출력한다. |
| `--etcd-upgrade` | `true` | etcd 업그레이드를 수행한다. |
| `-h, --help` | | node 도움말. |
| `--ignore-preflight-errors strings` | | 오류를 경고로 표시할 검사 목록. 예: `IsPrivilegedUser,Swap`. 값이 `all`이면 모든 검사의 오류를 무시한다. |
| `--kubeconfig string` | `/etc/kubernetes/admin.conf` | 클러스터와 통신할 때 쓸 kubeconfig 파일. 미설정 시 기존 kubeconfig 파일을 표준 위치들에서 탐색할 수 있다. |
| `--patches string` | | `target[suffix][+patchtype].extension` 형식의 파일을 담은 디렉터리 경로. 예: `kube-apiserver0+merge.yaml` 또는 단순히 `etcd.json`. `target`은 `kube-apiserver`, `kube-controller-manager`, `kube-scheduler`, `etcd`, `kubeletconfiguration`, `corednsdeployment` 중 하나다. `patchtype`은 `strategic`, `merge`, `json` 중 하나이며 kubectl이 지원하는 패치 포맷과 대응한다. 기본 `patchtype`은 `strategic`이다. `extension`은 `json` 또는 `yaml`이어야 한다. `suffix`는 패치 적용 순서를 알파벳·숫자순으로 정하는 선택적 문자열이다. |
| `--skip-phases strings` | | 건너뛸 페이즈 목록. |

### 상위 명령 상속 플래그 {#node-inherited}

| 플래그 | 설명 |
| --- | --- |
| `--rootfs string` | '실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot하게 만든다. |

## 역자 주 · 적용 {#translator-notes-application}

원문 정보와 원문이 링크한 업그레이드 가이드에서 도출되는, 일반 독자 누구에게나 성립하는 실습·활용 안내다.

![클러스터 전체 업그레이드 순서와 버전 스큐 다이어그램. 세 단계로 진행된다. ① 첫 컨트롤 플레인 노드에서 kubeadm upgrade apply <버전>, ② 추가 컨트롤 플레인 노드에서 kubeadm upgrade node, ③ 워커 노드에서 kubeadm upgrade node를 한 노드씩 실행한다. 각 노드에서 kubeadm upgrade 후 kubelet·kubectl 패키지를 새 버전으로 올린다. 버전 스큐 제약으로 kubelet은 kube-apiserver보다 최신일 수 없고, 마이너 버전은 건너뛸 수 없다.](./_embeds/img/kubeadm-upgrade/cluster_upgrade_order.svg)

*이 그림은 레퍼런스 본문이 아니라 원문이 링크한 [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/) 절차를 시각화한 것이다(논리적 추론에 따른 배치).*

- 클러스터 전체 업그레이드 순서가 정해져 있다. 첫 컨트롤 플레인 노드는 `kubeadm upgrade apply <버전>`으로, 이후 추가 컨트롤 플레인 노드와 워커 노드는 `kubeadm upgrade node`로 올린다. 한 번에 한 노드씩 진행한다.
- 버전 스큐(version skew) 정책상 kubelet은 자신이 통신하는 kube-apiserver보다 최신일 수 없다. 그래서 컨트롤 플레인의 업그레이드를 끝낸 뒤 kubelet을 올린다. 마이너 버전은 건너뛸 수 없다(예: 1.35 → 1.36만 가능, 1.34 → 1.36 불가).
- 실제 변경 전에 `--dry-run` 또는 `kubeadm upgrade diff`로 정적 Pod 매니페스트에 적용될 변경을 먼저 확인한다.
- `kubeadm upgrade`는 멱등(idempotent)이다. 실패했는데 롤백되지 않았다면(예: 실행 중 예기치 못한 종료) 다시 실행하면 선언한 목표 상태로 수렴한다.
- 이 문서는 init(부트스트랩)·join(합류)에 이은 운영 명령이다. `apply`·`node`가 업그레이드하는 컨트롤 플레인 컴포넌트는 정적 Pod로 떠 있으므로, `kubeadm upgrade diff`가 보여주는 변경이 바로 `/etc/kubernetes/manifests`의 매니페스트 변경이다. 네 문서(init·join·upgrade·정적 Pod)가 부트스트랩부터 운영까지 한 줄로 이어진다.

<!-- REVIEW-REQUIRED: 아래 경험 슬롯을 실제 실습 결과로 채우거나 블록째 삭제할 것.
     채우지 않은 채 draft를 해제하지 않는다. -->
> **역자 주 · 적용(경험)**
> (직접 실습·검증한 결과가 있을 때만 1인칭으로 기록)

## 참고 출처 {#references}

원문이 링크한 출처:

- [Upgrading kubeadm clusters (업그레이드 절차)](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
- [kubeadm 인증서 관리](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/)
- [kubeadm config](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-config/)

역자 검증 출처(번역 시점 사실 확인에 사용):

- [kubeadm upgrade phases 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade-phase/)
- [kubeadm: node에 addon·post-upgrade 페이즈 추가 (kubernetes#127242)](https://github.com/kubernetes/kubernetes/pull/127242)

## 다음 단계 {#whats-next}

- [kubeadm config](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-config/): kubeadm v1.7.x 이하로 클러스터를 초기화했다면, `kubeadm upgrade`를 위해 클러스터를 구성
