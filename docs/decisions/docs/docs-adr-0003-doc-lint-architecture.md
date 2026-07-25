---
title: "문서 거버넌스 린터 docLint 도입"
date: 2026-07-06
lastmod: 2026-07-09
author: "Davi"
description: "'URL로는 열리는데 목록엔 없다'는 유령 문서 경험을 기동 시 콘솔 감사로 상시 보이게 만들고, DOCS-ADR-0002가 정한 frontmatter 규칙을 빌드 게이트로 집행하는 린터의 구조를 정한다. 규칙 레지스트리를 단일 대장으로 삼고, VitePress 고유 관문은 위임 엔트리로 흡수한다."
slug: "docs-adr-0003-doc-lint-architecture"

section: "decisions"
category: "decisions/docs"
tags: [vitepress, vite-plugin, lint, frontmatter, governance, ssot, build]

# ── decisions 전용 필드 ──
id: DOCS-ADR-0003
doc_type: "adr"
decision_status: "accepted"
deciders: ["Davi"]
period:
  start: 2026-07-06
  end: 2026-07-09
related_decisions: [DOCS-ADR-0002, CORE-ADR-0001]
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

# DOCS-ADR-0003: 문서 거버넌스 린터 docLint 도입 {#docs-adr-0003}

| 항목 | 내용 |
| --- | --- |
| 상태 | accepted |
| 결정자 | Davi |
| 기간 | 2026-07-06 ~ 2026-07-09 |
| 관련 결정 | DOCS-ADR-0002, CORE-ADR-0001 |
| 대체 관계 | 없음 |

## 1. 맥락 (Context) {#context}

### 1.1 증상 {#symptom}

notes와 deep-dive에서 같은 일을 반복해서 겪었다. 문서를 올렸는데 목록에 없고, URL을 직접 입력하면 열린다. 매번 원인을 손으로 추적했고, 원인은 매번 달랐다. 문서가 늘수록 이 추적 비용은 커지는데, 현재 시스템에는 "무엇이 왜 노출되지 않는가"를 보여주는 장소가 없다.

### 1.2 원인 계통 {#cause-taxonomy}

유령 문서의 원인은 세 갈래로 정리된다. 첫째, `draft: true`가 로더 transform에서 걸러낸 경우. 의도된 동작이지만 무엇이 걸러졌는지 어디에도 표시되지 않는다. 둘째, `section` 값과 폴더가 어긋나 로더에는 실렸으나 인덱스 페이지의 섹션 필터가 놓치는 경우. 셋째, 파일이 로더 glob 밖이라 데이터에 아예 없는 경우. 세 경우 모두 VitePress가 srcDir의 모든 마크다운을 페이지로 빌드하므로 URL은 살아 있고, 목록과 태그와 related 인덱스에서만 유령이 된다.

### 1.3 검사기의 시야 요건 {#visibility-requirement}

셋째 원인이 검사기의 위치를 결정한다. 로더는 자기 glob이 수집한 문서만 알고 있으니, glob 밖 문서는 로더 위에서 보이지 않는다. 그래서 검사기는 로더에 얹지 않고 파일 시스템을 직접 훑는다. frontmatter 파싱은 VitePress가 내부에서 쓰는 gray-matter를 그대로 함께 써서 파서 불일치 가능성을 원천 차단한다.

### 1.4 규칙 대장의 분산 위험 {#ledger-fragmentation}

DOCS-ADR-0002에서 위반 시 빌드를 실패시키는 규칙들을 만들었다. 한편 VitePress는 죽은 링크(Dead Link) 검사라는 자체 관문을 이미 운용한다(`ignoreDeadLinks`). 현행값은 localhost 예시 링크만 예외로 두고 나머지 죽은 내부 링크에 빌드를 실패시키는 'localhostLinks'다. 규칙의 존재와 스위치가 검사 코드 여기저기와 config 옵션으로 흩어지면 "지금 무엇이 집행되고 있는가"에 답할 단일 장소가 사라진다. 이 문서는 그 장소를 정의한다.

## 2. 결정 (Decision) {#decision}

### 2.1 단일 엔진과 두 채널 {#single-engine}

노출 감사와 규칙 위반 검출은 별도 시스템이 아니라 한 엔진의 두 채널이다. 입력이 같고(전 문서의 frontmatter), 시점이 같고(dev 기동과 build), 출력 매체가 같다(콘솔). 다른 것은 심각도(Severity)와 후처리(중단 여부)뿐이므로 warn과 error 두 레벨로 흡수한다.

### 2.2 규칙 레지스트리 {#rule-registry}

규칙 하나는 레지스트리의 엔트리 하나다. 엔트리는 식별자, 심각도, 집행 주체(engine), 적용 조건(applies), 검사(check), 메시지 생성을 함께 갖는다. 켜고 끄기, 심각도 조정, 신규 규칙 추가는 전부 데이터 수정으로 끝난다. `docMeta.config.ts`가 렌더링 축에 선언한 "확장은 데이터 수정으로 끝난다"의 노드 사이드 대응물이다. 부수 효과로 결정과 규칙이 하나씩 맞물린다. DOCS-ADR-0002의 §2.2, §2.3, §2.4가 각각 엔트리 하나에 대응하고, 엔트리 주석에 근거 결정의 id를 남긴다.

