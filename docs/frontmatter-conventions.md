# Frontmatter Convention (2026-06-26)

> ## 개정 이력
>
> - **2026-06-26**
>   - `ai_assistance` 블록 신설 → **§5** (authorship / role / model / review 4축 구조)
>   - `category` **단수 표기로 통일**. 기존 일부 예시가 `categories: [..]`(복수 배열)였으나,
>     로더(`content.data.ts`)는 `category`(단수 문자열)만 읽어 UI에 빈 값이 들어가던 잠재 버그를 교정.
>     하위 분류는 `category: "parent/sub"` 슬래시 표기로 표현(예: `linux/proxmox`).
>   - 섹션별 "이 섹션이 다른 이유" 주석 보강.
> - **2026-04-07**: 공통 템플릿 + 4개 섹션(articles/notes/deep-dive/translations) 정립.

---

## 설계 원칙

이 컨벤션은 다음 네 가지 규칙 위에 서 있다. 필드를 추가·수정할 때 항상 이 원칙으로 회귀한다.

1. **한 필드 = 한 축(orthogonal axes).** 하나의 필드가 둘 이상의 독립 정보를 뭉뚱그리지 않는다.
   서로 직교하는 정보는 별도 필드로 쪼갠다. (§5 `ai_assistance`가 이 원칙의 대표 사례)
2. **`author`는 항상 사람.** 도구·자동화는 author가 될 수 없다. AI 관여는 별도 블록(`ai_assistance`)으로 표기한다.
   ([Google 권고](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content):
   AI에게 author byline을 부여하는 것은 제작 과정을 알리는 좋은 방법이 아니다.)
3. **폴더가 섹션을 결정한다.** `articles/ notes/ deep-dive/ translations/` 폴더 구조가 1차 분류이며,
   `section` 필드는 그 폴더명과 반드시 일치시킨다(로더가 frontmatter `section`을 읽으므로 불일치 시 분류가 깨진다).
4. **null은 `~`로 명시한다.** 값이 없는 선택 필드는 키를 생략하거나 YAML null(`~`)로 둔다. 빈 문자열(`""`)과 구분한다.

---

## 0. 공통 frontmatter 템플릿

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
series_order: ~           # 시리즈 내 순서 (없으면 ~)

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

---

## 1. `articles/` — 블로그 포스트

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

## 2. `notes/` — 기술 노트

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

## 3. `deep-dive/` — 심층 분석 (개별 프로젝트 문서)

**이 섹션이 다른 이유:** 단발 노트를 넘어 **흐름(flow)을 갖는 프로젝트 단위 심층 문서**다. 단순 개발노트와의 분기점이 바로 여기다 — 한 프로젝트를 여러 챕터로 분해해 추적하므로, 프로젝트 식별·문서 유형·산출물 번호(ARD/RFC/Milestone)·시리즈 순서를 frontmatter에서 관리한다.

- 정렬: `order` frontmatter 우선 (config: `sortMenusByFrontmatterOrder`)
- `project`: 프로젝트 슬러그. 같은 프로젝트의 `index.md`와 연결되는 키
- `doc_type`: `learning-guide` | `technical-deep-dive` | `ard` | `rfc` | `milestone`
- `series` + `series_order`: 같은 시리즈 문서들을 챕터 순서로 묶는다
- `related_ards`: 이 문서가 다루는 설계 결정 기록(ARD) 번호 배열. 해당 없으면 생략
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
description: "DSM ARD-0000~ARD-0003을 역방향으로 분해해 V8, Proxy, Shadow State, CSRF, LCS Diff 등 핵심 개념을 5단계로 학습하는 가이드"
slug: "dsm-reverse-engineering-guide"

section: "deep-dive"
category: "deep-dive/vibe-coding"
tags: [javascript, proxy, v8, shadow-state, csrf, web-worker, lcs-diff, dsm]

# ── deep-dive 전용 필드 ──
project: "rest-domain-state-manager"   # 프로젝트 슬러그 (index.md와 연결)
doc_type: "learning-guide"             # learning-guide | technical-deep-dive | ard | cdr | chr | rfc "CHR(차터)는 결정 기록 아님 ─ 프레이밍/지도 문서"
related_ards: [ARD-0000, ARD-0001, ARD-0002, ARD-0003]
milestone: ~                           # 해당 없으면 ~
series: "DSM Deep Dive"
series_order: 1                        # 시리즈 내 챕터 순서

