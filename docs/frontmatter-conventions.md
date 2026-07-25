# Frontmatter Convention (2026-07-07) {#title}

> ## 개정 이력
>
> - **2026-07-25**
>   - `ai_assistance`의 `review` 필드 라벨 수정 → reviewed 폐기, verified | reviewing | unreviewed 삼단 구별로 확정.
>   - 미반영된 컨벤션 문구 및 주석 수정.
>
> - **2026-07-06**
>   - `decisions` 섹션 신설 → **§5** (id 단일 진실 원천, doc_type 명시 의무, decision_status 어휘, docLint 집행). 근거: DOCS-ADR-0002
>   - 기존 §5 `ai_assistance` → **§6** 이동 (내용 무변경, 본문 참조 3곳 갱신)
>   - 참조 필드 정본을 `related_decisions`로 통일. `related_ards`(ard 철자) 폐기, 코드(`related_adrs`)와의 표기 드리프트 청산. 근거: DOCS-ADR-0002 §2.6
>   - 제목의 개정일 갱신 (2026-06-26 → 2026-07-07)
>
> - **2026-06-26**
>   - `ai_assistance` 블록 신설 → **§5** (authorship / role / model / review 4축 구조)
>   - `category` **단수 표기로 통일**. 기존 일부 예시가 `categories: [..]`(복수 배열)였으나,
>     로더(`content.data.ts`)는 `category`(단수 문자열)만 읽어 UI에 빈 값이 들어가던 잠재 버그를 교정.
>     하위 분류는 `category: "parent/sub"` 슬래시 표기로 표현(예: `linux/proxmox`).
>   - 섹션별 "이 섹션이 다른 이유" 주석 보강.
> - **2026-04-07**: 공통 템플릿 + 4개 섹션(articles/notes/deep-dive/translations) 정립.

---

## 설계 원칙 {#design-rules}

이 컨벤션은 다음 네 가지 규칙 위에 서 있다. 필드를 추가·수정할 때 항상 이 원칙으로 회귀한다.

1. **한 필드 = 한 축(orthogonal axes).** 하나의 필드가 둘 이상의 독립 정보를 뭉뚱그리지 않는다.
   서로 직교하는 정보는 별도 필드로 쪼갠다. (§5 `ai_assistance`가 이 원칙의 대표 사례)
2. **`author`는 항상 사람.** 도구·자동화는 author가 될 수 없다. AI 관여는 별도 블록(`ai_assistance`)으로 표기한다.
   ([Google 권고](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content):
   AI에게 author byline을 부여하는 것은 제작 과정을 알리는 좋은 방법이 아니다.)
3. **폴더가 섹션을 결정한다.** `articles/ notes/ deep-dive/ translations/ decisions/` 폴더 구조가 1차 분류이며,
   `section` 필드는 그 폴더명과 반드시 일치시킨다(로더가 frontmatter `section`을 읽으므로 불일치 시 분류가 깨진다).
4. **null은 `~`로 명시한다.** 값이 없는 선택 필드는 키를 생략하거나 YAML null(`~`)로 둔다. 빈 문자열(`""`)과 구분한다.

---

## 0. 공통 frontmatter 템플릿 {#common-frontmatter-template}

모든 섹션이 공유하는 골격. 섹션별 템플릿(§1~§4)은 이 위에 전용 필드를 얹는다.

```yaml
---
# ── 필수 공통 필드 ────────────────────────────────────
title: ""
date: 2026-06-26          # 최초 작성일 (정렬·표시 기준)
lastmod: 2026-06-26       # 최종 수정일
author: "Davi"            # 항상 사람. 도구는 ai_assistance(§5)로 표기
description: ""           # 150~160자 권장 (검색 스니펫·OG description)
slug: ""                  # kebab-case, URL 식별자

# ── 분류 ─────────────────────────────────────────────
section: ""               # articles | notes | deep-dive | translations | decisions  (폴더명과 일치)
category: ""              # 소문자·하이픈. 하위 분류는 "parent/sub" (예: linux/proxmox)
tags: []                  # 소문자·하이픈 배열

# ── 정렬 ─────────────────────────────────────────────
order: 9999               # 섹션 내 수동 순서 (낮을수록 위)
series: ~                 # 시리즈명 (없으면 ~)
series_order: ~           # 시리즈 내 순번으로 1부터. (order는 카테고리) 시리즈 간 순위를 넣지 않는다. (시리즈 끼리는 sortToc가 date에서 파생하여 빌드)

# ── 상태 ─────────────────────────────────────────────
status: "active"          # active | wip | archived
draft: false              # true면 빌드·사이드바·검색에서 제외
search: true              # false면 검색 인덱스에서만 제외

# ── 선택 공통 ─────────────────────────────────────────
toc: true
difficulty: ~             # beginner | intermediate | advanced
version: ~                # 대상 기술 버전 (notes에서 주로 사용)

# ── AI 활용 표기 (선택, §5 참조) ───────────────────────
ai_assistance: ~          # AI 미사용 시 ~ 또는 생략
---
```

