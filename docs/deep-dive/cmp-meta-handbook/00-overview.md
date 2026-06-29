---
title: "CMP Meta Handbook — 환경 정찰·테스트 거버넌스 메타 프레임워크"
date: 2026-04-26
lastmod: 2026-04-26
author: "Davi"
description: "CMP/PVE 사전 정찰 핸드북에서 환경 종속 본문을 제거하고 추출한 일반화 가능한 메타 자산: Blast Radius × Reversibility 격자, 4 테스트 분류, 챕터 표준 구조, 6 layer 검증 사슬. 어떤 인프라 SaaS·관리 도구 환경에도 이식 가능한 운영 프레임워크."
slug: "cmp-meta-handbook-overview"
tags: [cmp, proxmox, test-governance, risk-matrix, validation-chain, deep-dive]
categories: [deep-dive, infrastructure]
section: "deep-dive"
category: "cmp-meta-handbook"

project: "cmp-meta-handbook"
doc_type: "learning-guide"
series: "CMP Meta Handbook"
series_order: 1

status: "active"
difficulty: "intermediate"
order: 1
toc: true
draft: false
search: true
masking_policy: "v4"

ai_assistance:
  authorship: co-authored
  role: [drafting, research, review]
  model: ["claude-opus-4.7"]
  review: reviewed
---

## 0. 시리즈 개요

본 시리즈는 클라우드 관리 플랫폼(CMP) 또는 그 하부 가상화(KVM/Proxmox VE) 환경에서 **사전 통합 테스트(STN)를 준비하는 사람**을 위한 메타 프레임워크다. 특정 회사·특정 클러스터에 종속된 정찰 결과는 포함하지 않으며, 환경에서 분리 가능한 **거버넌스 도구 4종**만 다룬다.

### 0.1 메타 자산 4종

| # | 자산 | 적용 영역 | 본 시리즈 챕터 |
| --- | --- | --- | --- |
| 1 | **Blast Radius × Reversibility 격자 (L×R)** | 모든 운영 작업의 위험도 분류 | [01-blast-radius-grid](./01-blast-radius-grid) |
| 2 | **4 테스트 분류 프레임워크** | 인프라 SaaS·관리 도구 테스트 카테고리화 | [02-test-classification](./02-test-classification) |
| 3 | **챕터 표준 구조** | 운영 매뉴얼 작성 템플릿 (§0~§5) | [03-chapter-template](./03-chapter-template) |
| 4 | **6 Layer 검증 사슬** | UI→API→설정→노드→게스트→사용가능성 풀체인 검증 | [04-six-layer-validation](./04-six-layer-validation) |

각 자산은 독립적이며 별개로 채택 가능하다. 4개를 결합하면 **"환경 정찰 → 위험 평가 → 테스트 분류 → 매뉴얼화 → 검증 실행"** 한 사이클을 다룰 수 있다.

### 0.2 본 시리즈가 답하는 질문

- "운영 작업을 위험도로 분류할 일관 기준은 무엇인가?" → 01
- "CMP 같은 인프라 SaaS의 테스트는 어떻게 카테고리화해야 누락이 없는가?" → 02
- "정찰 결과를 매뉴얼로 옮길 때 어떤 구조가 재사용 가능한가?" → 03
- "UI에서 클릭한 결과가 실제 인프라에 반영됐는지 어떻게 풀체인으로 검증하는가?" → 04

### 0.3 본 시리즈가 다루지 않는 것

- 특정 클러스터의 노드 IP·자원 인벤토리 (환경 종속)
- CMP 제품의 결함 카탈로그 (영업 영역)
- 회사 내부 협의·인사 관련 문맥

이러한 환경 종속 자산은 사내 보존본에만 존재하며, 본 외부 공개판에서는 의도적으로 분리되었다. 본 시리즈를 읽고 자기 환경에 적용하려면 독자가 직접 자기 환경의 정찰을 수행해야 한다.

### 0.4 가상 예시 환경

본 시리즈의 코드·격자·표 예시에 등장하는 식별자는 모두 가상 placeholder다.

- 노드: `pve-nodeA` ~ `pve-nodeE` (5노드 클러스터 예시)
- 클러스터: `pve-clusterX`
- IP 대역: RFC 5737/6598 예약 대역
  - mgmt: `192.0.2.0/24`
  - corosync0: `198.51.100.0/24`
  - corosync1: `203.0.113.0/24`
  - vm: `100.64.0.0/24`
- 사용자: `admin`, `operator`, `user-1` ~ `user-N` (역할 기반 일반 명명)
- 도메인: `example.com`, `example.org` (RFC 2606)

