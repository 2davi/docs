---
title: "ADR 식별자 및 넘버링 규칙"
date: 2026-06-30
lastmod: 2026-06-30
author: "Davi"
description: "여러 프로젝트를 가로지르는 결정 기록의 전역 유일 식별자 문법 <SCOPE>-<TYPE>-<NNNN>, SCOPE/TYPE 레지스트리, 4자리 단조 넘버링, 파일·디렉터리·상호참조 규칙을 정의한다."
slug: "core-adr-0001-adr-identifier-numbering-convention"

section: "decisions"               # 신설 섹션 — 로더/사이드바 확장 필요(후속, §5 참조)
category: "core/governance/conventions"
tags: [adr, convention, governance, documentation, decision-record]

# ── decisions 전용 필드 ──
id: "CORE-ADR-0001"
doc_type: "adr"
decision_status: "accepted"        # proposed | accepted | superseded | deprecated
deciders: ["Davi"]
period:
  start: 2026-06-30
  end: ~
related_decisions: []
supersedes: ~
superseded_by: ~

status: "wip"
toc: true
draft: false
search: true

ai_assistance:
  authorship: co-authored          # human-authored | co-authored | ai-drafted
  role: [research, drafting]
  model: ["Claude Opus 4.8"]
  review: reviewed
---

# ADR 식별자 및 넘버링 규칙

| 항목 | 값 |
| --- | --- |
| **ID** | `CORE-ADR-0001` |
| **결정 상태** | Accepted |
| **타입** | ADR — Architecture Decision Record |
| **스코프** | CORE — cross-cutting governance |
| **결정자** | Davi |
| **결정일** | 2026-06-30 |
| **supersedes** | — |
| **superseded by** | — |

## 1. Context

데브로그는 더 이상 단일 프로젝트가 아니다. 현재 RDSM(REST Domain State Manager)과 DOCS(데브로그 플랫폼 자체)가 공존하며, 향후 Spring Boot 블로그 등 새 프로젝트가 추가될 예정이다. 결정 기록의 타입도 ADR 하나가 아니라 CDR(Change Decision Record)이 이미 존재하고, 기능 개요를 담는 CHR(Charter)가 신설된다.

이 환경에서 결정 기록을 안정적으로 *참조*하려면 식별자가 프로젝트와 저장소 경계를 넘어 유일해야 한다. 그러나 표준 ADR 도구·관례는 그 요구를 직접 충족하지 못한다.

- Nygard 원본 관례는 각 결정을 단조 증가(monotonic) 번호가 붙은 개별 파일로 두고, 한 프로젝트당 하나의 결정 로그(decision log)를 암묵 전제한다.
- MADR(Markdown Any Decision Records)의 공식 가이드는 카테고리를 서브폴더로 나누는 방식을 제시하되, 그 결과 *번호가 저장소 전역에서 유일하지 않고 폴더 안에서만 로컬하게 유일*해진다고 명시한다.
- 즉 표준의 답("폴더로 스코프를 나누고 번호는 폴더 안에서만 유일")을 따르면, 맥락을 벗어난 `ADR-0003` 같은 참조는 어느 프로젝트의 것인지 모호해진다.

본 결정의 목표는 다음 셋을 동시에 만족하는 *상위집합(superset)* 규칙을 정의하는 것이다.

1. 모든 프로젝트에 동일하게 적용되는 단 하나의 명명 규칙.
2. 기존 `ADR-`·`CDR-` 스타일 접두를 유지.
3. 어디서 참조하든 충돌하지 않는 전역 유일 식별자.

## 2. Decision

### 2.1 식별자 문법

결정 기록의 식별자는 다음 문법을 따른다.

```
<SCOPE>-<TYPE>-<NNNN>

  예) CORE-ADR-0001   RDSM-ADR-0000   DOCS-CHR-0001   DOCS-ADR-0003
       │    │   │
       │    │   └─ (SCOPE,TYPE)별 4자리 제로패딩 일련번호
       │    └───── 기록 타입 코드 (TYPE 레지스트리)
       └────────── 프로젝트/도메인 코드 (SCOPE 레지스트리)
```

식별자는 전역에서 유일하다. 따라서 어떤 문서·코드·대화에서 참조하든 수식어 없이 단일하게 가리킬 수 있다.