# ── 식별 (결정 기록 전용) ──
id: "RDSM-ADR-0000"     # `<SCOPE>-<TYPE>-<NNNN>` 전역 유일 ID (체계: convention-manual §3)
scope: "RDSM"           # SCOPE 레지스트리 (CORE | RDSM | DOCS | ...)

# ── 결정 메타 ──
decision_status: "accepted"
deciders: ["Davi"]
period: 2026-03-23      # ★ 단일 결정일(스칼라). {start,end} 아님
supersedes: ~
superseded_by: ~
related_adrs: []

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

## 4. `translations/` — 번역 아티클

**이 섹션이 다른 이유:** 콘텐츠 본문이 **타인의 저작물**이다. 따라서 출처(provenance)와 저작권 준수가 핵심 축이다 — 원문 식별, 원저자/번역자 구분, 원문 라이선스 표기, 그리고 SEO 중복 회피를 위한 `canonical` 지정이 필수다.

- `author`는 **원저자**, `translator`가 Davi다 (§설계원칙 2와 충돌하지 않음: 원문의 author는 사람인 원저자)
- `canonical`은 **원문 URL**로 지정한다 → 검색엔진이 번역본을 원문의 사본으로 인식해 중복 페널티를 피한다
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
original_lang: "en"
translation_lang: "ko"
canonical: "https://raft.github.io/raft.pdf"   # ★ 원문을 canonical로 지정 (중복 회피)

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

## 5. `ai_assistance` — AI 활용 표기

### 5.1 왜 필요한가