### 2.3 집행 매트릭스 {#enforcement-matrix}

error 규칙은 발행 문서(`draft: false`)만 대상으로 한다. unreviewed 문서는 거버넌스상 어차피 draft로 묶이므로 작성 중인 문서가 dev 서버를 막는 일이 없고, draft 해제가 곧 검사 게이트 통과 신청이 된다. 모드 분기: dev에서는 error도 출력만 하고, build에서만 중단한다. 조기 실패(Fail Fast)는 배포 경로에서 의미를 갖는다.

| 채널 | 대상 | dev 기동 | build |
| --- | --- | --- | --- |
| warn | 전 문서 | 콘솔 출력 | 콘솔 출력 |
| error | draft: false 문서 | 콘솔 출력(중단 없음) | 콘솔 출력 후 중단 |

### 2.4 후킹 지점 {#hook-point}

Vite 플러그인의 buildStart 훅에 장착한다. dev 서버 기동과 build 양쪽에서 렌더 전에 1회 실행되므로, 기동 시 일괄 목록 출력과 조기 중단을 한 자리에서 해결한다. 기각한 대안은 셋이다. 로더 transform은 §1.3의 시야 한계에 걸리고 데이터 가공과 정책 집행의 관심사를 섞는다. transformPageData는 dev에서 해당 페이지를 열어야 늦게 실행되므로 기동 시 일괄 감사가 불가능하다. buildEnd는 렌더를 마친 뒤라 조기 중단이 늦다. 단 산출물의 실존이 필요한 검사(리다이렉트 무결성)는 예외로 buildEnd 관할이며, 이 예외도 규칙 엔트리의 집행 주체 필드로 대장 안에서 표현한다.

### 2.5 집행 위임과 죽은 링크 {#delegated-enforcement}

대장이 하나로 모으는 대상은 실행자가 아니라 규칙의 존재, 스위치, 심각도다. "이 내부 링크가 유효한가"라는 판정은 cleanUrls, rewrites, base를 아는 라우팅 소유자만 내릴 수 있으므로 검출 로직을 다시 만들지 않는다. 다시 만들면 URL 해석 규칙의 사본(그림자 라우터)이 생기고, 자체 검사기가 고장 나면 오류가 그대로 통과하는 방향(Fail-Open)으로 관문의 안전 방향이 뒤집힌다.

대신 dead-links를 `engine: 'vitepress'`의 위임 엔트리로 등재하고, `config.mts`의 `ignoreDeadLinks` 값을 엔트리 상태에서 파생시킨다. 엔트리를 켜면 현행 검사값('localhostLinks')이, 끄면 true가 흘러나간다. 출력 형식까지 통일하고 싶어지면 승격 경로가 있다. 배열형 설정의 필터 함수가 링크와 소스 파일 두 인자를 받으므로, **죽은 링크를 수집만 하고 통과시킨 뒤 buildEnd에서 일괄 보고하고 중단하는 수집 구성이다.** 무시(ignore) 조건을 수집기로 쓰는 용도 밖 사용이고, Fail-Open으로 도는 비용이 있어 보류한다.

### 2.6 규칙 목록 {#initial-rules}

| 채널 | 규칙 id | 집행 주체 | 내용 | 근거 |
| --- | --- | --- | --- | --- |
| error | decisions-doctype-required | docLint | 발행된 decisions 문서의 doc_type 필수 | 0002 §2.4 |
| error | decisions-id-required | docLint | 발행된 decisions 문서의 id 필수 | 0002 §2.2 |
| error | decision-id-path-consistency | docLint | id의 스코프·타입과 디렉터리·파일명 일치 | 0002 §2.2, §2.3 |
| error | section-registered | docLint | section 값이 SECTIONS 레지스트리에 존재 | 0002 §2.7 |
| error | decision-status-in-vocab | docLint | decision_status가 doc_type의 등록 어휘에 속함 | 0002 §2.5 |
| error | section-folder-mismatch | docLint | section과 폴더의 불일치. 이관 완료로 warn에서 승격 | 본 문서 §1.2 |
| error | redirect-integrity | redirects(buildEnd) | 새 주소의 실존, 옛 주소의 비생존 | 0002 §2.8 |
| error | dead-links | vitepress(위임) | 내부 링크 유효성 | 0002 §2.8 |
| error | review-unreviewed-published | docLint | 발행 문서의 review가 unreviewed | CDR-0002 §2.4 |
| warn | draft-inventory | docLint | draft: true 문서 목록 | 본 문서 §1.1 |
| warn | outside-loader-glob | docLint | 로더 glob 밖 마크다운 목록 | 본 문서 §1.2 |
| warn | search-excluded | docLint | search: false 문서 목록. 인덱스 페이지는 면제 | 노출 감사 |
| warn  | review-backlog              | docLint | review: reviewing 발행 문서 목록 | CDR-0002 §2.4 |