### 2.2 SCOPE 레지스트리

SCOPE는 4글자 대문자 코드이며, 다음 표를 단일 진실 공급원(SSOT)으로 관리한다. 새 프로젝트는 코드를 등록함으로써만 추가된다.

| SCOPE | 의미 | 비고 |
| --- | --- | --- |
| `CORE` | 교차 관심사 거버넌스 — 모든 스코프를 다스리는 근간 결정 | 물리적으로 분리 보관(§2.6) |
| `RDSM` | REST Domain State Manager | 기존 ARD/CDR 소급 개명(§4) |
| `DOCS` | 데브로그 플랫폼 자체의 기능·인프라 결정 | |

**SCOPE 규칙**

- 짧고, 대문자이며, 불변이다. 한번 부여한 코드는 다른 의미로 재사용하지 않는다.
- `CORE`는 어느 단일 프로젝트에도 속하지 않는다. 명명·디렉터리 구조·문서 정책 등 *모든 프로젝트에 파급되는* 결정만 담는다.

### 2.3 TYPE 레지스트리

TYPE은 3글자 대문자 코드이며, 확장 가능하다. 새 타입은 등록함으로써만 추가된다.

| TYPE | 의미 | 성격 |
| --- | --- | --- |
| `ADR` | Architecture Decision Record | 하나의 아키텍처 결정 + 근거 |
| `CDR` | Change Decision Record | 기존 결정의 변경 기록 |
| `CHR` | Charter | 기능의 컨텍스트·범위·요구사항 + 결정으로의 분해 지도 |

**TYPE 규칙**

- `ADR`은 *하나의 결정*에 관한 것이다. 여러 결정을 한 ADR에 담지 않는다.
- `CHR`은 결정 기록이 아니라 *프레이밍 문서*다. 요구사항 전체를 묶고 하위 결정(ADR/CDR)으로 연결하는 지도 역할을 한다. 따라서 ADR로 분류하지 않는다. (`status`와 `decision_status`를 분리한 것과 동일한 규율: 문서 종류를 결정 종류와 섞지 않는다.)

### 2.4 넘버링

- 일련번호는 **(SCOPE, TYPE) 쌍마다 독립**이다. `RDSM-ADR-0001`, `RDSM-CDR-0001`, `DOCS-ADR-0001`은 서로 무관하게 0001부터 시작한다.
- **4자리 제로패딩 고정폭**(`0000`–`9999`)이다. 고정폭이라야 디렉터리 목록에서 사전식 정렬이 자연 순서와 일치한다.
- 각 시퀀스는 0001부터 단조 증가한다. (기존 RDSM의 `0000`은 마이그레이션 시 그대로 보존한다.)
- 번호는 **재사용·재할당하지 않는다.** 결정이 뒤집히면 삭제·재번호가 아니라 supersession으로 처리한다(§2.7). 수락된 기록은 역사적 사실로 보존한다.

### 2.5 파일명

파일명은 식별자(소문자)에 명령형 제목을 하이픈으로 이어 붙인다.

```
<scope>-<type>-<nnnn>-<imperative-title-with-hyphens>.md

  예) core-adr-0001-adr-identifier-numbering-convention.md
```

소문자 영문 + 하이픈만 사용하며, 한글·공백·특수문자를 쓰지 않는다(기존 파일명 컨벤션 준수).

### 2.6 물리적 조직

결정 기록은 스코프별 디렉터리로 분리 보관한다.

```
decisions/
├─ core/    ← CORE-* : 모든 프로젝트를 다스리는 헌법층
├─ rdsm/    ← RDSM-*
└─ docs/    ← DOCS-*
```

`CORE`는 다른 모든 스코프를 규정하므로 물리적으로도 별도 디렉터리에 두고, 변경 시 리뷰 기준(bar)을 더 높게 잡는다. 근간 결정을 뒤집으면 전 프로젝트로 파급되기 때문이다. (여러 저장소를 가로지르는 결정을 공유 docs 저장소에 두는 일반 관례와도 일치한다.)

### 2.7 상호참조 규율

- supersession은 **양방향**으로 기록한다. 대체하는 기록은 `supersedes`에 옛 ID를, 대체되는 기록은 `superseded_by`에 새 ID를 적는다. 한쪽만 갱신하고 다른 쪽을 잊지 않는다.
- supersession이 아닌 연관은 `related_decisions`로 링크한다.

