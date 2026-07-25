---
# ── 식별 ─────────────────────────────────────────────
id: ~                     # 결정 기록이 아니므로 없음
title: "문서 거버넌스 작업 관리 (WBS)"
date: 2026-07-08
lastmod: 2026-07-25
author: "Davi"
description: "docs 레포에서 세션마다 흩어져 진행된 결정 기록·구현·정합성 검수 작업을 작업 분해 구조(WBS)로 총괄하고, 관련 결정 기록과 커밋 이력을 한 자리에서 추적한다."
slug: "docs-governance-wbs"

# ── 분류 ─────────────────────────────────────────────
section: ~                # 배치 확정 후 기입 (WP-6.2)
category: "ops"
tags: [wbs, governance, roadmap, ssot, vitepress]

# ── 정렬 ─────────────────────────────────────────────
order: 0
series: ~
series_order: ~

# ── 상태 ─────────────────────────────────────────────
status: "wip"
draft: true               # 배치·발행 방식 확정 전까지 빌드·사이드바 제외
search: false

# ── 선택 공통 ─────────────────────────────────────────
toc: true

# ── AI 활용 표기 ──────────────────────────────────────
ai_assistance:
  authorship: "co-authored"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "unreviewed"     # 검토 후 verified로 갱신하고 draft 해제
---

# 문서 거버넌스 작업 관리 (WBS) {#docs-governance-wbs}

## 문서 목적 {#purpose}

이 문서는 docs 레포에서 세션마다 흩어져 진행된 작업을 한 자리에 모아 추적한다. 관리 대상은 세 축이다. 첫째, 결정 기록(ADR/CDR/CHR)의 작성·검토·발행 상태. 둘째, 각 결정을 실제 코드로 옮기는 구현 작업. 셋째, 그 과정에서 남는 커밋 이력과 문서 정합성. 작업 분해 구조(WBS, Work Breakdown Structure)로 상위 작업 묶음(WP, Work Package)을 나누고, 각 묶음의 잎 작업에 상태와 의존과 근거를 붙인다.

주의할 점이 하나 있다. 아래 상태값은 이전 세션 기록에서 취합한 것이라 작업 트리(working tree)의 실제와 어긋날 수 있다. 특히 '완료'로 표기한 항목은 마지막 세션이 커밋했다고 보고한 것이며, `git log`와 실제 파일을 대조해 확정한다. 이 문서의 첫 임무는 그 대조를 마치고 상태값을 정본화하는 것이다.

## 상태 표기 {#status-legend}

| 값 | 의미 |
| --- | --- |
| 완료 | 커밋·발행까지 끝난 항목 |
| 진행 | 착수했고 일부만 끝난 항목 |
| 검토 | 산출물은 나왔으나 검토·발행 대기 (`review: unreviewed` → `draft: true`) |
| 대기 | 아직 착수하지 않은 항목 |
| 보류 | 선행 결정이 없어 착수 불가한 백로그 |

## 작업 분해 구조 개요 {#wbs-overview}

| WP | 작업 묶음 | 상태 | 근거 결정 |
| --- | --- | --- | --- |
| WP-1 | decisions 섹션 인프라 | 진행 | CORE-ADR-0001 |
| WP-2 | 스크롤 복원 구현 | 대기 | DOCS-ADR-0001 |
| WP-3 | 사이드바 리사이즈 구현 | 검토 | DOCS-ADR-0002 |
| WP-4 | docLint 구현 | 대기 | DOCS-ADR-0003 |
| WP-5 | 커밋 이력 정리 | 대기 | (해당 없음) |
| WP-6 | WBS 허브 페이지 | 진행 | (이 문서) |
| WP-7 | 전체 문서 점검과 컨벤션 정합성 | 대기 | DOCS-ADR-0002 §후속, DOCS-ADR-0003 |
| WP-8 | Convention 발행 섹션 | 대기 | 신규 ADR 선행 |
| WP-9 | 시리즈 현황 위젯 | 대기 | 신규 ADR/CHR 선행 |
| WP-10 | 윈도우 인프라 | 보류 | DOCS-CHR-0001 (미작성) |
| WP-11 | RDSM v2 리패키지 | 교차 참조 | RDSM-ADR-0004 (별도 레포) |

## 권장 진행 순서 {#recommended-sequence}

병행 트랙이 많아 뒤엉킨 상태다. 아래 순서는 의존 관계와 게이트 논리로 직렬화한 것이며, "논리적 추론에 따른 답"이다.

