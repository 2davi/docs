---
title: "translations 섹션 계층화와 카테고리 필터의 섹션 일반화"
date: 2026-07-24
lastmod: 2026-07-24
author: "Davi"
description: "translations 섹션에 카테고리 폴더 계층과 URL 체계를 도입하고, notes 전용으로 하드코딩된 사이드바 카테고리 필터를 섹션 축에서 파생되도록 일반화한다. 계층 이관, frontmatter 규칙, 필터 일반화, docLint 규칙 등재까지 사이트 구조 관할을 정한다."
slug: "docs-adr-0004-translations-hierarchy-category-filter"

section: "decisions"
category: "decisions/docs"
tags: [vitepress, information-architecture, ssot, sidebar, content-loader, translations, migration, redirect]

# ── decisions 전용 필드 ──
id: DOCS-ADR-0004
doc_type: "adr"
decision_status: "accepted"
deciders: ["Davi"]
period:
  start: 2026-07-24
  end: ~
related_decisions: [DOCS-ADR-0001, DOCS-ADR-0002, DOCS-ADR-0003, CORE-ADR-0001]
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

# DOCS-ADR-0004: translations 섹션 계층화와 카테고리 필터의 섹션 일반화 {#docs-adr-0004}

| 항목 | 내용 |
| --- | --- |
| 상태 | proposed |
| 결정자 | Davi |
| 기간 | 2026-07-24 ~ |
| 관련 결정 | DOCS-ADR-0001, DOCS-ADR-0002, DOCS-ADR-0003, CORE-ADR-0001 |
| 대체 관계 | 없음 |

## 1. 맥락 (Context) {#context}

### 1.1 평면 구조의 한계 {#flat-structure-limit}

translations 섹션은 `translations/<slug>.md` 평면 구조로 출발했다(filename-conventions). 발행 11편 시점까지는 문제가 드러나지 않았으나, Kubernetes 공식 문서 번역을 계획하면서 세 가지 한계가 동시에 보였다.

첫째, 사이드바가 주제 구분 없는 단일 목록이다. `config.mts`의 translations entry가 `sortMenusByFrontmatterDate`와 `collapsed: false`로 구성되어 날짜 역순 피드로 렌더된다. 문서가 20편을 넘어가면 목록에서 관련 문서를 찾을 수 없다.

둘째, 날짜 정렬이 읽는 순서와 어긋난다. 공식 문서 번역은 의존 관계를 갖는다. API 확장 계열에서 확장 지점 개관, 컨트롤러 개념, API 규약, CustomResourceDefinition 순으로 읽어야 이해가 누적되는데, 번역 완료 순서는 그 순서와 무관하다.

셋째, `category` 필드가 분류로 기능하지 않는다. frontmatter-conventions §4 예시가 `category: "translation"`을 제시하고 실제 문서들이 이를 따르는데, 이 값은 `section: "translations"`가 이미 말하는 사실의 두 번째 사본이다. 모든 문서의 `category`가 같은 값이므로 분류 능력이 0이다. DOCS-ADR-0002 §2.3이 `scope` 필드를 기각한 것과 같은 결함이며, 그 판례가 이 섹션에 적용되지 않은 상태였다.

### 1.2 카테고리 필터의 섹션 종속 {#filter-section-coupling}

notes 섹션에는 사이드바 카테고리 그룹을 클릭하면 인덱스 페이지의 목록이 해당 카테고리로 좁혀지는 동작이 있다. 해시를 매개로 `theme/index.ts`의 사이드바 핸들러와 `CategoryIndex.vue`가 연동하는 구조다.

translations에 폴더 계층을 넣은 뒤 이 동작이 발화하지 않는 것을 확인했다. 코드를 읽어 원인을 특정했고, 섹션 이름이 클라이언트 코드에 문자열 리터럴로 박힌 지점이 다섯 곳이다.

