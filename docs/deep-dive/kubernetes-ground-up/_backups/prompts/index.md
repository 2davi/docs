---
title: "Kubernetes Ground-Up — CKA/CKAD & 아키텍트 역량 학습 지도"
date: 2026-07-07
lastmod: 2026-07-07
author: "Davi"
description: "kubeadm으로 세운 린 클러스터를 허브로, 선언적 상태와 조정 루프를 중심에 놓고 CKA·CKAD 5대 도메인과 소프트웨어 아키텍트 역량을 8개 Phase로 정복하는 학습 지도."
slug: "kubernetes-ground-up"

section: "deep-dive"
category: "deep-dive/kubernetes"
tags: [kubernetes, kubeadm, cilium, gateway-api, cka, ckad, k8s-1-35, learning-guide]

project: "kubernetes-ground-up"
doc_type: "learning-guide"
series: "kubernetes-ground-up"
series_order: 0
milestone: ~

order: 0
status: "wip"
draft: true
search: true
toc: true
difficulty: "intermediate"

ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "unreviewed"
---

# Kubernetes Ground-Up — 학습 지도

> 대상 버전: **Kubernetes v1.35** (현 CKA/CKAD 시험 환경 기준). deep-dive는 `version` 필드를 쓰지 않으므로 버전은 본문·태그로 고정한다.
> 기반: VirtualBox 중첩(Host-Only) · 15.8GiB/4Core · 순수 학습(CMP 분리).

## 미션
kubeadm으로 세운 **린(lean) 클러스터**를 허브로, 두 목표를 동시에 정복한다. ①**CKA·CKAD 합격 가능 수준**, ②**아키텍트로서 "왜 이렇게 도는가"를 설계 의도까지 설명 가능한 깊이**.

## 허브 — 이 시리즈를 관통하는 하나의 개념
**선언적 상태(declarative desired state) + 조정 루프(reconciliation loop) + API 요청 파이프라인.** 사용자가 `kubectl`로 원하는 상태를 선언하면, API 서버가 인증·인가·어드미션을 거쳐 etcd에 기록하고, 컨트롤러들이 실제↔원하는 차이를 끊임없이 조정하며, kubelet·CNI·CSI가 노드에서 실행한다. 8개 Phase는 이 루프가 각 도메인에서 어떻게 발현되는지를 판다.

## 전체 성공 기준
1. CKA/CKAD 각 도메인 자기평가 + killer.sh 통과선 도달.
2. 8개 Phase 각각 문서화 완료(deep-dive 시리즈, `ai_assistance.review: verified`).
3. "부수고 → 고치고 → 검증" 체화(특히 Phase 7).
4. 클러스터가 **재현 가능한 IaC**로 존재(snowflake 탈출).

## Phase 지도

| # | Phase | 핵심 | CKA/CKAD 매핑 | 메우는 과거 구멍 |
|---|-------|------|---------------|------------------|
| 1 | 기반: 컨트롤 플레인 & 조정 루프 | kubeadm 린 클러스터 · Cilium(kube-proxy 대체·Gateway API·Hubble) · 보안·IaC · etcd 백업/업그레이드 | CKA 클러스터 아키텍처 **25%** | 과잉 스택→린 재설계, 보안 위생 교정 |
| 2 | 워크로드 & 스케줄링 | 워크로드 타입 · 멀티컨테이너 패턴 · 프로브 · 스케줄링 제약 · HPA | CKA **15%** + CKAD 설계 | `1117` Pod 관리 06~13 |
| 3 | 스토리지 | PV/PVC 수명주기 · StorageClass·동적 프로비저닝 · CSI · reclaim policy | CKA **10%** + CKAD 상태 | NFS 프로비저너 개념 정리 |
| 4 | 서비스 & 네트워킹 | Service 타입 · CoreDNS · NetworkPolicy · **Gateway API** · Hubble | CKA **20%** + CKAD | `1118` Part 3 + Ingress→Gateway 현대화 |
| 5 | 설정 & 보안 | ConfigMap/Secret · RBAC · SecurityContext · Admission · User Namespaces | CKAD **25%** + CKA RBAC | `1118` Part 1·4 |
| 6 | 배포 전략 | Rolling/Recreate · Canary/Blue-Green · Helm · Kustomize · GitOps | CKAD **20%** + CKA Helm/Kustomize | `1118` Part 5·6 |
| 7 | 트러블슈팅 | Pod·노드·컨트롤플레인·네트워킹 진단 · 드릴 플레이북 | CKA **30%** (최대) | 실전 장애를 플레이북으로 승격 |
| 8 | 관측성 & 아키텍트 종합(캡스톤) | 메트릭·로그·트레이스 · Prometheus/Grafana · Hubble · 시험 모의 | 관측·유지보수 + 종합 | 아키텍트 서사 결합 |

## 시퀀싱 근거
허브(기반)를 먼저 세우고 → 워크로드·스토리지·네트워킹·설정/보안·배포(무엇을 선언하는가) → 트러블슈팅(모든 걸 부수며 통합) → 관측성/종합. **트러블슈팅을 뒤에 둔 이유**: 앞 도메인을 알아야 무엇이 어떻게 깨지는지를 안다.

## 리스크와 완화
- **RAM 천장(15.8GiB)**: 무거운 애드온 동시 상주 금지. Phase 6·8의 ArgoCD·Prometheus는 필요 시만 띄우고 내린다.
- **VirtualBox 네트워킹 상한**: 외부 도달 LB·L2 Announcement·BGP는 개념+최소 데모(ARP가 물리 L2를 못 넘음). **CKA/CKAD 네트워킹엔 무영향.**
- **8 Phase 완주 리스크**: 각 Phase의 완료 정의(Definition of Done)로 강제 종결. 헤더만 남기는 과거 패턴 차단.

## 문서 구조 (예상)
각 Phase = 서브디렉토리(`01-foundation/` … `08-observability-capstone/`), 내부에 `index.md` + 토픽 문서 N개. 상세 예상은 학습 진행에 따라 조정한다.

## 참고 출처
- [CNCF Curriculum (CKA/CKAD/CKS)](https://github.com/cncf/curriculum)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Linux Foundation — CKAD](https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/) · [CKA](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/)
- [Cilium Documentation](https://docs.cilium.io/) · [Gateway API](https://gateway-api.sigs.k8s.io/)
