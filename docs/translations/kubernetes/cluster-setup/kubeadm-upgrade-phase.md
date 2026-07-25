---
title: "kubeadm upgrade phases (번역)"
original_title: "kubeadm upgrade phases"
date: 2026-07-09
lastmod: 2026-07-09
original_published: 2025-06-24

author: "The Kubernetes Authors"
translator: "Davi"

original_url: "https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade-phase/"
original_lang: "en"
translation_lang: "ko"
translation_fidelity: "restructured"

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "kubeadm upgrade의 업그레이드 단계를 개별 실행 서브명령으로 노출하는 kubeadm upgrade apply phase·node phase를 다룬다. 각 페이즈(preflight·control-plane·upload-config·kubelet-config·bootstrap-token·addon·post-upgrade)와 플래그를 한국어로 옮긴 레퍼런스 번역."
slug: "kubeadm-upgrade-phase"

section: "translations"
category: "kubernetes/cluster-setup"
tags: [kubernetes, kubeadm, upgrade, phase]

order: 117
series: "Kube ADM"
series_order: 100

status: "active"
toc: true
comments: false
draft: false

ai_assistance:
  authorship: "ai-drafted"
  role: [translation, research]
  model: ["Claude Opus 4.8"]
  review: "reviewing"
---

# kubeadm upgrade phases {#kubeadm-upgrade-phases}

