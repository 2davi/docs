---
title: "decisions 섹션 신설과 결정 식별 체계 정비"
date: 2026-07-06
lastmod: 2026-07-09
author: "Davi"
description: "결정 기록이 notes와 deep-dive에 흩어지고 일부는 로더 glob 밖에서 유령이 된 상태를 끝낸다. 전용 decisions 섹션과 URL 체계를 신설하고, 식별자의 정본을 frontmatter id로 확정하며, 타입·스코프 토큰 레지스트리와 옛 URL 리다이렉트 정책까지 결정 기록 거버넌스 전반을 정비한다."
slug: "docs-adr-0002-decisions-section-governance"

section: "decisions"
category: "decisions/docs"
tags: [vitepress, decision-records, information-architecture, ssot, content-loader, migration, redirect]

# ── decisions 전용 필드 ──
id: DOCS-ADR-0002
doc_type: "adr"
decision_status: "accepted"
deciders: ["Davi"]
period:
  start: 2026-07-06
  end: 2026-07-09
related_decisions: [CORE-ADR-0001, DOCS-ADR-0001, DOCS-ADR-0003]
supersedes: ~
superseded_by: ~

status: "active"
toc: true
draft: false
search: true

ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-fable-5"]
  review: "verified"
---

# DOCS-ADR-0002: decisions 섹션 신설과 결정 식별 체계 정비 {#docs-adr-0002}

| 항목 | 내용 |
| --- | --- |
| 상태 | accepted |
| 결정자 | Davi |
| 기간 | 2026-07-06 ~ 2026-07-09 |
| 관련 결정 | CORE-ADR-0001, DOCS-ADR-0001, DOCS-ADR-0003 |
| 대체 관계 | 없음 |

## 1. 맥락 (Context) {#context}

### 1.1 증상 {#symptom}

결정 기록이 사이트 안에서 한 지붕을 갖지 못했다. CDR-0001은 notes/blog-ops 아래에, RDSM의 ADR들은 deep-dive 프로젝트 문서 곁에 있고, 최근의 CORE 스코프 기록들은 로더 glob이 닿지 않는 경로에 쌓였다. 증상은 세 가지다. 첫째, 일부 기록은 URL을 직접 입력해야만 열리고 목록, 태그, related 인덱스 어디에도 잡히지 않는다. VitePress가 srcDir 아래 모든 마크다운을 페이지로 빌드하기 때문에 주소는 살아 있고, 데이터 파이프라인 안에서만 유령이 된다. 둘째, 결정 기록이라는 문서군의 존재가 사이트 정보 구조에 드러나지 않는다. 셋째, DOCS-ADR-0001은 frontmatter에 `section: "decisions"`를 선언하고도 발행하지 못한다. 로더가 그 섹션을 모르기 때문이다.

### 1.2 분산의 구조적 배경 {#structural-background}

기록들이 임시 거처를 전전한 데에는 구조적 이유가 있다. 섹션 목록이라는 하나의 사실이 여섯 군데에 복제되어 있다: `content.data.ts`의 glob 배열과 인덱스 제외 필터, `docMeta.config.ts`의 `Section` 유니언과 `SECTION_DEFAULT_DOCTYPE`, `config.mts`의 nav와 사이드바, 그리고 frontmatter-conventions 문서의 섹션 정의. 섹션 하나를 새로 만들려면 여섯 곳을 동시에 고쳐야 하는 구조(샷건 수술, Shotgun Surgery)이고, 그 비용이 신설을 미루게 만들었다.

### 1.3 식별 체계의 결함 {#latent-defects}

이관을 준비하며 세 가지 결함이 함께 드러났다. 첫째, 기존 ID 정규식 `(adr|cdr|rfc)-(\d+)`는 스코프를 모른다. `rdsm-adr-0001`과 `docs-adr-0001`이 함께 있으면 둘 다 `ADR-0001`로 읽히고, 참조 인덱스에서 나중에 읽힌 문서가 먼저 것을 덮어쓴다(Last-Write-Wins). 참조가 엉뚱한 문서로 이어져도 빌드는 성공하므로 아무도 알아차리지 못한다. 둘째, 컨벤션 문서는 `related_ards`(ard 철자)를 쓰고 코드는 `related_adrs`를 읽는 표기 어긋남이 있다. 셋째, rfc 타입이 모든 레지스트리에 등록되어 있으나 실물 문서가 없다(이관 조사에서 0건 확정).

### 1.4 결정의 관할 {#jurisdiction}

