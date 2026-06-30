# Convention Manual — 운영 매뉴얼 (2026-06-30)

> 이 문서는 **스펙이 아니라 운영 매뉴얼**이다.
> - `frontmatter-conventions.md` = 필드가 *무엇인가* (스펙)
> - **이 문서** = 라벨을 추가하거나 헷갈릴 때 *어디를 어떻게* 만지나 (운영·확장·문제해결)
>
> 헷갈리면 §4(용어집)부터, 라벨 추가는 §5(How-To), 안 뜨면 §6(트러블슈팅)을 본다.

---

## 1. 시스템 한눈에 — 데이터 흐름

frontmatter 한 덩어리가 **두 갈래**로 소비된다. 규칙은 전부 `docMeta.config.ts`(SSOT) 한 곳에 있다.

```text
frontmatter (각 .md의 YAML)
│
├─→ content.data.ts (로더, createContentLoader)
│      → DocItem[] 로 변환 → 목록·사이드바·홈 카드·태그 페이지
│      ※ 매핑한 필드만 통과 (화이트리스트)
│
└─→ useData().frontmatter (컴포넌트가 직접 읽음, 로더 무관)
       ├─ DocMetaCard.vue      → 슬롯 #doc-before        (H1 위 메타 카드)
       └─ DisclosureNote.vue   → 슬롯 #doc-footer-before (prev/next 위 AI 고지)

       두 컴포넌트의 "무엇을/어떻게 그릴지" 규칙 = docMeta.config.ts (SSOT)
       두 컴포넌트의 주입 = DocLayout.vue (DefaultTheme.Layout 래퍼)
```

**핵심 분리:** 목록/사이드바는 **로더(content.data.ts)** 경로, 본문 카드/고지는 **frontmatter 직접** 경로. 그래서 카드 전용 필드(`decision_status` 등)는 로더에 추가할 필요가 없다.

---

## 2. 필드 사전 (master table)

| 필드                                 | 타입             | 허용값 / 형식                                                                    | 소비처               | 적용 섹션                       |
| ------------------------------------ | ---------------- | -------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
| `title`                              | string           | —                                                                                | 로더, head           | 전체                            |
| `date` / `lastmod`                   | date             | `YYYY-MM-DD` (시각 금지)                                                         | 로더, 카드           | 전체                            |
| `author`                             | string           | 항상 사람                                                                        | 로더, head           | 전체                            |
| `description`                        | string           | 150~160자, 빈 문자열 금지                                                        | head/SEO/OG          | 전체                            |
| `slug`                               | string           | kebab-case                                                                       | URL                  | 전체                            |
| `section`                            | enum             | articles \| notes \| deep-dive \| translations                                   | 로더                 | 전체 (폴더명과 일치)            |
| `category`                           | string           | **단수**. `parent/sub` 슬래시                                                    | 로더, CategoryIndex  | 전체                            |
| `tags`                               | string[]         | kebab                                                                            | 로더, 카드           | 전체                            |
| `order`                              | number           | 낮을수록 위                                                                      | 로더(deep-dive 정렬) | 전체                            |
| `series` / `series_order`            | string / number  | —                                                                                | 카드                 | deep-dive·결정기록              |
| `status`                             | enum             | **active \| wip \| archived** (문서 수명주기)                                    | 로더, 카드           | 전체                            |
| `draft` / `search`                   | bool             | —                                                                                | 빌드/검색            | 전체                            |
| `toc`                                | bool             | —                                                                                | VitePress            | 전체                            |
| `difficulty`                         | enum             | beginner \| intermediate \| advanced                                             | 로더, 카드           | notes·deep-dive (결정기록 제외) |
| `version`                            | string           | 대상 기술 버전                                                                   | 카드                 | **notes 전용**                  |
| `cover`                              | object           | `{ image, alt }`                                                                 | OG                   | **articles 전용**               |
| `project`                            | string           | 프로젝트 슬러그                                                                  | 로더, 카드           | deep-dive                       |
| `doc_type`                           | enum             | §3 참조                                                                          | 로더, **카드 키**    | deep-dive                       |
| `related_adrs`                       | string[]         | `ADR-0000` 등                                                                    | 카드(링크)           | deep-dive·결정기록              |
| `milestone`                          | string\|~        | —                                                                                | —                    | deep-dive                       |
| `decision_status`                    | enum             | **proposed \| accepted \| rejected \| deprecated \| superseded** (결정 수명주기) | 카드                 | 결정기록                        |
| `deciders`                           | string[]         | 결정 주체 (author와 별개)                                                        | 카드                 | 결정기록                        |
| `period`                             | object           | `{ start: date, end: date\|~ }` (~=ongoing)                                      | 카드                 | 결정기록                        |
| `issue` / `issue_url`                | string           | 라벨 / 링크                                                                      | 카드(링크)           | 결정기록                        |
| `supersedes` / `superseded_by`       | string\|string[] | `ADR-0002` 등                                                                    | 카드(링크)           | 결정기록                        |
| `original_title` / `original_url`    | string           | —                                                                                | 카드                 | **translations 전용**           |
| `translator`                         | string           | 번역자                                                                           | 카드                 | translations                    |
| `original_lang` / `translation_lang` | string           | `en`/`ko`                                                                        | 카드                 | translations                    |
| `canonical`                          | string           | 원문 URL (SEO 중복 회피)                                                         | head                 | translations                    |
| `license` / `license_url`            | string           | 라벨 / 링크                                                                      | 카드                 | translations                    |
| `ai_assistance`                      | object           | §3 참조                                                                          | DisclosureNote       | 전체 (선택)                     |