### 0.1 `series` 와 `category`

**시리즈와 카테고리는 별도의 축이다.** 한 카테고리에 복수 시리즈 및 낱개 문서가 공존한다. 시리즈 간 순서는 한 시리즈에 속한 문서들 중 `date` 필드의 최소값으로 오름차순 파생하며, 동일 시작일을 가진 시리즈끼리는 이름 오름차순으로 순서를 정한다. 낱개 문서는 최하단. 해당 알고리즘은 `docSort.ts`에서 구현한다.

---

## 1. `articles/` 블로그 포스트 {#sec-articles}

**이 섹션이 다른 이유:** 완성형(完成形) 글이다. 날짜 역순으로 노출되는 발행물이며, 소셜 공유를 전제로 `cover`(OG 이미지)를 갖는다. 시리즈·난이도·버전은 보통 불필요하다. 독자는 일반 방문자다.

- 정렬: `date` 역순 (config: `sortMenusByFrontmatterDate` + `sortMenusOrderByDescending`)
- `cover.image`는 `docs/public/og/[slug].png`를 가리킨다 → 생성 규칙은 `image-rules.md` §A 참조

```yaml
---
title: "Spring Boot 3 마이그레이션 핵심 체크리스트"
date: 2026-04-02
lastmod: 2026-04-02
author: "Davi"
description: "Spring Boot 2 → 3 전환 시 Jakarta EE 패키지 변경, SecurityConfig 재작성, AOT 이슈 등 실무 이슈 11가지를 정리합니다."
slug: "spring-boot-3-migration-checklist"

section: "articles"
category: "backend"
tags: [spring-boot, java, migration, jakarta-ee]

cover:
  image: "/og/spring-boot-3-og.png"   # public/og/ 기준 절대 경로
  alt: "Spring Boot 3 마이그레이션 체크리스트"

status: "active"
toc: true
draft: false
---
```

---

## 2. `notes/` 기술 노트 {#sec-notes}

**이 섹션이 다른 이유:** 레퍼런스성 학습 기록이다. 노트는 거의 항상 **특정 기술 버전에 종속**되므로 `version`이 핵심 필드다("PostgreSQL 16 기준" 같은). `status`로 작성 진행 상태(active/wip/archived)를 관리하고, **중주제/소주제 폴더 계층**으로 사이드바가 구성된다(config: `collapseDepth: 2`).

- 정렬: 파일명 숫자 접두사(`01-`, `02-`) (config: `sortMenusOrderNumericallyFromLink`)
- 폴더 계층 예: `notes/linux/proxmox/...` → `category: "linux/proxmox"`
- 버전이 올라 내용이 낡으면 `status: archived` + 신규 노트 작성을 권장(원문 파괴적 수정 지양)

```yaml
---
title: "PostgreSQL EXPLAIN ANALYZE 읽는 법"
date: 2026-03-15
lastmod: 2026-04-02
author: "Davi"
description: "Seq Scan / Index Scan / Hash Join / Nested Loop를 구분하고 cost와 actual time을 해석하는 방법"
slug: "postgresql-explain-analyze"

section: "notes"
category: "database"
tags: [postgresql, performance, query-optimization]

version: "PostgreSQL 16"      # ★ notes 핵심: 대상 기술 버전
status: "active"              # active | wip | archived
difficulty: "intermediate"

toc: true
draft: false
---
```

---

## 3. `deep-dive/` 심층 분석 (개별 프로젝트 문서) {#sec-deep-dive}