1. **정합성 정본화 (WP-7 일부).** ard 철자 청산, `doc_type`·`section` enum 통일, `related_*` 필드 통일, rfc 실물 인벤토리를 먼저 끝낸다. 이것이 docLint의 규칙 대장이 참조할 '정본'이므로 코드보다 앞선다. DOCS-ADR-0002 후속 3·4번과 같은 항목이다.
2. **docLint 구현 (WP-4).** 손으로 맞춘 정본을 기계 집행으로 승격한다. 이후 정합성은 빌드가 지키므로 WP-7의 나머지가 자동화된다. 마지막 세션이 "남은 본편"으로 지목한 항목이다.
3. **사이드바·스크롤 구현 (WP-3 → WP-2).** WP-3은 토큰 모듈을 이미 깔아뒀으니 docLint 다음에 자연스럽게 닫힌다. WP-2는 L1 → L2 → PhotoSwipe 순서 그대로 이어간다.
4. **커밋 리워드와 push (WP-5).** em-dash 커밋 4건을 표준 문법으로 고치고, 게이트 통과를 눈으로 확인한 뒤 push한다.
5. **Convention 발행 섹션 (WP-8).** 이 시점에 컨벤션 문서를 손대므로, WP-7.5(헤딩 교정)와 frontmatter 부여를 여기서 함께 마감한다.
6. **시리즈 위젯 (WP-9)과 허브 정식화 (WP-6).** 발행 인프라가 안정된 뒤 신규 화면을 얹는다.
7. **백로그.** 윈도우 인프라(WP-10)와 RDSM v2(WP-11)는 위가 정리된 다음에 착수한다.

## 작업 묶음 상세 {#work-packages}

### 추가(2026-07-25)

proxmox notes → deep-dive 이관 (ADR 필요, notes/deep-dive 경계 명문화 포함)

### WP-1 decisions 섹션 인프라 {#wp-1}

CORE-ADR-0001이 정한 `<SCOPE>-<TYPE>-<NNNN>` 식별 체계와 `decisions/` 물리 구조를 세우는 작업이다. 대부분 마지막 세션에 커밋되었고, 잔여는 검토·확인 항목이다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 1.1 | tokens.config.ts 토큰 레지스트리 (SECTIONS 포함) | 완료 | | 커밋됨 |
| 1.2 | docMeta.config.ts 리팩터 (DecisionType 파생 DocType, CHR 등록, deriveDecisionId·buildDecisionIndex 개명, rfc 제거) | 완료 | 1.1 | 커밋됨 |
| 1.3 | content.data.ts 로더 갱신 (레지스트리에서 glob·인덱스 제외 파생, DocItem에 id 필드) | 완료 | 1.2 | 커밋됨 |
| 1.4 | vue-tsc 타입체크 게이트 (기존 타입 에러 4건 청산) | 완료 | | 커밋됨 |
| 1.5 | RDSM 결정 기록 5건 이관 (`decisions/rdsm/`, 4 ADR + 1 CDR) | 완료 | 1.2, 1.3 | 커밋됨 |
| 1.6 | 리다이렉트 스텁 생성기 (buildEnd, meta refresh + canonical + location.replace, 무결성 가드) | 완료 | 1.5 | 커밋됨 |
| 1.7 | DocEmbed 헤딩 파서 `{#anchor}` 접미 인식 | 검토 | | 스냅샷상 반영된 듯. 실물 확인 필요 |
| 1.8 | nav·인덱스에 decisions 섹션 노출 | 검토 | 1.3 | 실물 확인 필요 |

### WP-2 스크롤 복원 구현 {#wp-2}

DOCS-ADR-0001이 정한 협력형 스크롤 복원 아키텍처의 구현이다. L0 프로토콜, L1 프레임워크 무관 코어, L2 VitePress 어댑터의 3계층으로, VitePress 종속 우회가 아니라 불변식을 이식 가능하게 남기는 것이 원칙이다. ADR 본문은 완성되어 다비 문체로 재작성까지 끝났고, 구현은 미착수다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 2.1 | L1 프레임워크 무관 코어 모듈 (History API 전용) | 대기 | | 두 번째 write가 0 대신 올바른 좌표를 받게 |
| 2.2 | L2 VitePress 호스트 어댑터 (pointerdown·keydown 캡처 사전 스탬핑) | 대기 | 2.1 | |
| 2.3 | PhotoSwipe 히스토리 관리 흡수 | 대기 | 2.2 | |
| 2.4 | 수동 검증 시나리오 5건 | 대기 | 2.3 | |
| 2.5 | ADR 검토·발행 (review verified, draft 해제) | 대기 | 2.4 | |