---

## 3. enum 어휘 전체 (값을 추가하려면 여기 표를 먼저 본다)

| enum                         | 값                                                                                                    | 의미                     | 정의 위치                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------- |
| `status` (문서)              | `active` / `wip` / `archived`                                                                         | 문서 작성 상태           | `DOC_STATUS_VOCAB`          |
| `decision_status` (결정)     | `proposed` / `accepted` / `rejected` / `deprecated` / `superseded`                                    | 결정 수명주기 (ADR 표준) | `ADR_STANDARD_STATUS`       |
| `decision_status` (cdr 추가) | + `in-progress`                                                                                       | cdr 전용 확장값          | `DECISION_STATUS_VOCAB.cdr` |
| `difficulty`                 | `beginner` / `intermediate` / `advanced`                                                              | 난이도                   | `DIFFICULTY_VOCAB`          |
| `doc_type`                   | `adr` / `cdr` / `rfc` / `learning-guide` / `technical-deep-dive` / `translation` / `note` / `article` | 문서 유형 (카드 키)      | `DocType` + `CARD_MATRIX`   |
| `ai_assistance.authorship`   | `human` / `ai-drafted` / `co-authored` / `none`                                                       | 본문 생성 주체           | `AUTHORSHIP_LEAD`           |
| `ai_assistance.role`         | `drafting` / `editing` / `research` / `review` / `metadata` / `translation` / `diagramming`           | AI 역할 (복수)           | `ROLE_PHRASE`               |
| `ai_assistance.review`       | `verified` / `reviewed` / `unreviewed`                                                                | 인간 검증 수준           | `REVIEW_PHRASE`             |

색 스타일(`positive`/`active`/`neutral`/`negative`/`muted`)은 각 vocab 정의에 함께 박혀 있다. terra cotta = `active`.

---

## 4. 자주 헷갈리는 구분 (용어집)

펴보는 순간 90%는 여기서 풀린다.

- **`status` vs `decision_status`** — *문서 수명주기*(active/wip/archived: 글을 쓰는 중인가) vs *결정 수명주기*(proposed/accepted/...: 결정이 살아있는가). **한 문서가 동시에 `status: active` + `decision_status: superseded`일 수 있다.** 한 필드에 섞지 말 것. 카드는 결정 기록에서 `decision_status`를 본다.
- **`author` vs `deciders`** — author는 *문서 작성자*(항상 1명, 항상 사람), deciders는 *결정 주체*(복수 가능). ADR에선 deciders가 의미 단위다.
- **`doc_type` vs `section`** — 카드 규칙의 **진짜 키는 `doc_type`**. `section`은 doc_type이 비었을 때 **기본값만 공급**. 이유: `notes/blog-ops`의 cdr과 일반 note는 둘 다 `section=notes`라 section만으론 구분 불가.
- **`related_adrs` vs `supersedes` vs `superseded_by`** — related는 *참조*(맥락 연결), supersedes는 *이 결정이 폐기한 것*, superseded_by는 *이 결정을 폐기한 것*. superseded_by가 있으면 `decision_status`도 `superseded`여야 정합.
- **`null`(`~`) vs `undefined`** — 저장/데이터 경계(frontmatter `~`, 향후 RDB `NULL`)는 `null`, 뷰 바인딩 경계(`:href` 등)는 `undefined`. 충돌나면 "경계가 어디냐"로 가른다.
- **`algorithmicMedia` vs `trainedAlgorithmicMedia`** — 프로그램으로 그린 SVG(좌표 기반) vs 생성형 AI 비트맵(확산모델). 전자는 IPTC 메타 불필요, 후자는 필요. (`image-rules.md` §D)

---

## 5. How-To — 확장 레시피

전부 **데이터 수정**으로 끝난다. 템플릿(`.vue`)은 손대지 않는 게 원칙.

### 5.1. 새 `doc_type`을 추가하려면 (예: `milestone`)
`docMeta.config.ts`에서:
1. `DocType` 유니온에 `'milestone'` 추가
2. (선택) `SECTION_DEFAULT_DOCTYPE`에서 어떤 섹션의 기본값으로 쓸지 지정
3. `CARD_MATRIX`에 `milestone: [...필드배열]` 추가 — **없으면 카드 미렌더**