| 위치 | 코드 | 결과 |
| --- | --- | --- |
| `theme/index.ts` `groupHash` | `querySelector('a[href*="/notes/"]')` | translations 그룹에서 앵커를 찾지 못해 null 반환. 해시 자체가 생성되지 않는다 |
| `theme/index.ts` `groupHash` | `const NOTES_BASE = 1` | 값 자체는 모든 섹션에서 1로 옳다. 이름만 특정 섹션에 묶여 있다 |
| `theme/index.ts` 클릭 핸들러 | `location.pathname === '/notes'` 불일치 시 조기 반환 | translations 인덱스 위에서 클릭이 무시된다 |
| `theme/index.ts` `goFilter` | `router.go('/notes/' + hash)` | 다른 페이지에서 클릭했을 때 어느 섹션이든 notes로 보낸다 |
| `CategoryIndex.vue` `notesPath` | `d.url.replace(/^\/notes\//, '')` | translations 문서에서 치환이 일어나지 않아 경로에 섹션명이 남는다 |
| `CategoryIndex.vue` `updateHeading` | `document.getElementById('notes')` | 대상 요소가 없어 조기 반환. 제목이 갱신되지 않는다 |

`notesPath`의 결과가 특히 조용하다. translations 문서의 URL은 `/translations/kubernetes/node-runtime/<slug>.html`이고, 치환이 실패하면 `translations/kubernetes/node-runtime/<slug>`가 그대로 남는다. 이 값을 쓰는 `topFolder`는 전 문서에 대해 `translations` 하나를 반환하므로 그룹이 하나로 뭉치고, `visible`의 필터는 해시 `kubernetes/node-runtime`과 경로 `translations/kubernetes/...`를 비교하므로 어떤 문서도 통과하지 못한다. 예외도 경고도 없이 빈 목록이 렌더된다.

### 1.3 파생 원칙의 미적용 구간 {#registry-gap}

DOCS-ADR-0002 §2.7은 섹션 목록을 `SECTIONS` 레지스트리에 모으고 로더 glob, 인덱스 제외 URL, 타입 유니언, 린터 검사값을 전부 거기서 파생시켰다. 같은 결정의 §1.2가 지목한 병증은 하나의 사실이 여러 곳에 복제되어 변경 시 동시 수술이 필요해지는 구조였다.

그 정리는 노드 쪽 소비자(`content.data.ts`, docLint)와 테마의 설정 모듈(`docMeta.config.ts`)에 적용됐고, **테마의 런타임 코드에는 적용되지 않았다.** `theme/index.ts`와 `CategoryIndex.vue`는 레지스트리를 참조하지 않고 섹션 이름을 직접 들고 있다. §1.2의 다섯 지점은 그 미적용 구간의 증상이다.

이 문서가 필터를 고치는 방식을 "translations 분기 추가"가 아니라 "섹션 축에서 파생"으로 잡는 근거가 여기 있다. 분기를 추가하면 복제본이 다섯 개에서 열 개로 늘고, 세 번째 섹션에서 같은 작업을 반복한다.

### 1.4 결정의 관할 {#jurisdiction}

이 문서는 사이트 구조 관할만 정한다. 디렉터리 계층, URL 체계, frontmatter 분류 규칙, 필터 동작의 일반화, 이관 절차가 대상이다.

번역 산출물의 내용 규약은 관할이 다르다. 원문 성격에 따른 번역 방식 분기, 저작권 고지 문안, 역자 주 규약은 문서를 어떻게 쓰는지의 문제이고 사이트 구조와 독립적인 수명을 갖는다. 별도 결정 기록(DOCS-CDR-0001 예정)으로 분리하며, translation-archive 스킬 개정은 그 문서의 집행 산출물이다.

규칙의 기계 집행은 DOCS-ADR-0003의 규칙 레지스트리 관할이다. 이 문서는 등재할 엔트리 목록만 지정한다.

## 2. 결정 (Decision) {#decision}

### 2.1 계층 구조와 URL 체계 {#hierarchy-and-urls}