**이 섹션이 다른 이유:** 단발 노트를 넘어 **흐름(flow)을 갖는 프로젝트 단위 심층 문서**다. 단순 개발노트와의 분기점이 바로 여기다 — 한 프로젝트를 여러 챕터로 분해해 추적하므로, 프로젝트 식별·문서 유형·산출물 번호(ARD/RFC/Milestone)·시리즈 순서를 frontmatter에서 관리한다.

- 정렬: `order` frontmatter 우선 (config: `sortMenusByFrontmatterOrder`)
- `project`: 프로젝트 슬러그. 같은 프로젝트의 `index.md`와 연결되는 키
- `doc_type`: `learning-guide` | `technical-deep-dive` | `milestone`  (결정 기록 타입은 §5로 이관)
- `series` + `series_order`: 같은 시리즈 문서들을 챕터 순서로 묶는다
- `related_decisions`: 이 문서가 다루는 결정 기록 ID 배열 (예: `RDSM-ADR-0001`). 해당 없으면 생략
- `milestone`: 연관 마일스톤. 없으면 `~`

> **notes → deep-dive 이관 기준:** 그 문서가 (a) 단일 주제 레퍼런스를 넘어 *서사·단계*를 갖고,
> (b) 특정 프로젝트에 귀속되며, (c) 시리즈로 이어질 가능성이 있으면 deep-dive로 옮긴다.
> 이관 시 `version`(notes 전용)을 떼고, `project`/`doc_type`/`series` 계열 필드를 부여한다.

```yaml
---
title: "REST Domain State Manager — 역공학 학습 가이드"
date: 2026-04-02
lastmod: 2026-04-02
author: "Davi"
description: "DSM ADR-0000~ADR-0003을 역방향으로 분해해 V8, Proxy, Shadow State, CSRF, LCS Diff 등 핵심 개념을 5단계로 학습하는 가이드"
slug: "dsm-reverse-engineering-guide"

section: "deep-dive"
category: "deep-dive/vibe-coding"
tags: [javascript, proxy, v8, shadow-state, csrf, web-worker, lcs-diff, dsm]

# ── deep-dive 전용 필드 ──
project: "rest-domain-state-manager"   # 프로젝트 슬러그 (index.md와 연결)
doc_type: "learning-guide"             # learning-guide | technical-deep-dive | adr | cdr | chr "CHR(차터)는 결정 기록 아님 ─ 프레이밍/지도 문서"
related_decisions: [RDSM-ADR-0000, RDSM-ADR-0001, RDSM-ADR-0002, CORE-ADR-0001]
milestone: ~                           # 해당 없으면 ~
series: "DSM Deep Dive"
series_order: 1                        # 시리즈 내 챕터 순서

# ── 식별 (결정 기록 전용) ──
id: "RDSM-ADR-0000"     # `<SCOPE>-<TYPE>-<NNNN>` 전역 유일 ID (체계: convention-manual §3)

# ── 결정 메타 ──
decision_status: "accepted"
deciders: ["Davi"]
period:
  start: 2026-03-23
  end: ~
supersedes: ~
superseded_by: ~
related_decisions: []

status: "active"
difficulty: "advanced"
order: 1
toc: true
draft: false

# 학습 대화를 초안으로 받았다면 AI 활용 표기 (§5)
ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "verified"
---
```

결정 기록 식별자·넘버링·파일명·디렉터리 규칙은 convention-manual.md §3(CORE-ADR-0001) 참조.

---

## 4. `translations/` 번역 아티클 {#sec-translations}

**이 섹션이 다른 이유:** 콘텐츠 본문이 **타인의 저작물**이다. 따라서 출처(provenance)와 저작권 준수가 핵심 축이다 — 원문 식별, 원저자/번역자 구분, 원문 라이선스 표기, 그리고 SEO 중복 회피를 위한 `canonical` 지정이 필수다.

- `author`는 **원저자**, `translator`가 Davi다 (§설계원칙 2와 충돌하지 않음: 원문의 author는 사람인 원저자)
- `canonical`은 미지정(자기 참조 기본), 원문 연결은 original_url·본문 attribution 담당
- `license` / `license_url`은 원문 라이선스를 그대로 명시한다 (CC BY 등). 라이선스가 번역·재배포를 허용하는지 반드시 확인 후 게시
- 번역에 AI를 썼다면 §5에서 `role: [translation]`으로 표기