채번, 스코프, 타입이라는 제도 자체는 CORE-ADR-0001의 관할이다. 이 문서는 그 기록들을 사이트 어디에 어떤 주소로 두고 어떻게 옮기는지, 즉 사이트(DOCS) 관할만 정한다. 규칙의 기계 집행은 DOCS-ADR-0003으로 분리한다. 집행 규칙은 decisions만이 아니라 전 섹션을 대상으로 하고, 앞으로 따로 늘어나는 수명을 갖기 때문이다.

## 2. 결정 (Decision) {#decision}

### 2.1 섹션 구조와 URL 체계 {#section-structure}

`docs/decisions/<scope>/` 디렉터리를 신설한다. scope는 소문자 `core`, `rdsm`, `docs`다. frontmatter `section: "decisions"`는 폴더와 일치시킨다. "폴더가 섹션을 결정한다". 파일명과 slug는 소문자 id로 시작한다(예: `docs-adr-0002-decisions-section-governance`). URL은 `/decisions/<scope>/<slug>`가 된다. 로더 glob에 `decisions/**/*.md`를 추가하고 인덱스 제외 목록에 `/decisions/`를 더하되, 두 값 모두 SECTIONS 레지스트리에서 파생시킨다. 인덱스 페이지 `decisions/index.md`는 notes 인덱스 패턴을 재사용하며, 초기 노출은 스코프별 그룹과 `decision_status` 뱃지의 최소 구성으로 시작한다.

### 2.2 식별자의 정본 {#id-ssot}

결정 ID의 정본, 곧 단일 진실 원천(Single Source of Truth)은 frontmatter `id` 필드다. URL, 파일명, slug는 id에서 파생된 표기이며 정본이 아니다. `deriveDecisionId`(명칭은 §2.7)는 id를 1순위로 읽고, slug에서 읽어내는 방식은 이관 전 문서를 위한 예비 경로로만 남긴다. 이관이 끝나면 예비 경로는 닿을 일이 없는 코드가 되고, 그 상태는 DOCS-ADR-0003의 id 필수 규칙이 보증한다. 로더 `DocItem`에 id 필드를 싣는다. 로더에 싣지 않은 frontmatter는 화면에 존재하지 않는 필드라는 컨벤션을 적용한다.

### 2.3 스코프 표현 {#scope-representation}

별도 `scope` 필드는 만들지 않는다. 스코프는 id에 이미 들어 있고(`RDSM-ADR-0001`의 RDSM) 디렉터리 경로가 같은 사실을 다시 말한다. frontmatter에 세 번째 사본을 두는 것은 이미 파생 가능한 사실의 중복 선언이다. 인덱스의 스코프별 그룹핑은 로더가 경로 또는 id에서 만들어 낸다.

### 2.4 doc_type 명시 의무 {#doctype-required}

decisions 섹션에는 기본 doc_type을 두지 않는다. `SECTION_DEFAULT_DOCTYPE`을 `Partial<Record<Section, DocType>>`로 완화하고, 발행 상태(`draft: false`)의 decisions 문서에 doc_type이 없으면 **빌드를 실패시킨다.** 근거는 둘이다. 결정 기록은 문서 타입마다 다른 수명주기 어휘를 가지므로(§2.5) 대표 기본값이라는 개념이 성립하지 않는다. 그리고 조용한 폴백(기본 `adr` 혹은 현행 `note`)은 잘못된 카드와 어휘로 멀쩡한 척 렌더되는 침묵 오류(Silent Failure)를 제도로 만든다. 집행 주체와 시점은 DOCS-ADR-0003이 정의한다.

### 2.5 chr 등록과 상태 어휘 {#chr-registration}

chr을 `DocType`, `KNOWN_DOCTYPES`, `CARD_MATRIX`에 등록한다. 카드 필드는 `DECISION_FIELDS` 재사용으로 시작하고, 헌장 전용 필드가 필요해지면 확장지점에서 데이터로 늘린다. 상태 어휘는 ADR 표준 폴백을 쓰지 않고 전용으로 등록한다. 결정은 채택 시점에 완결되는 물건이라 Nygard 어휘에 '완료'가 없지만, 헌장(Charter)은 작업의 위임장이라 발효와 임무 완수가 본질 상태다. JEP 프로세스가 Completed를 종착지로 두고, W3C 워킹그룹 헌장이 발효 기간과 종료를 갖는 구분을 차용한다.

| 값 | 의미 | 뱃지 스타일 |
| --- | --- | --- |
| proposed | 헌장 검토 중 | neutral |
| active | 발효, 작업 진행 중 | active |
| completed | 임무 완수, 산출물 출시 | positive |
| withdrawn | 착수 전후의 철회 | muted |
| superseded | 후속 헌장으로 대체 | muted |