translations 섹션에 카테고리 폴더 계층을 도입한다. 경로는 `translations/<주제>/<하위 주제>/<slug>.md`이며, URL은 `/translations/<주제>/<하위 주제>/<slug>`가 된다.

초기 배치는 다음과 같다.

| 폴더 | 문서 |
| --- | --- |
| `translations/kubernetes/cluster-setup/` | kubeadm 계열, static-pods |
| `translations/kubernetes/node-runtime/` | containerd-runtime-v2, k8s-node-allocatable |
| `translations/kubernetes/security/` | encrypting-data-at-rest, authorization |

폴더명은 원문의 주제를 자연어로 표현하며, 학습 계층 축(L1~L6 같은 판단 축)을 URL에 새기지 않는다. 판단 축은 재구획될 수 있고, URL에 새기면 재구획이 곧 전 문서 이사가 되기 때문이다. 학습 계층과의 대응은 별도 인덱스 문서가 링크로 표현한다.

깊이는 의미 구분에서 도출하며 숫자에 맞추지 않는다. 하위 주제 구분이 필요 없는 주제는 `translations/<주제>/<slug>.md`로 depth 1에 둔다. `collapseDepth: 2`는 표시 설정이지 배치 요구가 아니다.

모든 폴더에 `index.md`를 둔다. 섹션 인덱스와 카테고리 인덱스 모두 notes의 기존 패턴을 재사용하며, `search: false`와 `CategoryIndex` 사용을 포함한다.

### 2.2 category 필드의 지위 {#category-derivation}

`category`는 섹션 아래 폴더 경로의 파생 표기다. 독립 선언이 아니다. `section`이 폴더명과 일치해야 한다는 규칙(frontmatter-conventions 설계 원칙 3)의 한 단계 아래 연장이다.

섹션명은 값에 포함하지 않는다. `translations/kubernetes/node-runtime/`에 있는 문서의 값은 `category: "kubernetes/node-runtime"`이다. notes의 기존 관례(`notes/linux/proxmox/` → `linux/proxmox`)를 따른다.

`translation`이라는 값은 `category`와 `tags` 양쪽에서 제거한다. 그 사실은 `section`과 `doc_type`이 이미 두 번 말한다.

여기서 기존 불일치가 드러난다. notes는 섹션명을 빼고, decisions와 deep-dive는 넣는다(`decisions/docs`, `deep-dive/vibe-coding`). 두 관례가 공존 중이며, 전 섹션 통일은 이 문서의 범위 밖이다(§4.3). 다만 §2.6의 검사 규칙은 통일 이후에도 그대로 쓸 수 있도록 섹션별 접두사 유무를 설정으로 받는다.

### 2.3 정렬 축의 전환 {#sort-axis}

사이드바 정렬을 날짜 역순에서 `order` 우선으로 바꾼다. `config.mts`의 translations entry를 decisions와 같은 형태로 둔다.

```
sortMenusByFrontmatterOrder: true
collapsed: true
collapseDepth: 2
```

근거는 사이드바의 성격 변화다. 피드에서 주제 트리로 바뀌면 같은 폴더 안에서 필요한 것은 최신순이 아니라 읽는 순서다. 최신순 노출은 인덱스 페이지가 담당하며, `CategoryIndex`의 정렬 모드 전환이 이미 그 기능을 제공한다.

파일명 숫자 접두사(notes 방식)는 채택하지 않는다. 번역 문서는 원문 링크와 함께 외부에서 참조되는 문서이고, 사이 삽입마다 URL이 바뀌면 리다이렉트가 계속 쌓인다. 순서는 frontmatter가 담고 URL은 불변으로 둔다.

`order`가 정렬의 하중을 받으므로 전 문서에 값을 기입한다. 로더 기본값이 9999이므로 누락 시 한 덩어리로 뭉친다. 의존 관계를 갖는 연작에는 `series`와 `series_order`를 함께 부여한다.

### 2.4 필터의 섹션 일반화 {#filter-generalization}