```yaml
---
title: "Raft 합의 알고리즘 이해하기 (번역)"
original_title: "In Search of an Understandable Consensus Algorithm"
date: 2026-04-02
lastmod: 2026-04-02

author: "Diego Ongaro, John Ousterhout"   # 원저자
translator: "Davi"                        # 번역자

original_url: "https://raft.github.io/raft.pdf"
original_published: 2025-12-05
original_lang: "en"
translation_fidelity: "restructured"           # faithful | restructed
translation_lang: "ko"

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "Paxos보다 이해하기 쉬운 합의 알고리즘 Raft의 리더 선출, 로그 복제, 안전성 보장 메커니즘 번역"
slug: "raft-consensus-algorithm-ko"

section: "translations"
category: "translation"
tags: [distributed-systems, consensus, raft, translation]

status: "active"
toc: true
comments: false
draft: false
---
```

---

## 5. `decisions/` 결정 기록 {#sec-decisions}

**이 섹션이 다른 이유:** 문서가 곧 제도다. 채택된 기록의 본문은 원칙적으로 불변이고(수정 대신 대체),
`id`로 영구 참조되며, frontmatter 규칙 위반이 빌드 실패로 이어지는 유일한 섹션이다(집행: docLint, DOCS-ADR-0003).

- 디렉터리는 `decisions/<scope>/`, scope는 소문자 `core | rdsm | docs`. 폴더가 섹션과 스코프를 함께
  결정한다(설계 원칙 3의 연장). 별도 `scope` 필드는 두지 않는다. 경로와 `id`에 이미 있는 사실의
  세 번째 사본이기 때문이다(DOCS-ADR-0002 §2.3).
- `id`는 `<SCOPE>-<TYPE>-<NNNN>` 대문자 표기이며 **결정 ID의 단일 진실 원천**이다.
  파일명과 `slug`는 소문자 id로 시작하는 파생 표기다(§2.2).
- `doc_type`은 `adr | cdr | chr` 중 **명시 의무**다. decisions에는 섹션 기본 doc_type이 없다(§2.4).
- `decision_status`는 doc_type별 어휘를 따른다. adr 어휘는 Nygard 표준이다
  ([Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)).

| doc_type | decision_status 어휘                                 |
| -------- | ---------------------------------------------------- |
| adr      | proposed, accepted, rejected, deprecated, superseded |
| cdr      | adr 어휘 + in-progress                               |
| chr      | proposed, active, completed, withdrawn, superseded   |

- 참조 필드의 정본은 `related_decisions`다(§2.6). 대체 관계는 `supersedes` / `superseded_by`로 양방향 기록한다.
- `review: unreviewed`인 동안 `draft: true`를 유지한다(§6 게이트 규칙). draft 해제는 곧 아래 검사의 통과 신청이다.
- 발행(`draft: false`) 문서에 docLint가 error로 집행하는 항목: doc_type 누락, id 누락,
  id와 경로·파일명의 불일치, decision_status 어휘 이탈(DOCS-ADR-0003 §2.6).
- 문서를 이동하거나 개명하면 구 URL을 리다이렉트 레지스트리에 등록한다(§2.8).

```yaml
---
title: "decisions 섹션 신설과 결정 식별 체계 정비"
date: 2026-07-06
lastmod: 2026-07-06
author: "Davi"
description: "전용 decisions 섹션과 URL 체계를 신설하고 결정 식별 체계를 정비한다"
slug: "docs-adr-0002-decisions-section-governance"   # 소문자 id로 시작하는 파생 표기

section: "decisions"
category: "decisions/docs"
tags: [vitepress, decision-records, ssot]

# ── decisions 전용 필드 ──
id: DOCS-ADR-0002            # ★ 결정 ID의 SSOT. <SCOPE>-<TYPE>-<NNNN>
doc_type: "adr"              # adr | cdr | chr (명시 의무, 누락 시 빌드 실패)
decision_status: "proposed"  # doc_type별 어휘는 위 표 참조
deciders: ["Davi"]
period:
  start: 2026-07-06
  end: ~
related_decisions: [CORE-ADR-0001, DOCS-ADR-0003]
supersedes: ~
superseded_by: ~

status: "wip"   #active/wip/archived인데, 각각 언제 쓰는 거지?
toc: true
draft: true                  # review: unreviewed 인 동안 유지
search: true

ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-fable-5"]
  review: "unreviewed"
```

---

## 6. `ai_assistance` AI 활용 표기 {#sec-ai-assistance}

