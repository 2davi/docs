---
title: "series_order 축 교정과 review 게이트 3단계"
date: 2026-07-24
lastmod: 2026-07-24
author: "Davi"
description: "frontmatter 두 축을 교정한다. series_order를 시리즈 간 순위가 아니라 시리즈 내 순번으로 되돌리고 한 카테고리에 복수 시리즈가 공존하는 구조를 명문화한다. 그리고 ai_assistance.review를 unreviewed 차단·reviewing 조건부 발행·verified 종착의 3단계 게이트로 확정하고 reviewing 적체 경고를 규칙화한다."
slug: "docs-cdr-0002-series-axis-review-gate"

section: "decisions"
category: "decisions/docs"
tags: [frontmatter, ssot, series, ai-assistance, review, publish-gate, doclint]

# ── decisions 전용 필드 ──
id: DOCS-CDR-0002
doc_type: "cdr"
decision_status: "accepted"
deciders: ["Davi"]
period:
  start: 2026-07-24
  end: ~
related_decisions: [DOCS-ADR-0002, DOCS-ADR-0003, DOCS-ADR-0004, DOCS-CDR-0001, CORE-ADR-0001]
supersedes: ~
superseded_by: ~

status: "active"
toc: true
draft: false
search: true

ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "verified"
---

# DOCS-CDR-0002: series_order 축 교정과 review 게이트 3단계 {#docs-cdr-0002}

| 항목 | 내용 |
| --- | --- |
| 상태 | proposed |
| 결정자 | Davi |
| 기간 | 2026-07-24 ~ |
| 관련 결정 | DOCS-ADR-0002, DOCS-ADR-0003, DOCS-ADR-0004, DOCS-CDR-0001, CORE-ADR-0001 |
| 대체 관계 | 없음 |

## 1. 맥락 (Context) {#context}

이 문서는 서로 독립된 두 축을 다룬다. 한 문서에 묶는 이유는 둘 다 frontmatter 공통
필드의 의미를 확정하는 컨벤션 개정이고, 둘 다 translations 감사(DOCS-ADR-0004,
DOCS-CDR-0001)에서 실태가 드러났기 때문이다. 두 축은 §2에서 분리해 다룬다.

### 1.1 series_order의 축 오용 {#series-order-misuse}

frontmatter-conventions §0은 `series_order`를 "시리즈 내 순서"로 정의한다. 그런데
translations 발행분의 실제 값은 시리즈 사이의 순위를 담고 있었다.

| series | series_order | 소속 order |
| --- | --- | --- |
| Kube ADM | 100 (10편 전부 동일) | 111 ~ 120 |
| Administer a Cluster | 100 | 111 |
| Configure Pods and Containers | 200 | 211 |
| API Access Control | 900 | 911 |

`series_order`의 값이 `order` 앞자리와 같은 정보를 담는다. 결과로 Kube ADM 10편의
시리즈 내 순번이 전부 100으로 같아져, 시리즈 안에서 문서 순서를 정할 수 없다.

이 오용이 기능을 실제로 죽인다. 정렬 유틸 `sortToc`는 같은 시리즈 안에서
`seriesOrder` 오름차순을 1차 키로 쓴다. 값이 모두 같으면 이 키가 무력화되고 다음
키인 `order`로 넘어간다. `SeriesNav` 컴포넌트도 같은 시리즈 문서를 `seriesOrder`로
정렬해 이전·다음 링크를 만드는데, 값이 균일하면 챕터 순서가 무너진다.

값의 형태가 규칙적이라는 점이 오히려 문제의 성격을 보여준다. 이것은 입력 실수가
아니라 필드의 의미를 잘못 이해한 결과다. 축 정의를 명문화하지 않으면 다음 시리즈에서
같은 오용이 반복된다.

### 1.2 카테고리와 시리즈의 관계 미규정 {#category-series-relation}

DOCS-ADR-0004가 translations에 카테고리 폴더 계층을 도입했다. 그러면서 한 가지가
규정되지 않은 채 남았다. 한 카테고리 폴더 안에 여러 시리즈가 함께 있을 수 있는가.

