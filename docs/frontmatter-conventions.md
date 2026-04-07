# Frontmatter Convention (2026-04-07)

## 1. `articles/` - 블로그 포스트

```yaml
---
title: "Spring Boot 3 마이그레이션 핵심 체크리스트"
date: 2026-04-02
lastmod: 2026-04-02
author: "Davi"
description: "Spring Boot 2 → 3 전환 시 Jakarta EE 패키지 변경, SecurityConfig 재작성, AOT 이슈 등 실무 이슈 11가지를 정리합니다."
slug: "spring-boot-3-migration-checklist"
tags: [spring-boot, java, migration, jakarta-ee]
categories: [backend]

cover:
  image: "/og/spring-boot-3-og.png"
  alt: "Spring Boot 3 마이그레이션 체크리스트"

toc: true
draft: false
---
```

## 2. `notes/` - 기술 노트

```yaml
---
title: "PostgreSQL EXPLAIN ANALYZE 읽는 법"
date: 2026-03-15
lastmod: 2026-04-02
author: "Davi"
description: "Seq Scan / Index Scan / Hash Join / Nested Loop를 구분하고 cost와 actual time을 해석하는 방법"
slug: "postgresql-explain-analyze"
tags: [postgresql, performance, query-optimization]
categories: [database]

version: "PostgreSQL 16"      # 해당 노트가 대상으로 하는 기술 버전
status: "active"              # active | archived | wip
difficulty: "intermediate"

toc: true
draft: false
---
```

## 3. `deep-dive/` - 심층 분석 (개별 프로젝트 문서)

> ARD·RFC·Milestone 번호를 frontmatter에서 추적할 수 있도록 커스텀 필드를 추가한다.

```yaml
---
title: "REST Domain State Manager — 역공학 학습 가이드"
date: 2026-04-02
lastmod: 2026-04-02
author: "Davi"
description: "DSM ARD-0000~ARD-0003을 역방향으로 분해해 V8, Proxy, Shadow State, CSRF, LCS Diff 등 핵심 개념을 5단계로 학습하는 가이드"
slug: "dsm-reverse-engineering-guide"
tags: [javascript, proxy, v8, shadow-state, csrf, web-worker, lcs-diff, dsm]
categories: [deep-dive, vibe-coding]

# deep-dive 전용 필드
project: "rest-domain-state-manager"   # 프로젝트 슬러그 (index.md와 연결)
doc_type: "learning-guide"            # learning-guide | technical-deep-dive | ard | rfc | milestone
related_ards: [ARD-0000, ARD-0001, ARD-0002, ARD-0003]
milestone: ~                          # 해당 없으면 null (~)
series: "DSM Deep Dive"
series_order: 1                       # 시리즈 내 순서

status: "active"
difficulty: "advanced"
toc: true
draft: false
---
```

```yaml
---
title: "REST Domain State Manager — Technical Deep Dive"
date: 2026-04-02
lastmod: 2026-04-02
author: "Davi"
description: "V8 Hidden Class부터 Rollup Dual Package, BroadcastChannel Leader Election, Saga Compensating Transaction까지 DSM 아키텍처 전체를 챕터별로 심층 분석"
slug: "dsm-technical-deep-dive"
tags: [javascript, v8, proxy, weakmap, shadow-state, web-worker, rollup, broadcast-channel, saga, dsm]
categories: [deep-dive, vibe-coding]

project: "rest-domain-state-manager"
doc_type: "technical-deep-dive"
related_ards: [ARD-0000, ARD-0001, ARD-0002, ARD-0003]
series: "DSM Deep Dive"
series_order: 2

status: "active"
difficulty: "advanced"
toc: true
draft: false
---
```

## 4. `translations/` - 번역 아티클

```yaml
---
title: "Raft 합의 알고리즘 이해하기 (번역)"
original_title: "In Search of an Understandable Consensus Algorithm"
date: 2026-04-02
lastmod: 2026-04-02

author: "Diego Ongaro, John Ousterhout"
translator: "Davi"

original_url: "https://raft.github.io/raft.pdf"
original_lang: "en"
translation_lang: "ko"
canonical: "https://raft.github.io/raft.pdf"   # 원문을 canonical로 지정

license: "CC BY 4.0"
license_url: "https://creativecommons.org/licenses/by/4.0/"

description: "Paxos보다 이해하기 쉬운 합의 알고리즘 Raft의 리더 선출, 로그 복제, 안전성 보장 메커니즘 번역"
slug: "raft-consensus-algorithm-ko"
tags: [distributed-systems, consensus, raft, translation]
categories: [translation]

toc: true
comments: false
draft: false
---
```