### WP-3 사이드바 리사이즈 구현 {#wp-3}

DOCS-ADR-0002가 정한 연속 제약(Continuous Constraint) 방식의 구현이다. 브레이크포인트별 게이트를 버리고, 단일 선호값(`--sidebar-pref`)을 저장한 뒤 CSS `clamp()`로 뷰포트 상대 폭을 계산한다. 핸들 게이트는 960px로 옮기고 입력은 Pointer Events(`setPointerCapture`)로 통일한다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 3.1 | 토큰 모듈 빌드타임 assertion (`sidebar-min + content-min ≤ 960`) | 검토 | | WCAG SC 1.4.8 CJK 40자 근거. tokens.config.ts에 반영됐는지 확인 |
| 3.2 | transformHead 무조건 hydration (첫 페인트 전) | 대기 | 3.1 | |
| 3.3 | clamp() 연속 제약 + Pointer Events 전환 | 대기 | 3.2 | |
| 3.4 | 핸들 게이트 960px 이동 | 대기 | 3.3 | VitePress stock 드로어 전환점과 일치 |
| 3.5 | ADR 검토·발행 | 대기 | 3.4 | |

### WP-4 docLint 구현 {#wp-4}

DOCS-ADR-0003이 정한 문서 거버넌스 린터다. '유령 문서'(URL은 열리는데 목록엔 없는 문서)를 기동 콘솔에서 상시 가시화하고, DOCS-ADR-0002의 frontmatter 규칙을 빌드 게이트로 집행한다. 규칙 하나가 레지스트리 엔트리 하나이고, 켜고 끄기·심각도 조정·신규 규칙 추가가 전부 데이터 수정으로 끝난다. VitePress 데드링크 검사는 재구현하지 않고 위임 엔트리로 흡수한다(섀도 라우터 금지).

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 4.1 | 규칙 레지스트리 (단일 대장, 엔트리에 근거 결정 id 주석) | 대기 | WP-7 정본화 | DOCS-ADR-0003 §2.2 |
| 4.2 | 단일 엔진 2채널 (warn/error) | 대기 | 4.1 | §2.1 |
| 4.3 | 집행 매트릭스 (`draft:false`만 error, dev 출력·build 중단) | 대기 | 4.2 | §2.3 |
| 4.4 | VitePress 데드링크 위임 엔트리 | 대기 | 4.1 | §1.4, ignoreDeadLinks 흡수 |
| 4.5 | redirect-integrity 가드 | 완료 | | §2.6 선행 구현 (WP-1.6에 포함) |
| 4.6 | ADR 검토·발행 | 대기 | 4.3, 4.4 | |

### WP-5 커밋 이력 정리 {#wp-5}

로컬 미푸시 커밋 중 em-dash 구분자 패턴을 쓴 4건을 `type(scope): subject` 표준 문법으로 리워드한다. semantic-release가 커밋 메시지에서 버전을 도출하므로 문법 불일치는 릴리스 파이프라인을 깬다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 5.1 | em-dash 커밋 4건 Conventional Commits 리워드 (`git rebase -i`) | 대기 | | semantic-release 호환 |
| 5.2 | 전체 게이트(타입체크·빌드·docLint) 통과 확인 후 push | 대기 | 5.1, WP-4 | |

### WP-6 WBS 허브 페이지 {#wp-6}

이 문서 자체다. 결정 기록·구현·커밋·정합성을 한 자리에서 총괄한다. 배치와 발행 방식은 아직 결정이 없어 열려 있다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 6.1 | WBS 문서 초안 | 진행 | | 이 파일 |
| 6.2 | 배치·발행 방식 결정 (전용 meta 섹션 / decisions 하위 CHR / 빌드 제외 ops 문서) | 대기 | | `section` enum·로더 glob 영향 |
| 6.3 | 결정·커밋 링크 자동화 여부 결정 (수동 대장 유지 vs content.data 집계) | 대기 | 6.2 | |

### WP-7 전체 문서 점검과 컨벤션 정합성 {#wp-7}