실태는 그렇다. `translations/kubernetes/cluster-setup/` 하나에 Kube ADM 시리즈와
낱개 문서(static-pods)가 함께 있고, `security/`에는 API Access Control 시리즈가
들어간다. 시리즈마다 최하위 폴더를 따로 만드는 방식은 택하지 않았다. 카테고리는
주제 구분이고 시리즈는 읽기 순서 묶음이라, 둘의 입도가 다르기 때문이다.

정렬 유틸은 이 구조를 이미 지원한다. `sortToc`의 series CLUSTER 로직은 같은 시리즈
문서를 인접시켜 묶되, 시리즈 사이 순서는 각 시리즈의 시작일(구성 문서의 최소 `date`)
오름차순으로, 같은 날 시작한 시리즈는 이름 오름차순으로 배열한다. 시리즈 소속이 없는
낱개 문서는 묶음의 최하단으로 보낸다. 즉 한 카테고리 안에 복수 시리즈와 낱개 문서가
섞여도 정렬이 성립한다.

문제는 코드가 지원하는 이 구조를 컨벤션이 명문화하지 않았다는 점이다. 그 공백이
1.1의 오용을 유발했다. 시리즈 간 순위를 표현할 자리가 없다고 오해해 `series_order`에
그 값을 넣은 것이다. 실제로는 그 순위를 사람이 지정하지 않는다. 시작일에서 파생된다.

### 1.3 review 게이트의 규범과 실태 괴리 {#review-gate-gap}

`ai_assistance.review`는 §6(구 §5)에서 도입됐고 `unreviewed`, `reviewing`,
`verified` 값을 갖는다. frontmatter-conventions는 발행 문서의 기본 요건을
`verified`로 정한다.

그런데 translations 발행분은 `reviewing`이 13편, `reviewed`가 2편, `verified`가
0편이다. 규범상 15편 전부 발행 요건 미달이다.

이 괴리는 실수가 아니라 운영 방식에서 나온다. 이 사이트를 운영하는 목적 자체가
개발 노트와 학습 자료를 어디서나 읽고 공부하기 위함이고, 거기에는 AI 산출물을
검토하는 단계도 포함된다. 검토를 마쳐야만 발행할 수 있다면, 검토하려고 만든 사이트에
검토 중인 문서를 올릴 수 없는 자기모순이 생긴다. 모바일에서 읽으며 검토하려면 발행이
검토에 선행해야 한다.

즉 `reviewing` 상태의 발행은 버그가 아니라 의도된 운영이다. 규범이 실태를 따라가지
못한 것이다. 규범과 실태가 어긋난 채 두면 규범이 죽고, `verified` 요건은 아무도
지키지 않는 문구가 된다.

다만 `reviewing`을 발행 가능 상태로 인정하면 새로운 위험이 생긴다. 모든 문서가
영구히 `reviewing`에 눌러앉아 검토가 끝나지 않는 상태다. 이를 막는 장치가 없으면
`reviewing`은 사실상 검토 면제가 된다.

`reviewed`라는 값은 어휘에 정의되지 않은 표기다. 2편이 이 값을 쓰는데, `verified`의
오기이거나 `reviewing`과 `verified` 사이를 표현하려던 임의 값으로 보인다. 어휘를
확정하면서 이 값의 처리도 정한다.

## 2. 결정 (Decision) {#decision}

### 2.1 series_order 축의 복원 {#series-order-restore}

`series_order`는 **시리즈 내 순번**이다. 시리즈 사이의 순위를 담지 않는다.
frontmatter-conventions §0의 정의를 유지하되, 오용을 막도록 서술을 보강한다.

- 값은 같은 `series` 안에서 유일하며 1부터 시작한다
- 시리즈가 없는 낱개 문서는 `~`로 둔다
- **시리즈 사이의 순서를 이 필드에 넣지 않는다.** 그 순서는 지정하지 않는다(§2.2)