### 5.2. 상태 enum 값을 추가/override 하려면
- 결정 상태: `DECISION_STATUS_VOCAB`에서 해당 doc_type 키에 어휘 추가 (미등록 타입은 ADR 표준 폴백)
- 문서 상태/난이도: `DOC_STATUS_VOCAB` / `DIFFICULTY_VOCAB` 수정
- 각 값은 `{ label, style }` 형태. style은 5색 중 하나.

### 5.3. 카드에 보여줄 필드를 바꾸려면
`CARD_MATRIX`의 해당 doc_type 배열을 수정. 순서 = 표시 순서. 빼면 미표시, 추가하면 표시.
- 그 doc_type 항목을 통째로 지우면 → 해당 유형 카드 전체 미렌더 (예: `article`은 의도적으로 없음)

### 5.4. 새 카드 필드 *종류*(렌더 방식)가 필요하면
기존 kind(`text`/`badge`/`link`/`pills`/`people`/`range`/`series`/`refs`/`lang`/`date`)로 안 되면:
1. `docMeta.config.ts`의 `FieldKind`에 새 kind 추가
2. `DocMetaCard.vue`의 `pick()`에 값 추출 분기 추가 (가상 키 조립이 필요하면)
3. `DocMetaCard.vue` 템플릿에 `v-else-if` 렌더 분기 추가

### 5.5. ADR/CDR 간 링크를 연결하려면
별도 작업 불필요 — 파일명만 규칙에 맞으면 자동 링크된다.
- 결정 기록 파일명: **`{adr|cdr|rfc}-{NNNN}-{slug}.md`** (예: `adr-0000-alignment.md`)
- `buildAdrIndex`가 url 마지막 세그먼트 prefix에서 ID(`ADR-0000`)를 도출해 인덱싱
- 다른 문서에서 `related_adrs: [ADR-0000]` (또는 supersedes/superseded_by) → 자동 내부 링크
- 사이트에 페이지가 없는 ID(외부/타repo) → 텍스트로 폴백 (정상 동작)

---

## 6. 트러블슈팅

| 증상                                         | 원인 / 점검                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **카드가 안 떠요**                           | 그 doc_type의 `CARD_MATRIX` 필드 중 frontmatter에 **값이 있는 게 0개** → 전체 생략. 결정 기록이면 `decision_status`/`deciders`/`period`를 채웠는지 확인. (`status`만으론 안 잡힘) |
| **고지(DisclosureNote)가 안 떠요**           | `ai_assistance.authorship`이 `ai-drafted`/`co-authored`가 아니면 **설계대로 안 뜸**. `human`은 정상적으로 미표시.                                                                 |
| **related/supersedes 링크가 안 걸려요**      | ① dev 서버 재시작 했는지 ② `content.data.ts`가 `url`을 DocItem에 담는지 ③ 파일명이 `{type}-{NNNN}-` 규칙인지 ④ ID 대소문자(`ADR-0000`)                                            |
| **모바일에서 슬롯이 안 보여요**              | `aside-*` 슬롯은 모바일에서 숨김(정상). `doc-before`/`doc-footer-before`가 안 보이면 커스텀 Layout이 슬롯을 forward 안 하는 것 — DocLayout 통합 확인.                             |
| **날짜가 `2026-06-23T00:00:00.000Z`로 떠요** | YAML이 date를 Date 객체로 파싱 → JSON 직렬화 시 ISO 문자열. 표시 필드를 `date` kind로 두고 `fmtDate`(UTC 파트 추출) 적용.                                                         |
| **deep-dive 카테고리가 빈 값이에요**         | `categories`(복수) 썼을 것. 로더는 `category`(단수)만 읽음. `category: "deep-dive/x"`로.                                                                                          |

---

## 7. 파일 / 슬롯 레퍼런스

### 7.1. 파일이 뭘 하나
| 파일                                  | 역할                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `theme/config/docMeta.config.ts`      | **SSOT.** doc_type 해석, enum 어휘, 카드 매트릭스, ADR 인덱스/참조 해석, 고지 빌더 |
| `theme/components/DocMetaCard.vue`    | 메타 카드 (doc-before). frontmatter 직접 읽음                                      |
| `theme/components/DisclosureNote.vue` | AI 고지 (doc-footer-before). authorship 게이트                                     |
| `theme/DocLayout.vue`                 | DefaultTheme.Layout 래퍼. 두 컴포넌트를 슬롯에 주입                                |
| `.vitepress/data/content.data.ts`     | 로더. 목록/사이드바/홈/태그용 DocItem[]                                            |
| `theme/utils/docSort.ts`              | 정렬 규칙 SSOT                                                                     |

### 7.2. 카드/고지에 쓰는 슬롯 (layout: doc)
- `doc-before` — H1 위, 본문 컬럼 → **메타 카드**
- `doc-footer-before` — prev/next 직전 → **AI 고지**
- (전체 슬롯 목록은 `frontmatter-conventions.md` 또는 VitePress 공식 "Extending the Default Theme" 참조)

---

## 개정 이력
- **2026-06-30**: 최초 작성. 메타 카드·AI 고지·ADR 링크 시스템 운영 지식 통합.