### 2.7 배치와 출력 계약 {#placement-output}

모듈은 `.vitepress/lint/`의 노드 전용 자리에 두고 `config.mts`의 vite.plugins로 장착한다. 레지스트리와 검사기는 Vue와 클라이언트 런타임에 기대지 않는 순수 TS로 유지해 클라이언트 번들과 격리한다. 출력 계약은 네 부분이다: 기동 헤더(문서 수와 규칙 수), 규칙별 블록(심각도, 규칙 id, 메시지, 해당 파일 목록), 위임 규칙 목록, 말미 요약(중단 여부).

```bash
[docLint] 문서 144건(발행 130) · 규칙 11개(위임 2)

ERROR  decisions-doctype-required · 결정 기록의 doc_type 명시 의무 · 1건
  · decisions/index.md  (doc_type 누락 또는 미등록: "(없음)")

WARN   draft-inventory · 비공개(draft: true) 문서 목록 · 14건
  · translations/kubeadm-init.md  (비공개 상태)
  · ...

위임    dead-links → vitepress · 내부 링크 유효성
[docLint] dev 모드: ERROR 1건 (build에서 중단됩니다)
```

## 3. 검토한 대안과 기각 이유 {#alternatives}

| 대안 | 내용 | 기각 이유 |
| --- | --- | --- |
| ignoreDeadLinks true 전환과 자체 재검사 | VitePress 관문을 끄고 린터가 링크 검사까지 수행 | URL 해석 규칙의 사본(그림자 라우터)이 생기고, 링크 추출을 위한 세 번째 마크다운 파이프라인이 필요하며, 검사기 고장이 곧 오류 통과가 되는 방향(Fail-Open)으로 후진한다 |
| 로더 transform 내 검사 | content.data.ts에서 검사 병행 | glob 밖 문서가 원리상 보이지 않고, 데이터 가공과 정책 집행의 관심사가 섞인다 |
| 외부 린트 체인 | remark-lint 등 별도 도구 | 규칙이 SECTIONS와 docMeta 레지스트리와 분리된 실행 환경으로 이탈하고, 빌드 게이트와 실행 시점이 어긋나며, 의존성이 추가된다 |
| 레지스트리 없는 개별 검사 | 필요한 곳마다 검사 함수 분산 | 개폐와 가시성이 없어 §1.4의 분산 위험을 그대로 재현한다 |

## 4. 결과 (Consequences) {#consequences}

### 4.1 기대 효과 {#gains}

유령 문서가 기동 출력으로 상시 보이게 된다. DOCS-ADR-0002의 결정들이 사람의 기억이 아니라 기계 관문으로 집행되고, draft 해제가 게이트 통과 신청이 되는 발행 절차가 바로 선다. 집행 중인 규칙 전체가 위임 규칙을 포함해 한 목록에서 관리된다. 규칙 확장이 데이터 수정으로 끝난다.

### 4.2 감수 비용 {#tradeoffs}

dev 기동 시 전 문서 frontmatter 스캔이 1회 추가된다. 140여 건 규모의 실측에서 기동 지연은 체감되지 않았다. watch 중 파일 변경의 재감사는 이번 범위에 없다. buildStart는 렌더 산출물을 모르므로, 산출물이 필요한 검사(리다이렉트 무결성)가 buildEnd로 분리되는 두 시점을 감수한다. 수집 구성을 채택하기 전까지 죽은 링크의 출력 형식은 VitePress 고유 형식으로 남는다.

### 4.3 변경 제외 범위 {#out-of-scope}

죽은 링크 검출 로직, 본문 내용과 문체 검사, 외부(원격) 링크의 유효성 검증, 로더와 테마의 기존 로직은 건드리지 않는다.

## 5. 후속 (Follow-ups) {#follow-ups}

1. watch 재감사(변경 파일 단건 재검)와 출력 필터 옵션.
2. §2.5 수집 구성의 재검토 조건: 두 출력 형식의 불편이 실제로 쌓일 때 진행하며, 그 전에 ignoreDeadLinks 필터 함수의 인자 형태를 로컬 1.6.4에서 확인한다. node_modules는 VSCode 검색에서 기본 제외이므로 파일을 직접 연다.
3. 규칙 추가 절차의 관례화: 근거 결정 기록 확보 후 엔트리 추가, 근거 id를 주석으로 남긴다.
4. 규칙 후보 등재: unknown-field(frontmatter 키 오탈), required-common-fields(title·date 누락), duplicate-key(중복 키). 이관 검수에서 실제로 겪은 사고에서 나온 후보다.

## 6. 참고 출처 {#references}

- Vite, Plugin API(Universal Hooks): <https://vite.dev/guide/api-plugin>
- Rollup, Build Hooks(buildStart): <https://rollupjs.org/plugin-development/#buildstart>
- VitePress, Site Config(ignoreDeadLinks, Build Hooks): <https://vitepress.dev/reference/site-config>
- gray-matter: <https://github.com/jonschlinkert/gray-matter>