교정 대상은 translations 발행분 중 시리즈에 속한 문서다. Kube ADM 10편은
`series_order`를 1~10으로 다시 매긴다. 낱개 문서가 편의상 시리즈명을 달고 있던
경우(Administer a Cluster에 1편만 있는 등)는 시리즈로 볼지 낱개로 볼지 문서별로
판정한다. 구성 문서가 하나뿐인 시리즈는 시리즈가 아니라 낱개 문서로 처리하고
`series`와 `series_order`를 모두 비운다.

### 2.2 카테고리 내 복수 시리즈 {#multi-series-per-category}

한 카테고리 폴더 안에 여러 시리즈와 낱개 문서가 공존할 수 있다. 이를 컨벤션에
명문으로 둔다. 시리즈마다 최하위 폴더를 만들지 않는다.

근거는 입도의 차이다. 카테고리는 주제 구분이고 시리즈는 읽기 순서 묶음이다. 같은
주제 안에 서로 다른 읽기 흐름이 여럿 있을 수 있고, 흐름에 속하지 않는 단발 문서도
있을 수 있다.

시리즈 사이의 순서는 사람이 지정하지 않는다. `sortToc`가 각 시리즈의 시작일에서
파생한다. 구체적으로 시리즈의 순위는 그 시리즈를 구성하는 문서 중 가장 이른 `date`로
정해지고, 같은 날 시작한 시리즈끼리는 이름 오름차순이며, 낱개 문서는 묶음의 최하단에
모인다. 이 규칙은 이미 코드에 있으므로 이 결정은 그 동작을 컨벤션으로 확인할 뿐
코드를 바꾸지 않는다.

따라서 시리즈 간 순위를 담는 필드는 신설하지 않는다. `series_order`에 그 값을 넣지
않는다. 시리즈의 상대 순서를 조정하고 싶으면 구성 문서의 `date`를 조정한다.

### 2.3 review 게이트 3단계 {#review-three-stage}

`ai_assistance.review`의 값을 세 단계로 확정하고 각 단계의 발행 가부를 정한다.

| 값 | 의미 | 발행 |
| --- | --- | --- |
| `unreviewed` | AI 산출물을 사람이 아직 검토하지 않았다 | 차단 |
| `reviewing` | 검토가 진행 중이다. 사람이 최소 1회 통독하고 명백한 오류는 잡았으나 검증이 끝나지 않았다 | 조건부 허용 |
| `verified` | 검토를 마쳤다. 사실관계와 역자 주를 사람이 확인했다 | 허용 |

`reviewing`을 발행 가능 상태로 인정한다. 이 사이트의 운영 목적이 읽으며 검토하는
것이므로, 검토 중 문서의 발행은 의도된 동작이다. 다만 `reviewing`으로 발행한 문서는
검토가 끝나지 않았다는 사실을 독자가 알 수 있어야 한다(§2.5).

`unreviewed`는 발행을 차단한다. 검토를 한 번도 거치지 않은 AI 산출물이 그대로
노출되는 것은 이 사이트의 산출물 기준(DOCS-CDR-0001 §2.4의 본문 순수성, 역자 주
사실 확인)에 어긋난다.

`draft: false`이면서 `review: unreviewed`인 조합은 금지한다. docLint error로 잡는다.

`reviewed`는 폐기한다. 이 값을 쓰는 문서는 검토 완료 여부에 따라 `verified` 또는
`reviewing`으로 교정한다. 판정이 서지 않으면 `reviewing`으로 둔다. 검토 미완을
완료로 표기하는 것보다 완료를 미완으로 표기하는 편이 안전하다.

### 2.4 reviewing 적체 경고 {#reviewing-backlog-warn}

`reviewing`을 발행 가능 상태로 인정하는 대가로, 적체를 드러내는 경고를 둔다.
DOCS-ADR-0003의 규칙 레지스트리에 다음을 추가한다.

| 채널 | 규칙 id | 내용 |
| --- | --- | --- |
| warn | review-backlog | `draft: false`이고 `review: reviewing`인 문서의 목록과 총계 |
| error | review-unreviewed-published | `draft: false`이고 `review: unreviewed`인 문서 |

