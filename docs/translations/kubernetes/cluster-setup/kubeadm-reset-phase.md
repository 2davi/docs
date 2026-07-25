---
title: "kubeadm reset phase (번역)"
original_title: "kubeadm reset phase"
date: 2026-07-09
lastmod: 2026-07-09
original_published: 2024-08-17

author: "The Kubernetes Authors"
translator: "Davi"

original_url: "https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset-phase/"
original_lang: "en"
translation_lang: "ko"
translation_fidelity: "faithful"

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "kubeadm reset의 되돌리기 단계를 개별 실행 서브명령으로 노출하는 kubeadm reset phase 명령을 다룬다. preflight·remove-etcd-member·cleanup-node 페이즈와 플래그를 한국어로 옮긴 레퍼런스 번역."
slug: "kubeadm-reset-phase"

section: "translations"
category: "kubernetes/cluster-setup"
tags: [kubernetes, kubeadm, reset, phase]

order: 119
series: "Kube ADM"
series_order: 8

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

# kubeadm reset phase {#kubeadm-reset-phase}

> **원문:** [kubeadm reset phase](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset-phase/) · The Kubernetes Authors · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
>
> 이 문서는 원문의 절 순서와 계층을 보존해 옮기고 역자 주를 더했다. 문서 본문은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을 따른다. 비공식 번역이며 원저작자와 프로젝트의 공인을 받지 않았다. 원문과 번역이 어긋날 경우 원문이 우선한다.
>
> 원문 시점 2024-08-17 · 번역 2026-07-09

## 결론 {#conclusion}

`kubeadm reset phase`는 `kubeadm reset`의 되돌리기 단계를 개별 실행 서브명령으로 노출한다. 세 페이즈다. `preflight`는 리셋 프리플라이트 검사를, `remove-etcd-member`는 컨트롤 플레인 노드의 로컬 etcd 멤버를 etcd 클러스터에서 제거를, `cleanup-node`는 노드 정리를 실행한다.

각 페이즈는 개별 호출할 수 있어, 특정 단계만 실행하거나 상위 `kubeadm reset`에서 `--skip-phases`로 건너뛸 수 있다. `remove-etcd-member`는 스택 etcd를 쓰는 컨트롤 플레인 노드에서만 의미가 있고, `cleanup-node`가 실제 노드 로컬 파일(`/etc/kubernetes` 등) 정리를 담당한다.

reset의 '최선을 다하는(best effort)' 한계는 이 페이즈들에도 그대로 적용된다. 외부 etcd 데이터·CNI 설정·네트워크 규칙·`$HOME/.kube`는 어느 페이즈도 지우지 않으므로, 앞서 옮긴 [kubeadm reset](./kubeadm-reset) 문서의 수동 정리 절차(정리 비대칭)를 함께 본다.

## kubeadm reset phase (기본) {#cmd-base}

`reset` 워크플로의 단일 페이즈를 호출하는 데 이 명령을 쓴다.

**사용:** `kubeadm reset phase [flags]`

**플래그:** `-h`

모든 하위 명령은 상위 명령에서 `--rootfs string`('실제' 호스트 루트 파일시스템 경로. kubeadm이 지정한 경로로 chroot)을 상속한다. 이하에서는 반복하지 않는다.

## kubeadm reset phase preflight {#phase-preflight}

이 페이즈로 리셋되는 노드에서 프리플라이트 검사를 실행할 수 있다. `kubeadm reset`를 위한 프리플라이트 검사를 실행한다.

**사용:** `kubeadm reset phase preflight [flags]`

**플래그:** `-f, --force`(확인 프롬프트 없이 노드를 리셋) · `-h` · `--ignore-preflight-errors strings`(오류를 경고로 표시할 검사 목록. 예: `IsPrivilegedUser,Swap`. `all`이면 전체 무시)

## kubeadm reset phase remove-etcd-member {#phase-remove-etcd-member}

이 페이즈로 이 컨트롤 플레인 노드의 etcd 멤버를 etcd 클러스터에서 제거할 수 있다. 컨트롤 플레인 노드의 로컬 etcd 멤버를 제거한다.