설계 노트 세 가지. `draft` 값을 어휘에 두지 않는 것은 발행 게이트 `draft: true`와 축이 겹치기 때문이며(한 필드 = 한 축), 그 자리는 proposed가 맡는다. `rejected`는 여러 사람이 심사하는 절차의 산물이라 1인 거버넌스에서는 withdrawn으로 충분하고, 필요해지는 날 데이터 한 줄로 추가한다. `active`가 문서 수명주기 `status: active`와 단어를 공유하는 것은 필드 축이 달라 충돌이 아니다.

### 2.6 rfc 폐기와 참조 필드 통일 {#rfc-retirement}

rfc를 타입 레지스트리에서 제거한다. RFC(Request for Comments)는 여러 사람의 의견을 구하는 검토 절차의 산물이고, 1인 거버넌스에서는 proposed 상태와 draft 게이트가 이미 그 역할을 한다. 되살리는 비용이 데이터 한 줄인 것이 레지스트리의 존재 이유이므로, 쓰이지 않는 슬롯을 제거한다.

참조 필드의 정본은 `related_decisions`로 통일한다. 참조 대상이 adr만이 아니기 때문이다. 컨벤션 문서의 ard 철자와 `related_ards`는 개정 이력에만 기록하며, 기존 문서 본문과 frontmatter의 `ARD-*` 참조는 이관 커밋에서 스코프가 붙은 id로 일괄 갱신한다.

### 2.7 토큰 레지스트리와 명칭 정비 {#token-registries}

`DECISION_SCOPES`, `DECISION_TYPES`, `SECTIONS`를 as const 레지스트리로 선언하고, 타입 유니언(`typeof X[number]`), ID 정규식, 로더 glob 문자열, 인덱스 제외 URL, 린터의 유효값 검사를 전부 여기서 파생시킨다. 하드코딩된 `(adr|cdr|rfc)`류 문자열이 사라지고 스코프, 타입, 섹션의 신설이 데이터 한 줄이 된다. 개선안으로 논의되던 SECTIONS 레지스트리는 본 결정의 전제조건으로 승격된다.

이름도 adr에서 결정(Decision)으로 바꾼다: `deriveAdrId → deriveDecisionId`, `buildAdrIndex → buildDecisionIndex`, `ADR_ID_RE → DECISION_ID_RE`. adr은 세 타입 중 하나일 뿐이다. 레지스트리 모듈은 로더(노드), 테마(클라이언트), 린터(노드)가 함께 쓰므로 Vue와 Vite에 기대지 않는 순수 TS로 유지한다.

### 2.8 옛 URL 정책 {#legacy-url-policy}

이관으로 끊기는 참조 중 내부 참조는 이관 커밋에서 전량 새 주소로 갱신하며, 갱신 누락은 VitePress의 죽은 링크(Dead Link) 검사가 빌드 실패로 잡는다. `ignoreDeadLinks`는 localhost 예시 링크만 예외로 두는 현행값('localhostLinks')을 유지하며, 규칙 대장 등재와 위임 구조는 DOCS-ADR-0003이 정한다. 따라서 이 절의 대상은 외부 유입뿐이다: 검색 엔진 인덱스, 북마크, 공유된 링크.

정책은 스텁(Stub) 리다이렉트다. 옛 주소에서 새 주소로의 맵을 순수 데이터 레지스트리로 관리하고, buildEnd 훅에서 outDir에 즉시 이동하는 정적 HTML 스텁을 생성한다. 스텁은 메타 리프레시(Meta Refresh)와 canonical을 담으며, 구글은 이 조합을 영구 이동으로 처리한다. srcDir에 안내용 마크다운을 두는 방식은 기각한다. 로더 제외 규칙, draft 게이트, 유령 감사와 전부 얽혀 방금 세운 체계에 예외를 심기 때문이다. 스텁은 VitePress가 페이지로 알지 못하는 산출물이므로, 살아 있는 죽은 링크 검사가 "내부 링크는 스텁에 기대지 않는다"는 규칙을 추가 비용 없이 지켜 준다. 리다이렉트 맵의 무결성 검사(새 주소의 실존, 옛 주소의 비생존)는 규칙 대장에 등재하되, 산출물이 존재하는 buildEnd 시점에 집행한다.

### 2.9 기존 기록의 이관 {#migration}

1. RDSM 소급 리네임: `ADR-0000~0003 → RDSM-ADR-0000~0003`, `CDR-0001 → RDSM-CDR-0001`.
2. `decisions/rdsm/`으로 이동하고 frontmatter에 `id` 필드를 기입한다.
3. DOCS-ADR-0001의 발행 준비: `decisions/docs/` 배치, 헤딩의 명사구 교정과 전 헤딩 커스텀 앵커 부여.
4. 본문과 related 필드의 옛 ID 참조를 일괄 갱신하고 `related_ards → related_decisions`로 전환한다.
5. 이동한 전건의 옛 주소를 리다이렉트 레지스트리에 등록한다.
6. 커밋 전략: 동작 무변경 리네임 커밋과 로직 커밋을 분리한다. 리네임 diff는 커도 검증이 기계적이고, 로직 diff는 작아야 검토할 수 있다.