## 3. Considered Options

### 옵션 A — 단일 전역 시퀀스 (프로젝트 무관 연번)

`ADR-0001`부터 모든 프로젝트를 통틀어 하나의 연번을 부여한다.

- 장점: 번호 자체가 전역 유일.
- 단점: 번호에서 프로젝트를 알 수 없고, 프로젝트별 로컬리티가 사라진다. 여러 저장소에 흩어진 경우 "다음 번호"를 할당하려면 전 저장소를 확인해야 한다.

### 옵션 B — 폴더 스코프 + 로컬 번호 (MADR 정통)

폴더로 스코프를 나누고 번호는 폴더 안에서 0001부터 리셋한다. 구분은 경로가 한다.

- 장점: 표준 도구 기본값에 부합. 파일명에 접두 의례가 없다.
- 단점: 맥락을 벗어난 `ADR-0003`이 모호하다. 프로젝트를 가로지르는 참조마다 "어느 프로젝트의" 수식이 필요해 일관성이 샌다. — 본 결정의 목표 3을 부분적으로만 만족.

### 옵션 C — 스코프 접두 + 전역 유일 ID ✅ 채택

ID에 스코프를 박아 `<SCOPE>-<TYPE>-<NNNN>` 형태로 둔다. 번호는 (SCOPE,TYPE)별 리셋하되 ID는 전역 유일.

- 장점: 목표 1·2·3을 모두 만족. ID가 자기 설명적이고, 새 프로젝트는 코드 등록만으로 확장된다. 손으로 authoring 하는 환경이라 도구 종속이 없어 접두 추가에 제약이 없다.
- 단점: 파일명이 다소 길어진다. 기존 RDSM 기록의 소급 개명이 필요하다(§4).

## 4. Consequences

### 긍정

- 결정 기록 참조가 전역에서 충돌하지 않는다.
- 단 하나의 명명 규칙이 모든 현재·미래 프로젝트에 균일하게 적용된다.
- ID가 스코프·타입을 자기 설명한다. 새 프로젝트·새 타입은 레지스트리 추가만으로 확장된다.

### 비용 / 부정

- **RDSM 기존 기록 소급 개명**이 필요하다: `ADR-0000`–`ADR-0003` → `RDSM-ADR-0000`–`RDSM-ADR-0003`, `CDR-0001` → `RDSM-CDR-0001`.
- 파일명이 길어진다.
- **콘텐츠 로더·사이드바 확장**이 필요하다. 현재 `content.data.ts`의 glob은 `articles/notes/deep-dive/translations`만 포함하므로, `decisions/**`를 추가하지 않으면 결정 기록이 목록·태그·검색에 잡히지 않는다. `section`에 `decisions`를 신설할지, 기존 `deep-dive` 하위에 둘지는 후속 결정으로 분리한다.

### 부트스트랩(self-hosting)

- 이 레코드는 *자신이 규정하는 규칙을 자신이 처음으로 적용하는* 기록이다. 닭이 자기 출생증명서인 달걀을 낳는 격이며, MADR이 자기 형식을 자기 형식으로 문서화하는 것과 같은 self-hosting으로 무해하다.

### 후속(follow-ups)

- RDSM 소급 마이그레이션(별도 작업 또는 `RDSM-CDR-*`로 기록).
- 결정 기록 frontmatter *전체 스키마*는 본 ADR의 범위 밖이다. 식별자 외 필드(`decision_status` vocab, `deciders`/`period` 형식, `ai_assistance` 4축 등)는 별도 기록 또는 frontmatter 컨벤션 문서에서 확정한다.
- `decisions/` 트리를 콘텐츠 로더·사이드바에 통합.
- DOCS-CHR-0001(윈도우 인프라 개요) 및 DOCS-ADR-0001~0003 작성.

## 5. References

- Michael Nygard, *Documenting Architecture Decisions* / Martin Fowler, *Architecture Decision Record* — <https://martinfowler.com/bliki/ArchitectureDecisionRecord.html>
- MADR (Markdown Any Decision Records) — <https://adr.github.io/madr/>
- ADR 표준 허브 — <https://adr.github.io/>