학습노트·심층분석은 독자(채용 담당자 포함)에게 "이 글을 **사람이 이해하고 쓴 것**인가, AI가 뱉은 것인가?"라는 자연스러운 의문을 부른다. [Google](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)은 "이거 어떻게 만들었지?"가 떠오를 콘텐츠에 AI 공개를 권장하고, [EU AI Act Article 50(4)](https://artificialintelligenceact.eu/article/50/)는 공익적 텍스트의 AI 공개를 의무화하되 **편집 책임을 동반한 인간 검토**를 면제 요건으로 둔다. 이 블록은 그 두 요구를 frontmatter 수준에서 충족하는 장치다.

상세 운영 수칙·법적 맥락·공개 문구 템플릿은 **`ai-usage-policy.md`** 참조.

### 5.2 구조 — 4축(+1) 분리

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
  review: "verified"         # verified | reviewed | unreviewed | pending

  # [선택] 모델 시점 — 모델명이 시점에 따라 달라지므로 추적용
  date: ~                    # 예: 2026-06-26 (생략 시 문서 date 따름)
```

**축별 값 정의:**

| 축           | 값            | 의미                                               |
| ------------ | ------------- | -------------------------------------------------- |
| `authorship` | `human`       | 본문 전부 직접 작성. AI는 메타데이터·리뷰만        |
|              | `ai-drafted`  | 학습 후 AI가 초안 생성 → 직접 편집·재구성·보강     |
|              | `co-authored` | 섹션별로 인간·AI 본문이 혼재                       |
|              | `none`        | AI 전혀 미사용 (이 경우 블록 자체를 생략해도 됨)   |
| `role`       | `drafting`    | 본문 초안 생성                                     |
|              | `editing`     | 문장 다듬기·교정                                   |
|              | `research`    | 자료 조사·개념 정리                                |
|              | `review`      | 사실 정정·누락 지적                                |
|              | `metadata`    | description·tags 등 메타데이터만                   |
|              | `translation` | 번역 보조                                          |
|              | `diagramming` | 다이어그램 생성 보조 (`image-rules.md` §D 참조)    |
| `review`     | `verified`    | 전 내용을 직접 사실검증·재작성. **게시 기본 요건** |
|              | `reviewed`    | 통독·수정했으나 일부 인용 잔존                     |
|              | `unreviewed`  | 미검증. **게시 비권장**                            |

### 5.3 워크플로우 → 값 매핑

실제 작업 흐름이 이 골격에 어떻게 떨어지는지:

```yaml
# (A) AI로 학습 → AI 초안 → 직접 편집·보강
ai_assistance: { authorship: ai-drafted, role: [drafting, research], model: ["claude-opus-4.8"], review: verified }

# (B) 직접 작성 → AI에게 보여주며 정정·추가
ai_assistance: { authorship: human, role: [editing, review], model: ["claude-opus-4.8"], review: verified }

# (C) 직접 작성 → AI는 description·tags만
ai_assistance: { authorship: human, role: [metadata], model: ["claude-opus-4.8"], review: verified }
```

### 5.4 운영 규칙

- **`author`는 절대 AI로 바꾸지 않는다.** `ai-drafted`여도 검수·게시 책임자는 사람이므로 author는 사람이다.
- **본문 미관여 시(C) 오해 방지:** `role: [metadata]`로 본문에 AI가 닿지 않았음을 명시한다. 모호하면 블록을 생략한다.
- **`review: unreviewed` 문서는 `draft: true`로 묶고 게시하지 않는다.**
- **확장 슬롯(축 직교 보장):** 필요 시 다음 필드를 무손상으로 추가할 수 있다.
  - `prompt_ref:` — 학습에 쓴 대화 영구링크 (재현성·투명성)
  - `sections:` — 섹션별 attribution이 필요해질 때 (co-authored 세분화)
  - `c2pa: ~` — 암호학적 출처 서명까지 확장할 때의 매니페스트 참조

---

## 부록 A. 필드 레퍼런스 (요약)

| 필드                                                   | 타입               | 섹션                | 비고                                            |
| ------------------------------------------------------ | ------------------ | ------------------- | ----------------------------------------------- |
| `title`                                                | string             | 전체                |                                                 |
| `date` / `lastmod`                                     | date               | 전체                | 작성일 / 수정일                                 |
| `author`                                               | string             | 전체                | 항상 사람                                       |
| `description`                                          | string             | 전체                | 150~160자                                       |
| `slug`                                                 | string             | 전체                | kebab-case                                      |
| `section`                                              | enum               | 전체                | 폴더명과 일치                                   |
| `category`                                             | string             | 전체                | 단수. `parent/sub` 가능                         |
| `tags`                                                 | string[]           | 전체                |                                                 |
| `order`                                                | number             | 전체                | deep-dive 정렬 1순위                            |
| `series` / `series_order`                              | string / number    | deep-dive 주로      |                                                 |
| `status`                                               | enum               | 전체                | active/wip/archived                             |
| `draft` / `search`                                     | bool               | 전체                |                                                 |
| `version`                                              | string             | **notes**           | 대상 기술 버전                                  |
| `cover`                                                | object             | **articles**        | OG 이미지                                       |
| `project` / `doc_type` / `related_adrs` / `milestone`  | —                  | **deep-dive**       |                                                 |
| `original_*` / `translator` / `canonical` / `license*` | —                  | **translations**    | provenance                                      |
| `ai_assistance`                                        | object             | 전체(선택)          | §5                                              |
| `id`                                                   | string             | **decisions**       | `<SCOPE>-ADR-<NNNN>`                            |
| `scope`                                                | string             | **decisions**       | 이니셜(DOCS, CORE, RDSM)                        |
| `decision_status`                                      | string             | **decisions**       | proposed/accepted/rejectd/deprecated/superseded |
| `decider`                                              | string[]           | **decisions**       | 결정기록 참여자 배열                            |
| `period`                                               | date               | **decisions**       | 단일 결정일                                     |
| `issue` / `issue_url`                                  | string             | **decisions**(선택) | ???                                             |
| `supersedes` / `superseded_by`                         | string \| string[] | **decisions**(선택) | ???                                             |

## 부록 B. 로더 연동 주의

frontmatter 필드는 로더(`docs/.vitepress/data/content.data.ts`)가 `DocItem`에 매핑하기 전까지는 단순 YAML 텍스트다. 따라서:

- **표시·정렬에 쓰려는 필드는 반드시 `content.data.ts`의 인터페이스·`transform`에 추가**해야 UI에 반영된다.
- `ai_assistance`는 두 가지로 운용 가능하다.
  1. **문서화 메타로만 유지** — 로더 미수정. UI 비노출, 빌드 안전. 기록·투명성 목적만 달성.
  2. **UI 뱃지로 노출** — 로더·`CategoryIndex.vue`에 필드를 태워 "AI-assisted" 표식을 노출. 투명성을 적극 노출.
- `category`는 **단수**로 읽힌다(`p.frontmatter.category`). `categories`(복수)는 무시되므로 사용하지 않는다.

---

## 참고 출처

- Google Search Central — [Generative AI 콘텐츠 가이드](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- Google Search Central Blog — [AI-generated content 가이던스(2023-02, 이후 업데이트)](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content)
- EU AI Act — [Article 50 Transparency Obligations](https://artificialintelligenceact.eu/article/50/)
- IPTC — [Digital Source Type NewsCodes](https://cv.iptc.org/newscodes/digitalsourcetype)
- C2PA — [Specifications](https://spec.c2pa.org/)
- VitePress — [Frontmatter](https://vitepress.dev/guide/frontmatter)