> **원문:** [kubeadm upgrade phases](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade-phase/) · The Kubernetes Authors · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
> 이 문서는 원문을 한국어로 옮기며 두괄식으로 재구성하고 역자 주를 더한 것이다. 문서 본문은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을 따른다. 변경 사항으로 결론 선행 재배치, 역자 주(검증·적용), 그리고 분량 관리를 위한 재구성이 추가되었다. **재구성 방식:** 모든 하위 명령에 반복되는 플래그를 아래 [공통 플래그](#common-flags) 표에 한 번만 싣고, 각 하위 명령에서는 플래그 이름만 나열한다. 상속 플래그 `--rootfs`는 [상속 플래그](#inherited-options)에 한 번만 싣는다. 하위 명령·플래그 정보는 누락 없이 보존했다.
> 원문 시점 2025-06-24 · 번역 2026-07-09

## 결론 {#conclusion}

`kubeadm upgrade phases`는 `kubeadm upgrade`의 업그레이드 단계를 개별 실행 서브명령으로 노출한다. 두 갈래다. `apply phase`는 첫 컨트롤 플레인 노드의 초기 업그레이드 단계를, `node phase`는 추가 컨트롤 플레인·워커 노드의 업그레이드 단계를 나눠 실행하게 해준다.

`apply phase`는 preflight → control-plane → upload-config → kubelet-config → bootstrap-token → addon → post-upgrade 순의 7개 페이즈다. `node phase`는 preflight → control-plane(이 노드에 컨트롤 플레인 인스턴스가 있으면) → kubelet-config → addon → post-upgrade 순의 5개 페이즈로, apply에서 upload-config·bootstrap-token을 뺀 것이다.

각 페이즈는 개별 호출할 수 있어, 특정 단계만 재실행하거나 건너뛰며 세밀하게 제어할 수 있다. 모든 하위 명령은 `--rootfs`를 상속하고, `--dry-run`으로 변경 없이 미리 볼 수 있다.

## 공통 플래그 {#common-flags}

아래 하위 명령들에 반복 등장하는 플래그다. 각 하위 명령에서는 이름만 나열하며, 설명은 여기서 한 번만 정의한다.

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--allow-experimental-upgrades` | | Kubernetes의 불안정 버전을 업그레이드 대안으로 표시하고 alpha/beta/RC(release candidate) 버전으로의 업그레이드를 허용한다. |
| `--allow-release-candidate-upgrades` | | Kubernetes의 RC 버전을 업그레이드 대안으로 표시하고 RC 버전으로의 업그레이드를 허용한다. |
| `--certificate-renewal` | `true` | 업그레이드 중 변경되는 컴포넌트가 쓰는 인증서의 갱신을 수행한다. |
| `--config string` | | kubeadm 설정 파일 경로. |
| `--dry-run` | | 어떤 상태도 바꾸지 않고 수행될 작업만 출력한다. |
| `--etcd-upgrade` | `true` | etcd 업그레이드를 수행한다. |
| `-f, --force` | | 일부 요구 사항이 충족되지 않아도 강제로 업그레이드한다. 이는 비대화형 모드도 함의한다. |
| `-h, --help` | | 해당 명령 도움말. |
| `--ignore-preflight-errors strings` | | 오류를 경고로 표시할 검사 목록. 예: `IsPrivilegedUser,Swap`. `all`이면 전체 무시. |
| `--kubeconfig string` | `/etc/kubernetes/admin.conf` | 클러스터와 통신할 때 쓸 kubeconfig 파일. 미설정 시 기존 kubeconfig 파일을 표준 위치들에서 탐색할 수 있다. |
| `--patches string` | | `target[suffix][+patchtype].extension` 형식의 파일을 담은 디렉터리 경로. 예: `kube-apiserver0+merge.yaml` 또는 `etcd.json`. `target`은 `kube-apiserver`·`kube-controller-manager`·`kube-scheduler`·`etcd`·`kubeletconfiguration`·`corednsdeployment` 중 하나, `patchtype`은 `strategic`·`merge`·`json` 중 하나(기본 `strategic`), `extension`은 `json`·`yaml`, `suffix`는 적용 순서를 알파벳·숫자순으로 정하는 선택적 문자열. |
| `-y, --yes` | | 확인 프롬프트 없이 업그레이드를 수행한다(비대화형 모드). |

## 상속 플래그 {#inherited-options}

아래 모든 하위 명령은 상위 명령에서 다음 플래그를 상속한다(각 하위 명령에서는 반복하지 않는다).

| 플래그 | 설명 |
| --- | --- |
| `--rootfs string` | '실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot하게 만든다. |

## kubeadm upgrade apply phase {#apply-phase}

`kubeadm upgrade apply`의 페이즈로 첫 컨트롤 플레인 노드의 초기 업그레이드 단계를 나눠 실행할 수 있다. 하위 명령 없이 `kubeadm upgrade apply phase`를 호출하면 `-h`만 받는다. 아래 하위 명령으로 개별 페이즈를 실행한다.

**사용:** `kubeadm upgrade apply phase [flags]`

### apply phase preflight {#apply-preflight}

업그레이드 전 프리플라이트 검사를 실행한다.

**사용:** `kubeadm upgrade apply phase preflight [flags]`

**플래그:** `--allow-experimental-upgrades` · `--allow-release-candidate-upgrades` · `--config` · `--dry-run` · `-f, --force` · `-h` · `--ignore-preflight-errors` · `--kubeconfig` · `-y, --yes`

### apply phase control-plane {#apply-control-plane}

컨트롤 플레인을 업그레이드한다.

**사용:** `kubeadm upgrade apply phase control-plane [flags]`

**플래그:** `--certificate-renewal` · `--config` · `--dry-run` · `--etcd-upgrade` · `-h` · `--kubeconfig` · `--patches`

### apply phase upload-config {#apply-upload-config}

kubeadm·kubelet 설정을 ConfigMap에 업로드한다.

**사용:** `kubeadm upgrade apply phase upload-config [flags]`

**플래그:** `-h`

### apply phase kubelet-config {#apply-kubelet-config}

클러스터에 저장된 `kubelet-config` ConfigMap에서 내려받아 이 노드의 kubelet 설정을 업그레이드한다.

**사용:** `kubeadm upgrade apply phase kubelet-config [flags]`

**플래그:** `--config` · `--dry-run` · `-h` · `--kubeconfig` · `--patches`

### apply phase bootstrap-token {#apply-bootstrap-token}

부트스트랩 토큰과 `cluster-info` RBAC 규칙을 구성한다.

**사용:** `kubeadm upgrade apply phase bootstrap-token [flags]`

**플래그:** `--config` · `--dry-run` · `-h` · `--kubeconfig`

### apply phase addon {#apply-addon}

기본 kubeadm 애드온을 업그레이드한다.

**사용:** `kubeadm upgrade apply phase addon [flags]`

**플래그:** `-h`

### apply phase post-upgrade {#apply-post-upgrade}

업그레이드 후 작업을 실행한다.

**사용:** `kubeadm upgrade apply phase post-upgrade [flags]`

**플래그:** `--config` · `--dry-run` · `-h` · `--kubeconfig`

## kubeadm upgrade node phase {#node-phase}

`kubeadm upgrade node`의 페이즈로 추가 컨트롤 플레인 또는 워커 노드의 업그레이드 단계를 나눠 실행할 수 있다. 하위 명령 없이 `kubeadm upgrade node phase`를 호출하면 `-h`만 받는다. 아래 하위 명령으로 개별 페이즈를 실행한다.

**사용:** `kubeadm upgrade node phase [flags]`

### node phase preflight {#node-preflight}

`kubeadm upgrade node`를 위한 프리플라이트 검사를 실행한다.

**사용:** `kubeadm upgrade node phase preflight [flags]`

**플래그:** `--config` · `-h` · `--ignore-preflight-errors`

### node phase control-plane {#node-control-plane}

이 노드에 배포된 컨트롤 플레인 인스턴스가 있으면 업그레이드한다.

**사용:** `kubeadm upgrade node phase control-plane [flags]`

**플래그:** `--certificate-renewal` · `--config` · `--dry-run` · `--etcd-upgrade` · `-h` · `--kubeconfig` · `--patches`

### node phase kubelet-config {#node-kubelet-config}

클러스터에 저장된 `kubelet-config` ConfigMap에서 내려받아 이 노드의 kubelet 설정을 업그레이드한다.

**사용:** `kubeadm upgrade node phase kubelet-config [flags]`

**플래그:** `--config` · `--dry-run` · `-h` · `--kubeconfig` · `--patches`

### node phase addon {#node-addon}

기본 kubeadm 애드온을 업그레이드한다.

**사용:** `kubeadm upgrade node phase addon [flags]`

**플래그:** `-h`

### node phase post-upgrade {#node-post-upgrade}

업그레이드 후 작업을 실행한다.

**사용:** `kubeadm upgrade node phase post-upgrade [flags]`

**플래그:** `--config` · `--dry-run` · `-h` · `--kubeconfig`

> **역자 주 · 검증**
> 원문 최종 수정은 2025-06-24이지만, apply/node 페이즈 구조는 번역 시점(2026-07-09)에도 유효하다. 패키지 v1.36.2 기준으로 apply 7개 페이즈(preflight·control-plane·upload-config·kubelet-config·bootstrap-token·addon·post-upgrade)와 `-y/--yes` 플래그, node 5개 페이즈(preflight·control-plane·kubelet-config·addon·post-upgrade)가 동일하다. node의 `addon`·`post-upgrade`는 v1.32에 추가되었고, `post-upgrade`는 현재 no-op으로 릴리스별 후처리를 담는 자리다. 앞서 확인한 대로 현재 안정 버전은 v1.36이다. 출처: [kubeadm upgrade phases 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade-phase/), [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/).

## 역자 주 · 적용 {#translator-notes-application}

원문 정보에서 도출되는, 일반 독자 누구에게나 성립하는 실습·활용 안내다.

- `kubeadm upgrade phases`는 `kubeadm upgrade`의 단계를 개별 실행하는 툴박스다. `apply phase`는 첫 컨트롤 플레인 노드에, `node phase`는 나머지 컨트롤 플레인·워커 노드에 쓴다. `node` = `apply` − {`upload-config`, `bootstrap-token`}이라는 대칭이 핵심이다.
- 앞서 옮긴 kubeadm upgrade 문서의 'apply·node 페이즈 비교' 다이어그램이 바로 이 구조를 시각화한다. `control-plane` 페이즈가 업그레이드하는 컨트롤 플레인 컴포넌트는 정적 Pod이고, `kubelet-config`·`upload-config`가 읽고 쓰는 ConfigMap은 캡스톤의 `kubeadm-config`·`kubelet-config`다.
- `--dry-run`으로 각 페이즈가 할 일을 미리 확인한다. 개별 페이즈를 직접 호출해 특정 단계만 재실행하거나, 상위 `kubeadm upgrade apply`/`node`에서 `--skip-phases`로 건너뛴다.
- 클러스터 전체 업그레이드 순서(첫 CP는 apply, 나머지는 node, 버전 스큐 준수)는 kubeadm upgrade 문서의 '클러스터 순서·버전 스큐' 다이어그램을 참조한다.

<!-- REVIEW-REQUIRED: 아래 경험 슬롯을 실제 실습 결과로 채우거나 블록째 삭제할 것.
     채우지 않은 채 draft를 해제하지 않는다. -->
> **역자 주 · 적용(경험)**
> (직접 실습·검증한 결과가 있을 때만 1인칭으로 기록)

## 참고 출처 {#references}

역자 검증 출처(번역 시점 사실 확인에 사용):

- [kubeadm upgrade phases 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade-phase/)
- [Upgrading kubeadm clusters (업그레이드 절차)](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
- [website 원본 소스 (kubeadm-upgrade-phase.md)](https://github.com/kubernetes/website/blob/main/content/en/docs/reference/setup-tools/kubeadm/kubeadm-upgrade-phase.md)

## 다음 단계 {#whats-next}

- [kubeadm upgrade](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-upgrade/): 클러스터 업그레이드 상위 명령(이 페이즈들의 부모)
- [kubeadm config](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-config/): 업그레이드가 읽는 `kubeadm-config` 설정 관리