기존 모든 문서를 컨벤션과 대조해 어긋난 곳을 잡는다. 발견 사항은 아래 [정합성 검수 대장](#consistency-audit-ledger)에 누적한다. 일회성 정본화(1차)와 docLint 상시 집행(2차)의 두 단계로 나뉜다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 7.1 | ard 철자 청산 (ADR로 통일) | 대기 | | DOCS-ADR-0002 후속 3 |
| 7.2 | `doc_type`·`section` enum 3종 통일 (코드 정본 기준) | 대기 | | 아래 대장 A2·A3 |
| 7.3 | `related_adrs`·`related_ards` → `related_decisions` 통일 | 대기 | | 아래 대장 A1 |
| 7.4 | rfc 실물 인벤토리와 잔재 제거 | 대기 | | DOCS-ADR-0002 후속 4 |
| 7.5 | 기존 문서 헤딩을 davi-writing-style로 교정 (의문형·앵커 누락) | 대기 | | WP-8과 병합 처리 권장 |
| 7.6 | frontmatter-conventions §decisions 신설 + 개정 이력 기입 | 대기 | 7.1~7.4 | |

### WP-8 Convention 발행 섹션 {#wp-8}

현재 `docs/` 루트에 흩어진 컨벤션 문서(frontmatter-conventions, image-rules, filename-conventions, ai-usage-policy)를 발행 섹션으로 승격한다. 이 문서들은 거버넌스 규범인데도 nav에 없어 독자와 미래의 자신 모두 접근 경로가 없다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 8.1 | 섹션 설계 결정 (신규 ADR: 섹션명·레지스트리 편입·로더 glob·정렬) | 대기 | | decisions 섹션 신설과 동형 |
| 8.2 | 섹션 레지스트리·nav·로더 glob 편입 | 대기 | 8.1 | tokens.config.ts SECTIONS |
| 8.3 | 컨벤션 4문서 이관·frontmatter 부여·헤딩 교정 (WP-7.5 흡수) | 대기 | 8.2 | |

### WP-9 시리즈 현황 위젯 {#wp-9}

관리 중인 문서의 시리즈별 업로드·진척을 한눈에 보는 위젯 페이지다. 새 Vue 컴포넌트이므로 선행 결정 기록이 필요하다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 9.1 | 위젯 설계 결정 (신규 ADR/CHR: 집계 축·상태 어휘·렌더 규칙) | 대기 | | DocMetaCard와 동형 SSOT |
| 9.2 | 데이터 소스 (content.data.ts series·series_order·status 집계) | 대기 | 9.1 | |
| 9.3 | 위젯 컴포넌트 구현·인덱스 페이지 배치 | 대기 | 9.2 | |

### WP-10 윈도우 인프라 {#wp-10}

데스크탑 드래그·리사이즈 플로팅 윈도우, 모바일 바텀시트, 모바일 검색 FLIP 오버레이를 포함하는 브라우저 사이드 데스크톱 환경이다. 설계는 문서화되어 있으나 헌장(CHR)과 코드가 모두 없다.

| ID | 작업 | 상태 | 의존 | 근거·산출 |
| --- | --- | --- | --- | --- |
| 10.1 | DOCS-CHR-0001 윈도우 인프라 헌장 작성 | 대기 | | 요구·분해 맵 |
| 10.2 | 데스크탑 플로팅 윈도우 매니저 (모듈 레벨 반응형 싱글턴, 8방향 리사이즈) | 보류 | 10.1 | |
| 10.3 | 모바일 리사이즈 바텀시트 | 보류 | 10.1 | |
| 10.4 | 모바일 검색 FLIP 오버레이 (visualViewport 기반) | 보류 | 10.1 | |

### WP-11 RDSM v2 리패키지 {#wp-11}

교차 참조 항목이다. RDSM 라이브러리 코어는 이미 배포(v1.2.4)되어 있고, 미완인 부분은 v2.0.0 리패키지 레이어와 semantic-release 파이프라인 복구다. 실제 코드 작업은 별도 레포에 속하며, docs 레포에는 결정 기록(RDSM-ADR-0004)만 존재한다. 여기서는 링크만 유지한다.

## 정합성 검수 대장 {#consistency-audit-ledger}

WP-7의 산출 대장이다. 아래는 이번 분석에서 이미 포착한 항목으로, 실물 대조로 확정한다. '정본'은 코드가 실제로 읽는 값을 기준으로 한다.

| ID | 항목 | 위치 | 정본 | 조치 |
| --- | --- | --- | --- | --- |
| A1 | 참조 필드명 3종 혼재 (`related_adrs` / `related_ards` / `related_decisions`) | docMeta.config.ts(related_adrs), frontmatter-conventions(related_ards), 최근 리팩터(related_decisions) | `related_decisions` | 전 문서·코드 통일 |
| A2 | `doc_type` enum 3종 (ard·rfc·milestone / adr·cdr·rfc·... / chr 추가·rfc 제거) | frontmatter-conventions, docMeta.config.ts, 최근 리팩터 | 코드 최신(chr 포함·rfc 제외) | 컨벤션 문서 갱신 |
| A3 | `section` enum에 `decisions` 누락 | frontmatter-conventions(articles·notes·deep-dive·translations) | 코드(decisions 포함) | 컨벤션 문서 갱신 |
| A4 | ard 철자 잔존 (ADR과 혼용) | frontmatter-conventions 본문·부록 | ADR | 일괄 치환 |
| A5 | 헤딩 규범 자기모순 (의문형 헤딩·커스텀 앵커 누락) | frontmatter-conventions, image-rules, DOCS-ADR-0001 등 초기 문서 | davi-writing-style | 헤딩 교정·앵커 부여 |
| A6 | 컨벤션 문서 미발행 (nav·로더 밖) | docs 루트 4문서 | (섹션 편입 대상) | WP-8에서 해소 |
| A7 | rfc 타입 잔재 | docMeta.config.ts 스냅샷·컨벤션 문서 | 제거됨 | 실물 인벤토리 후 잔재 제거 |

> 대장 주의. 위 위치 중 일부는 프로젝트 지식 인덱스의 과거 스냅샷 기준이다. 인덱스가 최근 리팩터를 아직 반영하지 못해, 컨벤션 문서가 실제로 얼마나 갱신됐는지는 작업 트리에서 직접 확인한다(`grep -rn "related_ards\|related_adrs\|\brfc\b\|ard-" docs/`).

## 결정 기록 색인 {#decision-record-index}

| ID | 주제 | 상태 | 위치 |
| --- | --- | --- | --- |
| CORE-ADR-0001 | `<SCOPE>-<TYPE>-<NNNN>` 식별 체계 헌장 | accepted(추정) | `decisions/core/` |
| RDSM-ADR-0000 | (역공학 대상 결정) | 이관 완료 | `decisions/rdsm/` |
| RDSM-ADR-0001 | (역공학 대상 결정) | 이관 완료 | `decisions/rdsm/` |
| RDSM-ADR-0002 | (역공학 대상 결정) | 이관 완료 | `decisions/rdsm/` |
| RDSM-ADR-0003 | (역공학 대상 결정) | 이관 완료 | `decisions/rdsm/` |
| RDSM-CDR-0001 | (코드 결정 기록) | 이관 완료 | `decisions/rdsm/` |
| RDSM-ADR-0004 | semantic-release 복구 + v2.0.0 리패키지 | 이관 여부 확인 필요 | `decisions/rdsm/`(예정) |
| DOCS-ADR-0001 | 스크롤 복원 협력 아키텍처 | 검토(draft) | `decisions/docs/` |
| DOCS-ADR-0002 | 사이드바 리사이즈 UX | 검토(draft) | `decisions/docs/` |
| DOCS-ADR-0003 | docLint 문서 거버넌스 린터 | proposed(draft) | `decisions/docs/` |
| DOCS-CHR-0001 | 윈도우 인프라 헌장 | 미작성 | `decisions/docs/`(예정) |

## 커밋 이력 연결 {#commit-history-link}

WBS와 커밋을 잇는 대장이다. 아래는 세션 기록에서 확인한 최근 커밋과 리워드 대상이며, `git log --oneline`으로 나머지를 채워 확정한다. 각 커밋은 근거 결정을 함께 남긴다.

| 커밋(메시지 요지) | 관련 WP | 근거 결정 | 비고 |
| --- | --- | --- | --- |
| `feat(redirects): 구 URL 스텁 리다이렉트 레지스트리와 생성기 도입` | WP-1.6 | DOCS-ADR-0002 §2.8 | 표준 문법 |
| em-dash 구분자 커밋 4건 | WP-5.1 | (혼재) | 리워드 대상 |

리워드 절차 요지: `git rebase -i`로 대상 4건을 `reword` 지정하고, 각 메시지를 `type(scope): subject` 형태로 고친다. 아직 push 전이므로 히스토리 재작성은 안전하다. push는 WP-5.2에서 전체 게이트 통과를 확인한 뒤 한다.

## 참고 출처 {#references}

- VitePress, Build-Time Data Loading: https://vitepress.dev/guide/data-loading
- VitePress, Site Config(ignoreDeadLinks, Build Hooks): https://vitepress.dev/reference/site-config
- VitePress, Custom Anchors: https://vitepress.dev/guide/markdown#custom-anchors
- Conventional Commits 1.0.0: https://www.conventionalcommits.org/ko/v1.0.0/
- semantic-release, Commit Message Format: https://semantic-release.gitbook.io/semantic-release/
- W3C, Cool URIs don't change: https://www.w3.org/Provider/Style/URI