§1.2의 다섯 지점을 섹션 축에서 파생되도록 고친다. translations 분기를 추가하는 방식은 채택하지 않는다(§3).

**레지스트리 확장.** `tokens.config.ts`에 카테고리 폴더 트리로 탐색하는 섹션의 목록을 추가한다.

```ts
export const CATEGORY_TREE_SECTIONS = ['notes', 'translations'] as const
```

`SECTIONS`의 부분집합이며, 타입 수준에서 그 관계를 강제한다. 섹션이 이 목록에 들어가는 조건은 두 가지다. 사이드바가 카테고리 폴더 트리이고, 인덱스 페이지가 그 트리로 필터된다. articles는 평면 구조라 해당하지 않고, decisions는 폴더 축이 카테고리가 아니라 스코프라 별도 판정이 필요하다(§5).

**전역 코드의 섹션 도출.** `theme/index.ts`는 페이지 컴포넌트가 아니므로 prop을 받을 수 없다. `location.pathname`의 첫 세그먼트를 섹션으로 읽고 `CATEGORY_TREE_SECTIONS` 소속 여부로 발화를 판정한다. 소속이 아니면 기존과 같이 조기 반환한다.

- `groupHash`의 앵커 선택자는 도출한 섹션으로 조립한다
- `NOTES_BASE`는 `SECTION_SEGMENT_COUNT`로 개명한다. 값 1은 모든 섹션에서 옳으므로 유지한다
- 클릭 핸들러의 경로 비교는 도출한 섹션의 인덱스 URL과 비교한다
- `goFilter`의 타 페이지 분기는 클릭된 그룹이 속한 섹션의 인덱스로 이동한다

**컴포넌트의 섹션 수령.** `CategoryIndex.vue`는 `section` prop으로 받는다. 인덱스 페이지가 이미 `d.section === 'notes'` 형태로 그 값을 알고 있으므로 새로 아는 사실이 없다. `props.items[0].section`에서 유추하는 방식은 목록이 빌 때 무너지므로 채택하지 않는다.

- `notesPath`는 `relativePath`로 개명하고 `'/' + props.section + '/'` 접두사를 제거한다
- `topFolder`는 그 결과의 첫 세그먼트를 그대로 쓴다
- `updateHeading`의 대상 요소 id는 `headingId` prop으로 받으며 기본값은 `props.section`이다

`updateHeading`이 제목 텍스트의 슬러그에 의존하는 구조는 이 결정에서 해소하지 않는다. prop 기본값이 우연히 맞아떨어지는 관계이며, 제목을 바꾸면 조용히 끊어진다. 후속으로 넘긴다(§5).

**해시 충돌.** 필터 해시(`#kubernetes/node-runtime`), notes 필터 해시(`#linux/proxmox`), TagCloud의 태그 해시는 전부 서로 다른 URL의 페이지에서만 읽힌다. 같은 문서 안에서 경합하지 않으므로 추가 이름공간이 필요 없다.

### 2.5 이관 절차 {#migration}

1. frontmatter 수정: `category` 교정, `order` 기입, 연작에 `series`와 `series_order` 부여
2. 문서 이동: `translations/<주제>/<하위 주제>/` 배치
3. 이미지 이동: `_embeds/img/<slug>/`를 각 문서와 같은 폴더 아래로 옮긴다. `config.mts`의 `excludeByGlobPattern`에 등록된 `**/_embeds/**`는 깊이를 가리지 않으므로 설정 변경이 없다. 삽입 규칙이 문서 기준 상대 경로이므로(image-rules §B) 이동 후 렌더링을 확인한다
4. 폴더별 `index.md` 신설
5. `config.mts`의 translations entry 교체(§2.3)
6. 필터 일반화(§2.4)
7. 옛 주소를 리다이렉트 레지스트리에 등록(DOCS-ADR-0002 §2.8)
8. docLint 규칙 등재(§2.6)