`review-backlog`는 차단이 아니라 경고다. `draft-inventory`(DOCS-ADR-0003 §2.7)와
같은 계열이며, 발행을 막지 않되 검토 대기 목록을 매 빌드에 노출해 적체를 가시화한다.
이 목록이 곧 검토 작업 대기열이 된다.

경고를 무력화하지 않으려면 목록이 무한정 길어지지 않아야 한다. 이는 규칙이 아니라
운영으로 관리한다. 새 번역을 발행할 때 오래된 `reviewing` 문서 하나를 `verified`로
올리는 식이다. 규칙은 상태를 드러낼 뿐 강제하지 않는다.

### 2.5 reviewing 발행물의 표식 {#reviewing-badge}

`reviewing` 상태로 발행된 문서는 검토 중임을 독자에게 알린다. 표식의 구현은 이
문서가 확정하지 않고 후속으로 넘긴다(§5). frontmatter의 `review` 값을 카드나 문서
상단에 노출하는 방식이 후보다.

표식이 필요한 이유는 `reviewing` 발행을 인정한 전제와 짝을 이룬다. 검토가 끝나지
않은 문서를 공개하는 것이 정당하려면, 그 사실이 독자에게 투명해야 한다. AI 활용
투명성(ai_assistance 스키마의 취지)의 연장이다.

### 2.6 frontmatter-conventions 개정 지시 {#conventions-revision}

이 결정을 frontmatter-conventions에 반영한다.

| 대상 | 개정 내용 |
| --- | --- |
| §0 `series_order` 주석 | "시리즈 내 순서. 1부터. 시리즈 간 순위를 넣지 않는다"로 보강 |
| §0 또는 새 절 | 카테고리 내 복수 시리즈 공존과 시리즈 간 순서의 시작일 파생을 명문화(§2.2) |
| §6 `review` | 세 값의 의미와 발행 가부를 표로 명시(§2.3). `reviewed` 폐기 |
| §6 발행 요건 | "발행 기본 요건은 verified"를 "발행은 reviewing 이상, unreviewed는 차단"으로 교정 |

`reviewing` 단계 정의는 DOCS-CDR-0001 §2.5(발행 게이트)의 역자 주 사실 확인 조건과
연결된다. translations의 경우 `reviewing`은 최소한 명백한 오류를 잡은 상태를
뜻하며, 사실관계 확인까지 끝나면 `verified`다.

## 3. 검토한 대안과 기각 이유 {#alternatives}

| 대안 | 내용 | 기각 이유 |
| --- | --- | --- |
| series_order에 시리즈 간 순위 유지 | 현행 실태 인정 | 시리즈 내 순서를 표현할 자리가 사라져 sortToc·SeriesNav가 무력화된다 |
| 시리즈 간 순위 필드 신설 | series_rank 같은 필드 추가 | sortToc가 시작일로 이미 파생한다. 필드 추가는 파생 가능한 값을 수동 관리로 되돌리는 것이며 한 필드 한 축 원칙에 어긋난다 |
| 시리즈마다 최하위 폴더 | translations/kubernetes/kubeadm/ 등 | 카테고리와 시리즈의 입도가 다르다. 낱개 문서와 복수 시리즈 공존을 표현할 수 없고 폴더가 과도하게 깊어진다 |
| verified 요건 유지 | 규범대로 verified만 발행 | 읽으며 검토하는 운영 목적과 충돌한다. 규범과 실태의 괴리가 지속되어 규범이 죽는다 |
| reviewing 무제한 허용 | 적체 경고 없이 허용 | 모든 문서가 영구 reviewing에 눌러앉아 검토 면제가 된다 |
| reviewing 발행 차단 | verified만 발행, reviewing은 draft | 모바일 검토 워크플로가 불가능해진다. 사이트 운영 목적 자체를 부정한다 |
| reviewed를 정식 값으로 승격 | 4단계 어휘로 확장 | reviewing과 verified 사이의 의미가 모호하다. 단계가 늘면 판정 비용만 오른다 |

## 4. 결과 (Consequences) {#consequences}

### 4.1 기대 효과 {#gains}