이는 사용자의 실제 환경에서 실행할 수 있는 값이 아니며, 자기 환경 식별자로 치환하여 사용해야 한다.

---

## 1. 메타 자산의 출처와 일반화 근거

본 시리즈의 4 자산은 5노드 PVE 클러스터에서 60시간 정찰을 수행하면서 만들어진 사내 핸드북에서 추출되었다. 추출의 정당성:

| 자산 | 사내 핸드북 원소속 | 환경 의존도 | 일반화 가능성 |
| --- | --- | --- | --- |
| L×R 격자 | 챕터 00 §3 | 0% (환경 사실 없음) | 인프라 운영 일반론 |
| 4 테스트 분류 | 챕터 00 §4 | 0% | 인프라 SaaS 테스트 일반 |
| 챕터 표준 구조 | 챕터 00 §5 | 0% | 운영 매뉴얼 작성 템플릿 |
| 6 Layer 사슬 | 사전 테스트 가이드 §2 | 0% (PVE 래퍼 일반) | CMP 외 모든 PVE 관리 도구 |

**환경 의존도 0%**가 모든 자산의 공통점이다. 자산은 격자 칸·분류 카테고리·구조 항목·검증 단계라는 추상물로만 구성되며, 실제 환경의 노드명·IP·자원명은 자산의 일부가 아니다.

### 1.1 추출 원칙

- **메타 자산만 가져온다** — 자산을 작동시키는 데 동원된 환경 사실(예: 특정 노드에서 발견한 NFS alias 충돌)은 일반화 단계에서 제거
- **사례는 가상화한다** — 격자의 칸을 시연하는 예시는 가상 환경(`pve-nodeA`, `192.0.2.X`)으로 재서술
- **사내 자산을 변형하지 않는다** — 본 시리즈는 사내 핸드북을 덮어쓰지 않으며 별도 트랙으로 존재. 사내 보존본은 환경 식별성을 유지한 채 학습 자료로 보존

---

## 2. 사용자별 진입 경로

### 2.1 운영 위험 평가가 우선인 독자

**SRE / 인프라 운영자**는 [01-blast-radius-grid](./01-blast-radius-grid)부터 읽는다. 작업 위험 분류 일관 기준이 가장 큰 가치.

### 2.2 테스트 거버넌스 설계가 우선인 독자

**QA 리드 / 테스트 엔지니어**는 [02-test-classification](./02-test-classification) → [04-six-layer-validation](./04-six-layer-validation) 순서. 분류 후 분류별 풀체인 검증을 짠다.

### 2.3 매뉴얼·핸드북 작성이 우선인 독자

**테크니컬 라이터 / 시니어 개발자**는 [03-chapter-template](./03-chapter-template) → [01](./01-blast-radius-grid). 구조 잡고 위험 평가 절을 채운다.

### 2.4 풀체인 검증이 우선인 독자

**시스템 통합 테스터**는 [04-six-layer-validation](./04-six-layer-validation)만 단독으로도 가치. UI→API→인프라 검증 사슬은 자체 완결적.

---

## 3. 본 시리즈의 한계와 라이선스

### 3.1 검증 범위

본 시리즈의 자산은 **단일 환경(5노드 PVE)에서 60시간 정찰 + 한 차례 STN 사이클**에 검증되었다. 다음 환경에서의 적용 가능성은 추정에 머물며, 독자의 검증을 권장한다.

- 10노드 이상 대규모 클러스터
- 멀티 사이트·DR 클러스터
- VMware vSphere 등 비-PVE 가상화
- Kubernetes 기반 IaaS

### 3.2 AI 협업 disclosure

본 시리즈의 일부 챕터는 AI 보조(Anthropic Claude)로 초안이 작성되었으며, 작성자가 사실 검증·재작성·구조 결정을 수행했다. 각 챕터의 frontmatter에 `ai_assistance` 필드로 협업 정도가 명시된다.

### 3.3 라이선스

본 시리즈는 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)으로 배포된다. 자유롭게 인용·재구성 가능하며, 출처(저자명 + 본 시리즈 URL) 표기를 요구한다.

---

## 4. 갱신 이력

| 일자 | 변경 |
| --- | --- |
| 2026-04-26 | 초안 작성. 4 자산 추출 작업 진행 중 (01~04은 후속 챕터로 작성 예정). |

> **본 시리즈는 작성 중이다.** 챕터 01~04이 모두 완성될 때까지 본 overview는 자산의 추상 구조만 제시한다.
