# Image Rules (2026-06-26)

> ## 개정 이력
>
> - **2026-06-26**
>   - **§D 신설** — AI·생성 이미지 출처 표기(IPTC DigitalSourceType). 프로그래밍 SVG(`algorithmicMedia`)와
>     생성형 AI 비트맵(`trainedAlgorithmicMedia`)을 구분하고, Google의 이미지 메타데이터 요건 적용 범위를 명시.
>   - **§A 정비** — doc-local 도형 자산을 `_embeds/img/`로 표준화(사이드바 스캔 제외 경로와 일치).
>   - **§B** — PhotoSwipe 라이트박스 제외용 `no-zoom` 클래스 컨벤션 명문화.
> - **2026-04-07**: 배치·삽입·alt 기준 정립.

---

## A. 배치 원칙 — 파일이 사는 곳

| 이미지 유형             | 위치                                  | 이유                                                                       |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| OG / 소셜 공유 이미지   | `docs/public/og/[slug].png`           | 빌드 후 루트 절대 경로(`/og/...`)로 참조. frontmatter `cover.image`와 연결 |
| 문서 내 도형·다이어그램 | `docs/[섹션]/[프로젝트]/_embeds/img/` | 문서와 함께 이동. **사이드바 스캔에서 제외**(아래 주석)                    |
| 공통 UI 에셋            | `docs/public/`                        | favicon, 프로필 이미지 등 전역 자산                                        |

> **왜 `_embeds/`인가:** `config.mts`의 `excludeByGlobPattern`에 `**/_embeds/**`가 등록돼 있어
> 이 폴더의 내용물은 사이드바 문서로 생성되지 않는다. 도형·삽입 조각을 여기 두면 사이드바를 오염시키지 않는다.
> (스터디노트 도형: `_embeds/img/stage-N/` 하위로 단계별 정리)

---

## B. 마크다운 내 삽입 규칙

**기본 — 상대 경로 사용 (doc-local 이미지):**

```markdown
<!-- 문서 폴더 기준 상대 경로 -->
![Proxy 구조 다이어그램](./_embeds/img/proxy-architecture.svg)
```

**캡션이 필요한 경우 — VitePress `<figure>` 활용**

```markdown
<figure>
  <img src="./_embeds/img/v8-hidden-class.svg" alt="V8 Hidden Class 전이 다이어그램" />
  <figcaption>V8 Hidden Class 전이: 프로퍼티 추가 순서에 따라 별도 Class가 생성된다</figcaption>
</figure>
```

**라이트박스 제외 — `no-zoom` 클래스**

기본적으로 `.vp-doc` 내 이미지는 더블탭/더블클릭 시 PhotoSwipe 라이트박스로 확대된다(테마 `index.ts`의 위임 핸들러). 확대가 불필요하거나 부적절한 이미지(아이콘, 인라인 뱃지, 장식)는 `no-zoom` 클래스로 제외한다.

```markdown
<img src="./_embeds/img/inline-icon.svg" alt="" class="no-zoom" />
```

> 링크(`<a>`)로 감싼 이미지도 라이트박스 대상에서 자동 제외된다. 외부로 보내려는 이미지는 링크로, 확대만 막으려면 `no-zoom`으로.

---

## C. Alt 텍스트 작성 기준

| 이미지 성격              | alt 작성                                            |
| ------------------------ | --------------------------------------------------- |
| 순수 장식                | `alt=""` (빈 문자열). 스크린리더가 건너뛰도록       |
| 내용 전달                | 이미지가 없어도 의미가 통하도록 **서술적으로** 작성 |
| 코드·아키텍처 다이어그램 | 핵심 흐름을 **한 문장으로 요약**                    |

- alt는 "이미지: ..." 같은 군더더기 없이 내용만 적는다.
- 캡션(`figcaption`)과 alt가 동일 정보를 반복하지 않도록 한다 — 캡션은 맥락·해석, alt는 골자.

---

## D. AI·생성 이미지 출처 표기

생성 방식에 따라 출처 표기 의무가 **다르다.** 표준 어휘는 [IPTC Digital Source Type](https://cv.iptc.org/newscodes/digitalsourcetype)(C2PA 채택)을 따른다.

| 생성 방식                                         | IPTC DigitalSourceType                 | 메타데이터 표기                      |
| ------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| 코드로 그린 SVG (좌표·규칙 기반, 학습데이터 무관) | `algorithmicMedia`                     | **불필요** — 생성형 AI 산출물이 아님 |
| 생성형 AI 비트맵 (확산모델 등)                    | `trainedAlgorithmicMedia`              | **권장/필요** — 아래 참조            |
| 일부만 AI인 합성 이미지                           | `compositeWithTrainedAlgorithmicMedia` | 권장                                 |
| 카메라·스크린샷 등 직접 촬영/캡처                 | `digitalCapture`                       | 불필요                               |

### D.1 프로그래밍 SVG = `algorithmicMedia`

`svg-doc-diagrams` 류로 Python이 좌표를 찍어 생성한 도형은 **학습 데이터 추론 산출물이 아니다.** 따라서 [Google이 요구](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)하는 "AI 생성 이미지의 IPTC TrainedAlgorithmicMedia 메타데이터" 요건은 **이 SVG에 적용되지 않는다.** 별도 출처 표기 없이 게시 가능하다.

### D.2 생성형 AI 비트맵 = `trainedAlgorithmicMedia`

Midjourney·DALL·E·Imagen 등으로 만든 비트맵 일러스트를 쓸 경우:

- Google 가이드상 **AI 생성 이미지는 IPTC DigitalSourceType 메타데이터를 포함**해야 한다.
- 다수 생성 도구는 [C2PA Content Credentials](https://spec.c2pa.org/)를 자동 임베드한다(서명된 메타데이터). 가능하면 이 매니페스트를 **제거하지 말 것.**
- 메타데이터가 없거나 제거됐다면, 최소한 캡션 또는 frontmatter에서 AI 생성임을 밝힌다.

### D.3 frontmatter 연동

문서에 AI가 생성한 도형·이미지를 실었다면 `frontmatter-conventions.md` §5의 `ai_assistance`에서 표기한다.

```yaml
ai_assistance:
  authorship: "human"
  role: [diagramming]        # 도형 생성에 AI 보조 사용
  model: ["claude-opus-4.8"]
  review: "verified"
```

> 상세 수칙(언제·어떻게 공개할지, 법적 맥락)은 **`ai-usage-policy.md`** §이미지 참조.

## E. 번역 원문 이미지

(번역 원문 이미지). 원문 비트맵은 복제·핫링크 금지(별도 저작물), 처리안은 재작도(SVG, algorithmicMedia라 §D상 메타 표기 불요) / 생략+원문 안내 / 라이선스 허용 시에만 사본. P2-2. docMeta TRANSLATION_FIELDS에 original_published(date)·translation_fidelity(text) 추가. convention-manual §5.3 레시피대로 데이터 수정 두 줄. P3. docLint translations 규칙(license 필수 등)은 후순위. 현재 집행 대상이 decisions뿐이니 급하지 않다.

---

## 참고 출처

- IPTC — [Digital Source Type NewsCodes](https://cv.iptc.org/newscodes/digitalsourcetype)
- C2PA — [Content Credentials / Specifications](https://spec.c2pa.org/)
- Google Search Central — [Generative AI 콘텐츠 가이드(이미지 메타데이터 요건)](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- VitePress — [Asset Handling](https://vitepress.dev/guide/asset-handling)