커밋 전략은 DOCS-ADR-0002 §2.9의 선례를 따른다. 동작 무변경 이동과 리네임 커밋을 로직 커밋과 분리한다.

1단계부터 5단계까지는 이 문서 작성 시점에 완료됐고 dev 서버에서 전 문서 렌더링을 확인했다. 6단계부터가 미착수다.

### 2.6 docLint 규칙 등재 {#lint-rules}

DOCS-ADR-0003의 규칙 레지스트리에 다음을 추가한다. 집행 주체는 전부 docLint이고, error 규칙은 발행 문서(`draft: false`)만 대상으로 한다.

| 채널 | 규칙 id | 내용 | 근거 |
| --- | --- | --- | --- |
| error | translations-license-required | translations 문서의 `license`와 `license_url` 필수 | 본 문서 §2.6 |
| error | translations-original-url-required | translations 문서의 `original_url` 필수 | 본 문서 §2.6 |
| error | category-folder-mismatch | `category`가 섹션 아래 폴더 경로와 불일치 | 본 문서 §2.2 |
| warn | translations-canonical-set | `canonical`이 지정된 문서 목록 | frontmatter-conventions §4 |
| warn | order-missing | 정렬이 `order`에 의존하는 섹션에서 `order` 누락 | 본 문서 §2.3 |

라이선스 필드 두 건을 error로 두는 이유는 저작권 준수가 게시 요건이기 때문이다. 사람의 기억에 맡기는 방식은 문서 3편에서는 작동하고 20편에서는 작동하지 않는다.

`category-folder-mismatch`는 기존 `section-folder-mismatch`와 같은 계열의 한 단계 아래다. 섹션별 접두사 관례가 다른 현 상태(§2.2)를 수용하도록, 접두사 포함 여부를 규칙 엔트리의 설정값으로 받는다.

## 3. 검토한 대안과 기각 이유 {#alternatives}

| 대안 | 내용 | 기각 이유 |
| --- | --- | --- |
| 평면 구조 유지 | slug만으로 구분하고 `category`로 분류 | 사이드바가 트리를 못 만들어 §1.1의 첫 두 한계가 그대로 남는다. 폴더가 1차 분류라는 설계 원칙과도 어긋난다 |
| 학습 계층을 폴더명으로 | `translations/l5-extension/` | 판단 축을 URL에 새기면 계층 재구획이 전 문서 이사가 된다 |
| 원문 경로 미러링 | `translations/kubernetes-io/concepts/...` | 계층이 3~4단으로 깊어져 사이드바 설정 전제와 어긋나고, 원문 추적성은 `original_url`이 이미 담는다 |
| 필터에 translations 분기 추가 | 기존 조건문에 섹션 하나 추가 | 복제본이 다섯에서 열로 늘고 세 번째 섹션에서 같은 작업을 반복한다. DOCS-ADR-0002 §1.2가 끝낸 병증의 재발 |
| `CategoryIndex`가 items에서 섹션 유추 | `props.items[0].section` | 목록이 비면 무너진다. 빈 카테고리는 실제로 생긴다 |
| 파일명 숫자 접두사 정렬 | notes 방식 차용 | 사이 삽입마다 URL이 바뀌고 외부 참조가 끊긴다 |
| 정렬 축 유지 | 날짜 역순 그대로 | 주제 트리 안에서 최신순은 읽는 순서와 무관하다 |

## 4. 결과 (Consequences) {#consequences}

### 4.1 기대 효과 {#gains}

translations 사이드바가 주제 트리가 되어 문서 증가에 견딘다. 의존 관계를 갖는 연작이 읽는 순서로 배열된다. `category`가 실제 분류로 기능하고, 태그 인덱스에서 의미 없는 값이 사라진다.

카테고리 필터가 섹션 축에서 파생되므로 세 번째 섹션이 추가될 때 레지스트리 한 줄로 끝난다. DOCS-ADR-0002 §2.7이 노드 쪽에서 완료한 파생 원칙이 테마 런타임까지 확장된다.