### 6.1 필요성 {#ai-assistance-reason}

학습노트·심층분석은 독자(채용 담당자 포함)에게 "이 글을 **사람이 이해하고 쓴 것**인가, AI가 뱉은 것인가?"라는 자연스러운 의문을 부른다. [Google](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)은 "이거 어떻게 만들었지?"가 떠오를 콘텐츠에 AI 공개를 권장하고, [EU AI Act Article 50(4)](https://artificialintelligenceact.eu/article/50/)는 공익적 텍스트의 AI 공개를 의무화하되 **편집 책임을 동반한 인간 검토**를 면제 요건으로 둔다. 이 블록은 그 두 요구를 frontmatter 수준에서 충족하는 장치다.

상세 운영 수칙·법적 맥락·공개 문구 템플릿은 **`ai-usage-policy.md`** 참조.

### 6.2 구조 {#ai-assistance-structure}

단일 `level` 필드는 금지한다. AI 관여는 서로 직교하는 네 축으로 분해한다.

```yaml
ai_assistance:
  # [축 1] 본문(prose)을 처음 생성한 주체 — 가장 중요한 단일 enum
  authorship: "human"        # human | ai-drafted | co-authored | none

  # [축 2] AI가 실제 수행한 역할 — 복수 가능(list)
  role: [drafting, research] # drafting | editing | research | review
                             #   | metadata | translation | diagramming

  # [축 3] 사용 모델 — 복수·시점 대응(list)
  model: ["claude-opus-4.8"]

  # [축 4] 인간 검증 수준 — E-E-A-T 핵심
  review: "verified"         # verified | reviewing | unreviewed

  # [선택] 모델 시점 — 모델명이 시점에 따라 달라지므로 추적용
  date: ~                    # 예: 2026-06-26 (생략 시 문서 date 따름)
```

**축별 값 정의:**

| 축           | 값            | 의미                                             |
| ------------ | ------------- | ------------------------------------------------ |
| `authorship` | `human`       | 본문 전부 직접 작성. AI는 메타데이터·리뷰만      |
|              | `ai-drafted`  | 학습 후 AI가 초안 생성 → 직접 편집·재구성·보강   |
|              | `co-authored` | 섹션별로 인간·AI 본문이 혼재                     |
|              | `none`        | AI 전혀 미사용 (이 경우 블록 자체를 생략해도 됨) |
| `role`       | `drafting`    | 본문 초안 생성                                   |
|              | `editing`     | 문장 다듬기·교정                                 |
|              | `research`    | 자료 조사·개념 정리                              |
|              | `review`      | 사실 정정·누락 지적                              |
|              | `metadata`    | description·tags 등 메타데이터만                 |
|              | `translation` | 번역 보조                                        |
|              | `diagramming` | 다이어그램 생성 보조 (`image-rules.md` §D 참조)  |
| `review`     | `verified`    | 전 내용을 직접 사실검증·재작성. **게시 허용**    |
|              | `reviewing`   | 검증 작업 진행 중. **조건부 발행**               |
|              | `unreviewed`  | 미검증. **게시 차단**                            |

### 6.3 워크플로우 → 값 매핑 {#workflow-mapping}

실제 작업 흐름이 이 골격에 어떻게 떨어지는지:

```yaml
# (A) AI로 학습 → AI 초안 → 직접 편집·보강
ai_assistance: { authorship: ai-drafted, role: [drafting, research], model: ["claude-opus-4.8"], review: verified }

# (B) 직접 작성 → AI에게 보여주며 정정·추가
ai_assistance: { authorship: human, role: [editing, review], model: ["claude-opus-4.8"], review: verified }

# (C) 직접 작성 → AI는 description·tags만
ai_assistance: { authorship: human, role: [metadata], model: ["claude-opus-4.8"], review: verified }
```

### 6.4 운영 규칙 {#ai-assistance-rules}

- **`author`는 절대 AI로 바꾸지 않는다.** `ai-drafted`여도 검수·게시 책임자는 사람이므로 author는 사람이다.
- **본문 미관여 시(C) 오해 방지:** `role: [metadata]`로 본문에 AI가 닿지 않았음을 명시한다. 모호하면 블록을 생략한다.
- **`review: unreviewed` 문서는 `draft: true`로 묶고 게시하지 않는다.**
- **확장 슬롯(축 직교 보장):** 필요 시 다음 필드를 무손상으로 추가할 수 있다.
  - `prompt_ref:` — 학습에 쓴 대화 영구링크 (재현성·투명성)
  - `sections:` — 섹션별 attribution이 필요해질 때 (co-authored 세분화)
  - `c2pa: ~` — 암호학적 출처 서명까지 확장할 때의 매니페스트 참조

---

## 부록 A. 필드 레퍼런스 (요약) {#sec-a}

| 필드                                                   | 타입               | 섹션                | 비고                                        |
| ------------------------------------------------------ | ------------------ | ------------------- | ------------------------------------------- |
| `title`                                                | string             | 전체                |                                             |
| `date` / `lastmod`                                     | date               | 전체                | 작성일 / 수정일                             |
| `author`                                               | string             | 전체                | 항상 사람                                   |
| `description`                                          | string             | 전체                | 150~160자                                   |
| `slug`                                                 | string             | 전체                | kebab-case                                  |
| `section`                                              | enum               | 전체                | 폴더명과 일치                               |
| `category`                                             | string             | 전체                | 단수. `parent/sub` 가능                     |
| `tags`                                                 | string[]           | 전체                |                                             |
| `order`                                                | number             | 전체                | deep-dive 정렬 1순위                        |
| `series` / `series_order`                              | string / number    | deep-dive 주로      |                                             |
| `status`                                               | enum               | 전체                | active/wip/archived                         |
| `draft` / `search`                                     | bool               | 전체                |                                             |
| `version`                                              | string             | **notes**           | 대상 기술 버전                              |
| `cover`                                                | object             | **articles**        | OG 이미지                                   |
| `project` / `doc_type` / `milestone`                   | —                  | **deep-dive**       |                                             |
| `original_*` / `translator` / `canonical` / `license*` | —                  | **translations**    | provenance                                  |
| `ai_assistance`                                        | object             | 전체(선택)          | §5                                          |
| `id`                                                   | string             | **decisions**       | `id`는 결정 ID의 SSOT, `<SCOPE>-ADR-<NNNN>` |
| `scope`                                                | string             | **decisions**       | 이니셜(DOCS, CORE, RDSM)                    |
| `decision_status`                                      | string             | **decisions**       | {#sec-decisions} 참조                       |
| `decider`                                              | string[]           | **decisions**       | 결정기록 참여자 배열                        |
| `period`                                               | date               | **decisions**       | 단일 결정일                                 |
| `issue` / `issue_url`                                  | string             | **decisions**(선택) | 결정이 참조하는 티켓/이슈 ID 및 URL         |
| `supersedes` / `superseded_by`                         | string \| string[] | **decisions**(선택) | 결정 간 상호 대체 관계를 나타내는 참조      |
| `related_decisions`                                    | string[]           | decisions·deep-dive | 결정 참조 정본                              |

## 부록 B. 로더 연동 주의 {#sec-b}

frontmatter 필드는 로더(`docs/.vitepress/data/content.data.ts`)가 `DocItem`에 매핑하기 전까지는 단순 YAML 텍스트다. 따라서:

- **표시·정렬에 쓰려는 필드는 반드시 `content.data.ts`의 인터페이스·`transform`에 추가**해야 UI에 반영된다.
- `ai_assistance`는 두 가지로 운용 가능하다.
  1. **문서화 메타로만 유지** — 로더 미수정. UI 비노출, 빌드 안전. 기록·투명성 목적만 달성.
  2. **UI 뱃지로 노출** — 로더·`CategoryIndex.vue`에 필드를 태워 "AI-assisted" 표식을 노출. 투명성을 적극 노출.
- `category`는 **단수**로 읽힌다(`p.frontmatter.category`). `categories`(복수)는 무시되므로 사용하지 않는다.

---

## 참고 출처 {#references}

- Google Search Central — [Generative AI 콘텐츠 가이드](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- Google Search Central Blog — [AI-generated content 가이던스(2023-02, 이후 업데이트)](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content)
- EU AI Act — [Article 50 Transparency Obligations](https://artificialintelligenceact.eu/article/50/)
- IPTC — [Digital Source Type NewsCodes](https://cv.iptc.org/newscodes/digitalsourcetype)
- C2PA — [Specifications](https://spec.c2pa.org/)
- VitePress — [Frontmatter](https://vitepress.dev/guide/frontmatter)