`series_order`가 시리즈 내 순서를 담아 sortToc와 SeriesNav가 정상 동작한다. 시리즈
안에서 챕터 순서가 서고 이전·다음 링크가 맞는다.

카테고리와 시리즈의 관계가 명문화되어, 한 주제 폴더에 여러 읽기 흐름과 낱개 문서를
자유롭게 둘 수 있다. 시리즈 간 순서를 수동 관리하지 않으므로 시리즈를 추가할 때
기존 문서의 값을 조정할 필요가 없다.

review 게이트가 운영 실태와 일치해 규범이 되살아난다. `reviewing` 발행이 정식으로
인정되어 모바일 검토 워크플로가 규범 안에 들어온다. 적체 경고가 검토 대기열을
가시화한다. `unreviewed` 발행이 빌드에서 차단된다.

### 4.2 감수 비용 {#tradeoffs}

Kube ADM 10편의 `series_order`를 다시 매겨야 하고, 낱개인지 시리즈인지 문서별로
판정해야 한다. `reviewed` 2편을 재분류해야 한다.

`reviewing` 적체는 규칙이 아니라 운영으로 관리하므로, 목록을 주기적으로 줄이는 습관에
의존한다. 습관이 무너지면 경고가 노이즈가 된다.

시리즈 간 순서가 시작일에 묶이므로, 순서를 바꾸려면 `date`를 조정해야 한다. `date`는
정렬·표시의 기준이기도 하므로 부수 효과가 있다. 다만 시리즈 순서를 사후에 바꾸는
일은 드물다.

### 4.3 변경 제외 범위 {#out-of-scope}

정렬 유틸(`docSort.ts`)의 로직은 바꾸지 않는다. 이 결정은 코드가 이미 지원하는
동작을 컨벤션으로 확인할 뿐이다. `SeriesNav`·`CategoryIndex` 컴포넌트도 건드리지
않는다.

`ai_assistance`의 나머지 세 축(authorship, role, model)은 다루지 않는다. `review`
축만 확정한다.

전 섹션의 `category` 접두사 관례 통일(DOCS-ADR-0004 §4.3 유예 항목)은 이 문서의
범위 밖이다. `reviewing` 표식의 UI 구현도 후속으로 넘긴다.

## 5. 후속 (Follow-ups) {#follow-ups}

1. `reviewing` 발행물의 표식 UI 구현(§2.5). 카드 또는 문서 상단에 `review` 값을
   노출하는 방식을 정한다. `docMeta.config.ts`의 카드 필드 매트릭스에 `review`를
   태울지 결정한다.
2. `review-backlog`·`review-unreviewed-published` 규칙의 `rules.ts` 등재. error
   규칙은 발행 문서만 대상으로 하는 기존 규약을 따른다.
3. `series_order` 재부여 후 sortToc 결과를 dev 서버에서 확인. Kube ADM 10편이
   1~10 순서로 인접 정렬되는지, SeriesNav의 이전·다음이 맞는지 검증한다.
4. 낱개 시리즈 판정 기준의 일반화. 구성 문서 1편인 시리즈를 낱개로 처리하는 규칙을
   frontmatter-conventions에 둘지, 문서별 판단으로 남길지 정한다.
5. `date` 기반 시리즈 순서의 한계 확인. 두 시리즈를 의도적으로 특정 순서로 놓고
   싶은데 시작일이 그와 어긋나는 경우가 실제로 생기는지 관찰한다. 생기면 그때
   시리즈 간 순위 필드를 재검토한다(현 시점에는 불필요).

## 6. 참고 출처 {#references}

- frontmatter-conventions.md §0, §6 (개정 대상 정본)
- docs/.vitepress/theme/utils/docSort.ts (sortToc series CLUSTER 로직)
- docs/.vitepress/theme/components/SeriesNav.vue (seriesOrder 소비처)
- DOCS-ADR-0003 §2.2, §2.7 (규칙 레지스트리, draft-inventory 계열)
- DOCS-CDR-0001 §2.5 (발행 게이트, review 조건 연결)
- Google Search Central, AI 생성 콘텐츠 가이드: <https://developers.google.com/search/blog/2023/02/google-search-and-ai-content>