라이선스 표기 누락이 사람의 기억이 아니라 빌드 관문으로 걸린다.

### 4.2 감수 비용 {#tradeoffs}

발행 문서 전건의 URL이 바뀌고 리다이렉트 레지스트리 항목이 그만큼 늘어난다. 스텁은 빌드 산출물이므로 dev 서버에서 옛 주소가 열리지 않는다.

`order` 값을 전 문서에 수동으로 기입해야 하고, 사이 삽입 때마다 인접 문서의 값을 조정하게 된다. URL 안정성과 맞바꾼 비용이다.

`CategoryIndex`에 prop 두 개가 늘어 호출부가 길어진다. 폴더마다 `index.md`를 두는 유지 비용이 생기며, 폴더 신설이 파일 두 개(문서, 인덱스) 작업이 된다.

`updateHeading`의 제목 슬러그 의존은 이번에 해소하지 않으므로, 인덱스 페이지 제목을 바꾸면 제목 갱신이 조용히 끊어지는 상태가 남는다.

### 4.3 변경 제외 범위 {#out-of-scope}

번역 산출물의 내용 규약(번역 방식 분기, 저작권 고지 문안, 역자 주 규약)은 다루지 않는다. DOCS-CDR-0001 관할이다.

전 섹션의 `category` 접두사 관례 통일은 다루지 않는다. notes 계열과 decisions 계열의 표기가 다른 상태를 그대로 둔다.

decisions 섹션의 필터 적용 여부, articles와 deep-dive의 구조, `CategoryIndex`의 정렬과 그룹핑 내부 로직, TagCloud, 검색 구성, 기존 문서의 본문 내용은 건드리지 않는다.

## 5. 후속 (Follow-ups) {#follow-ups}

1. `updateHeading`의 제목 슬러그 의존 해소. 컴포넌트가 외부 DOM 요소를 직접 조작하는 구조 자체를 재검토하며, 인덱스 페이지가 제목을 반응형으로 렌더하는 방향이 후보다.
2. decisions 섹션의 `CATEGORY_TREE_SECTIONS` 등재 판정. 폴더 축이 카테고리가 아니라 스코프이고, 인덱스가 이미 스코프별 그룹을 제공한다(DOCS-ADR-0002 §2.1). 같은 필터를 재사용할지 별도 축으로 둘지 결정한다.
3. 전 섹션 `category` 접두사 관례 통일. §2.2가 유예한 항목이며, `category-folder-mismatch` 규칙의 설정값을 없앨 수 있게 된다.
4. `goFilter`의 실제 호출 지점 확인. 클릭 핸들러가 자체 분기를 갖고 있어 이 함수가 도달 불가능한 코드일 가능성이 있다. 도달 불가능하면 제거하고, 아니면 §2.4의 개정 대상에 포함한다.
5. 필터 해시가 만드는 히스토리 엔트리의 분류 확인. DOCS-ADR-0001의 엔트리 규약에 비추어 document 엔트리인지 ephemeral 엔트리인지 판정하며, 기존 notes 동작에도 소급 적용된다.
6. `_embeds` 이미지 경로의 죽은 링크 검사 범위 확인. 이동 후 렌더링은 확인했으나, 상대 경로 이미지 참조가 dead-links 검사 대상인지는 미확인이다.

## 6. 참고 출처 {#references}

- VitePress, Build-Time Data Loading: <https://vitepress.dev/guide/data-loading>
- VitePress, Site Config(ignoreDeadLinks, Build Hooks): <https://vitepress.dev/reference/site-config>
- VitePress, Asset Handling: <https://vitepress.dev/guide/asset-handling>
- vitepress-sidebar, Options: <https://vitepress-sidebar.cdget.com/guide/options>
- W3C, Cool URIs don't change: <https://www.w3.org/Provider/Style/URI>
- TypeScript, const assertions: <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions>
- Creative Commons, Attribution 4.0 International: <https://creativecommons.org/licenses/by/4.0/>