**사용:** `kubeadm reset phase remove-etcd-member [flags]`

**플래그:** `--dry-run`(어떤 변경도 적용하지 않고 수행될 작업만 출력) · `-h` · `--kubeconfig string`(기본 `/etc/kubernetes/admin.conf`, 클러스터 통신에 쓸 kubeconfig)

## kubeadm reset phase cleanup-node {#phase-cleanup-node}

이 페이즈로 이 노드에서 정리를 수행할 수 있다. 노드 정리를 실행한다.

**사용:** `kubeadm reset phase cleanup-node [flags]`

**플래그:** `--cert-dir string`(기본 `/etc/kubernetes/pki`, 지정 시 이 디렉터리를 정리) · `--cleanup-tmp-dir`(`/etc/kubernetes/tmp` 디렉터리를 정리) · `--cri-socket string`(접속할 CRI 소켓 경로. 비우면 자동 감지) · `--dry-run` · `-h`

> **역자 주 · 검증**
> reset phase 트리(`preflight`·`remove-etcd-member`·`cleanup-node`)는 번역 시점(2026-07-09)에도 유효하다. 과거에는 `update-cluster-status` 페이즈가 있었으나 제거되었고, Arch 매뉴얼(v1.36대)과 2026-02-16 갱신된 kubeadm reset 문서에서 현재 3개 페이즈가 확인된다. 앞서 확인한 대로 현재 안정 버전은 v1.36이다. 출처: [kubeadm reset phase 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset-phase/), [kubeadm reset](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/).

## 역자 주 · 적용 {#translator-notes-application}

원문 정보에서 도출되는, 일반 독자 누구에게나 성립하는 실습·활용 안내다.

- `kubeadm reset phase`는 `kubeadm reset`의 되돌리기 단계를 쪼개 실행하는 툴박스다. 워커 노드 정리는 사실상 `preflight`·`cleanup-node`면 되고, `remove-etcd-member`는 스택 etcd를 쓰는 컨트롤 플레인 노드에서만 의미가 있다.
- 이 세 페이즈는 앞서 옮긴 kubeadm reset 문서의 '정리 비대칭' 다이어그램에서 **자동 정리(왼쪽·초록)**에 해당한다. reset이 자동으로 지우는 부분이 바로 `cleanup-node`(+`remove-etcd-member`)이고, 오른쪽(빨강)의 외부 etcd·CNI·네트워크 규칙·`$HOME/.kube`는 어느 페이즈도 지우지 않는다.
- `--dry-run`으로 각 페이즈가 지울 것을 먼저 확인한다(특히 `cleanup-node`). 개별 페이즈를 직접 호출해 특정 단계만 실행하거나, 상위 `kubeadm reset`에서 `--skip-phases`로 건너뛴다.
- 페이즈를 독립 실행할 때는 순서에 주의한다. `cleanup-node`를 먼저 돌리면 etcd 매니페스트·인증서가 지워질 수 있어, 컨트롤 플레인 노드에서는 `remove-etcd-member`(클러스터에서 멤버 제거)를 먼저 처리하는 편이 안전하다(논리적 추론에 따른 안내).

<!-- REVIEW-REQUIRED · 경험 슬롯
     직접 실습·검증한 결과가 있으면 아래 블록의 주석을 풀고 1인칭으로 채운다.
     없으면 이 주석 블록째로 삭제한다. 채우지 않은 채 draft를 해제하지 않는다.
> **역자 주 · 적용(경험)**
> <1차 경험을 1인칭으로>
-->

## 참고 출처 {#references}

역자 검증 출처(번역 시점 사실 확인에 사용):

- [kubeadm reset phase 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset-phase/)
- [kubeadm reset 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/)

## 다음 단계 {#whats-next}

- [kubeadm reset](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/): 되돌리기 상위 명령(이 페이즈들의 부모)
- [kubeadm init](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/): 컨트롤 플레인 부트스트랩
- [kubeadm join](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/): 노드를 클러스터에 합류
