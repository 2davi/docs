# AI Usage Policy (2026-06-26)

---

## 1. 핵심 원칙

**품질이 기준이지, 생산 방식이 기준이 아니다.**
[Google Search Central](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content)의 일관된 입장: AI 사용 자체는 가이드라인 위반이 아니며, **검색 순위 조작 목적의 콘텐츠 생성**만 스팸이다. 평가 기준은 **E-E-A-T**(Experience, Expertise, Authoritativeness, Trustworthiness; 경험·전문성·권위·신뢰성)다.

이로부터 세 가지 운영 원칙이 따라온다.

1. **AI는 초안 도구(drafting tool)이지 발행 도구(publishing tool)가 아니다.** 검토·사실확인·독자적 관점을 더한 뒤에만 게시한다.
2. **"Who / How / Why"로 자문한다.** *누가* 책임지는가, *어떻게* 만들었는가, *왜* 만들었는가 — 이 셋이 떳떳하면 방식은 문제되지 않는다.
3. **경험(E)은 사람이 채운다.** AI가 못 만드는 가치 — 실제로 막힌 지점, 디버깅 과정, 삽질 — 가 이 블로그의 차별점이다. AI 초안에 그것을 얹는 순간 글이 살아난다.

---

## 2. 허용 / 금지 사용

| 허용 (검토를 전제로)                | 금지                                        |
| ----------------------------------- | ------------------------------------------- |
| 개념 학습·자료 조사 보조            | 검토 없는 raw 출력 직접 게시                |
| 초안 생성 후 직접 편집·재구성       | 순위 조작용 대량 양산(scaled content abuse) |
| 문장 교정·구조 정리                 | 사실 미검증 상태의 게시                     |
| description·tags 등 메타데이터 추천 | AI를 author로 표기                          |
| 번역 보조(원문 검증 동반)           | 출처·라이선스 불명 콘텐츠 무단 복제         |
| 다이어그램 생성 보조                | 1차 경험을 날조하여 서술                    |

> [Google](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content): 사용자에게 가치를 더하지 않으면서 AI로 다수 페이지를 양산하는 것은 **대량 콘텐츠 남용** 스팸 정책 위반일 수 있다. *깊이 파서 적게 쓰는* 기조를 유지한다.

---

## 3. 사실 검증 의무

AI는 환각(hallucination)을 내고 오래된 정보를 담을 수 있으며, 깊이 있는 최신 전문 인사이트와 1차 경험을 제공하지 못한다. 따라서:

- **AI 산출물은 다른 모든 출처와 똑같이 검증한다.** (AP의 원칙: AI가 만든 자료도 여느 취재원처럼 신중히 검증)
- **공식 문서·1차 출처로 교차검증**한 뒤 게시한다. (프레임워크 소스, 표준 명세, 벤더 버그트래커 등)
- 검증 수준은 frontmatter `review` 축에 기록한다. **`review: unreviewed` 문서는 `draft: true`로 묶고 게시하지 않는다.**

---

## 4. 공개(Disclosure) 기준

### 4.1 언제 — "이거 어떻게 만들었지?"가 떠오를 때

[Google](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)은 독자가 "어떻게 만들었지?"라고 생각할 콘텐츠에 AI 공개를 권장한다. 본 블로그 기준:

- **공개 권장:** 학습노트, deep-dive 등 AI가 본문 초안·리서치에 관여한 문서 (`authorship: ai-drafted` / `co-authored`)
- **공개 선택:** AI가 메타데이터만 도운 문서 (`role: [metadata]`) — 오히려 "본문엔 AI 미관여"를 명시해 오해를 막는 편이 낫다
- **공개 불필요:** AI 전혀 미사용 (`ai_assistance` 생략)

### 4.2 어떻게 — 2단계 공개

1. **기계 가독 표기(필수):** frontmatter `ai_assistance`(§5). 정렬·필터·향후 검증의 기반.
2. **가시적 표기(선택):** 독자에게 직접 보이는 한 줄 안내. 투명성을 적극 노출하고 싶을 때.

> 단, **동일한 공개 문구를 모든 글에 기계적으로 붙이면 소음이 된다**(Trusting News). 글의 실제 AI 관여에 맞춰 문구를 달리한다.

### 4.3 가시적 공개 문구 템플릿

문서 말미에 둘 수 있는 형식(실제 관여에 맞게 채운다):

```markdown
> **AI 활용 안내**
> 이 글은 (학습 단계에서 / 초안 작성에) (모델명)을 (조사·초안 생성)에 사용했고,
> 모든 내용은 (공식 문서 교차검증을 거쳐) 직접 (재작성·검증)했습니다.
```

채울 슬롯: ① AI가 관여한 단계, ② 사용 모델, ③ AI가 한 일, ④ 인간 검증 방식. 이 네 슬롯은 frontmatter 4축(`authorship`/`model`/`role`/`review`)과 1:1 대응한다.

### 4.4 author byline에 AI를 쓰지 않는다

[Google](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content)이 명시: AI에게 author byline을 부여하는 것은 제작 과정을 알리는 좋은 방법이 **아니다.** `author`는 항상 사람(검수·게시 책임자)이고, AI 관여는 `ai_assistance` 블록으로 분리한다.

---

## 5. 법적 맥락 — EU AI Act Article 50