## 3. 검토한 대안과 기각 이유 {#alternatives}

| 대안 | 내용 | 기각 이유 |
| --- | --- | --- |
| 현행 유지 | 기존 섹션 아래 흩어진 상태에서 glob만 보수 | 유령은 사라지나 결정 기록이 notes와 deep-dive의 의미를 계속 흐리고, 거버넌스 문서군이 정보 구조에 드러나지 않는다 |
| scope 필드 신설 | frontmatter에 `scope` 명시 | 경로와 id에 이미 존재하는 사실의 세 번째 사본 |
| 기본 doc_type을 adr로 | 누락 시 adr 폴백 | 타입이 수명주기 어휘를 결정하므로 침묵 오류를 제도로 만든다 |
| srcDir 스텁 문서 | 옛 주소 자리에 안내용 md 유지 | 로더 제외, draft 게이트, 유령 감사와 충돌하며 체계에 예외를 심는다 |
| 서버 리다이렉트 | HTTP 301 응답 | GitHub Pages 정적 호스팅에 서버 계층이 없다. 자체 서버 이전 시 다시 검토하며, 리다이렉트 레지스트리를 서버 설정 생성기로 재사용한다 |
| 단절 수용 | 옛 URL 방치 | 비용은 0이나, 영구 참조용 식별자 제도와 스스로 모순된다 |

## 4. 결과 (Consequences) {#consequences}

### 4.1 기대 효과 {#gains}

모든 결정 기록이 `/decisions/<scope>/`의 단일 주소 체계에 들어오고 목록, 태그, related 인덱스에 정상 노출된다. id의 정본 확정과 스코프를 아는 정규식으로, 같은 번호가 서로 덮어쓰던 충돌(§1.3)이 사라진다. 섹션, 타입, 스코프의 신설이 데이터 한 줄로 줄어들어 §1.2의 여섯 곳 동시 수술이 끝난다. 옛 URL의 외부 유입이 보존되고, 스텁 생성기는 이후의 모든 이사에 재사용된다.

### 4.2 감수 비용 {#tradeoffs}

이관 커밋의 규모(리네임, 이동, 참조 갱신)를 감수하며, 분리 커밋 전략으로 검토 가능성을 확보한다. slug 예비 경로 코드가 이관 완료까지 남는다. 스텁은 빌드 산출물이라 dev 서버에서 옛 URL이 열리지 않고 outDir에 HTML이 추가된다. SECTIONS 레지스트리 선행 작업이 전제조건이 된다.

### 4.3 변경 제외 범위 {#out-of-scope}

docSort와 ContentList의 내부 로직, 검색 구성, 기존 문서의 본문 내용, 그리고 DOCS-ADR-0001이 결정한 히스토리 아키텍처는 건드리지 않는다.

## 5. 후속 (Follow-ups) {#follow-ups}

1. DocEmbed 헤딩 파서의 `{#anchor}` 접미 인식. 커스텀 앵커 규칙의 후속이며, slug를 다시 만들어 맞추는 로직 의존을 없앤다.
2. core 기록의 깊은 경로 정리. 현재 `decisions/core/governance/conventions/`는 §2.1의 `decisions/<scope>/` 평면 구조와 다르다. 평탄화 또는 §2.1 개정 중 하나로 판정한다.
3. 규범 문서에만 있고 코드 레지스트리에 없는 `milestone` doc_type의 존폐 판정.

## 6. 참고 출처 {#references}

- VitePress, Build-Time Data Loading: <https://vitepress.dev/guide/data-loading>
- VitePress, Custom Anchors: <https://vitepress.dev/guide/markdown#custom-anchors>
- VitePress, Site Config(ignoreDeadLinks, Build Hooks): <https://vitepress.dev/reference/site-config>
- Google Search Central, Redirects and Google Search: <https://developers.google.com/search/docs/crawling-indexing/301-redirects>
- W3C, Cool URIs don't change: <https://www.w3.org/Provider/Style/URI>
- TypeScript, const assertions: <https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions>
- OpenJDK, JEP 1(프로세스 상태 모델): <https://openjdk.org/jeps/1>
- W3C Process Document(워킹그룹 헌장): <https://www.w3.org/policies/process/>
- RFC Editor, About: <https://www.rfc-editor.org/about/>