EU 독자가 있는 한 알아둘 가치가 있다. (강제 적용 여부는 사안별로 다르며, 아래는 일반 정보다.)

- **[Article 50](https://artificialintelligenceact.eu/article/50/)의 투명성 의무는 2026-08-02 시행.** AI가 생성/조작한 콘텐츠는 인공 생성임이 식별 가능해야 한다.
- **Article 50(4):** 공익적 사안에 관해 **공개(발행)되는 AI 생성 텍스트**는 인공 생성임을 공개해야 한다. **단, 편집 책임을 동반한 진정한 인간 편집 검토가 있으면 면제**된다.
  → 본 블로그의 `review: verified`(전 내용 직접 사실검증·재작성)가 바로 이 면제 요건의 정신과 일치한다. 개인 학습 블로그 대부분은 "공익적 사안"에 해당하지 않으나, **면제 요건 자체를 상시 기준선으로 삼는다.**
- **분류 택소노미:** [초안 실천규약(Code of Practice)](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)은 인공 조작 정도를 **"fully AI-generated" vs "AI-assisted"**로 구분하도록 한다. 본 블로그의 `authorship` 축(`ai-drafted`/`co-authored`/`human`)이 이 분류와 정렬된다.
- **저작권 뉘앙스(주의):** 콘텐츠를 "**fully AI-generated**"로 라벨하면, 제3자가 이를 *인간 창작 기여가 제한적*이라는 신호로 해석할 수 있고, 유럽 저작권 개념상 **보호 성립 여부에 영향**을 줄 수 있다([Bird & Bird](https://www.twobirds.com/en/insights/2026/taking-the-eu-ai-act-to-practice-understanding-the-draft-transparency-code-of-practice) 분석). → 실제로 인간 편집·재구성이 상당하다면 `co-authored`/`human`이 사실에 부합하며, 과도하게 "전부 AI"로 표기하지 않는다.

---

## 6. 이미지·도형

생성 방식에 따라 출처 표기 의무가 다르다. 상세는 `image-rules.md` §D.

- **프로그래밍 SVG**(코드로 그림) = IPTC `algorithmicMedia` → 생성형 AI 산출물 아님, 메타 표기 **불필요**.
- **생성형 AI 비트맵**(확산모델 등) = IPTC `trainedAlgorithmicMedia` → [Google 요건상 IPTC 메타데이터 권장/필요](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content). [C2PA Content Credentials](https://spec.c2pa.org/) 매니페스트가 임베드돼 있으면 제거하지 않는다.
- 도형 생성에 AI를 보조로 썼다면 frontmatter `role: [diagramming]`.

---

## 7. 코드

AI가 생성한 코드 스니펫을 글에 싣기 전:

- **(a) 실제로 실행**해 동작을 확인한다.
- **(b) 보안 함정**(인젝션, 비밀정보 노출, 안전하지 않은 기본값)을 점검한다. 최신 가이드는 AI 보조 코드에 보안·기능성·문서화를 강조하는 방향이다.
- **(c) 라이선스**를 확인한다. 출처 불명·비호환 라이선스 코드를 그대로 베끼지 않는다.
- 핵심 로직에는 **상세 주석**을 단다(Locality of Behavior). 독자가 스니펫만 보고도 흐름을 따라갈 수 있게.

---

## 8. 게시 전 체크리스트

```markdown
[ ] 본문 사실관계를 1차 출처로 교차검증했는가          (§3)
[ ] review 축이 verified인가 (unreviewed면 draft 유지)  (§3)
[ ] author가 사람인가 (AI byline 아님)                  (§4.4)
[ ] ai_assistance 4축을 실제 관여에 맞게 표기했는가      (§5 frontmatter)
[ ] "fully AI"로 과표기하지 않았는가 (저작권 뉘앙스)     (§5)
[ ] AI 비트맵 이미지의 출처 메타데이터를 보존했는가       (§6)
[ ] AI 생성 코드의 동작·보안·라이선스를 점검했는가        (§7)
[ ] 1차 경험(삽질·디버깅)을 더해 AI가 못 만드는 가치가 있는가 (§1)
```

---

## 참고 출처

- Google Search Central — [Generative AI 콘텐츠 가이드](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content), [AI-generated content 가이던스 블로그](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content)
- EU AI Act — [Article 50](https://artificialintelligenceact.eu/article/50/), [AI 생성 콘텐츠 실천규약](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)
- Bird & Bird — [초안 투명성 실천규약 분석(저작권 뉘앙스)](https://www.twobirds.com/en/insights/2026/taking-the-eu-ai-act-to-practice-understanding-the-draft-transparency-code-of-practice)
- IPTC — [Digital Source Type NewsCodes](https://cv.iptc.org/newscodes/digitalsourcetype) · C2PA — [Specifications](https://spec.c2pa.org/)
- 언론 표준 모델 — [AP AI 가이드라인 해설](https://www.warc.com/content/feed/lessons-from-the-associated-press-ai-guidelines/en-GB/8543), [Globe and Mail AI 가이드라인](https://www.theglobeandmail.com/standards-editor/article-the-globe-has-updated-its-newsroom-ai-guidelines/), [Trusting News — 독자가 원하는 공개 방식](https://journalistsresource.org/media/ai-use-news-what-audiences-disclose/)
