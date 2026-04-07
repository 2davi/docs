# Image Rules (2026-04-07)

## [A - 배치 원칙]

| 이미지 유형           | 위치                           | 이유                                       |
| --------------------- | ------------------------------ | ------------------------------------------ |
| OG / 소셜 공유 이미지 | docs/public/og/[slug].png      | 빌드 후 루트 경로에서 절대 URL로 참조 가능 |
| 문서 내 다이어그램    | docs/[섹션]/[프로젝트]/assets/ | 문서와 함께 이동하므로 관리 용이           |
| 공통 UI 에셋          | docs/public/                   | favicon, 프로필 이미지 등                  |

## [B - 마크다운 내 삽입 규칙]

```markdown
<!-- 문서 로컬 이미지: 상대 경로 사용 -->
![Proxy 구조 다이어그램](./assets/proxy-architecture.png)

<!-- 캡션이 필요한 경우 VitePress figure 컴포넌트 활용 -->
<figure>
  <img src="./assets/v8-hidden-class.png" alt="V8 Hidden Class 전이 다이어그램" />
  <figcaption>V8 Hidden Class 전이: 프로퍼티 추가 순서에 따라 별도 Class가 생성된다</figcaption>
</figure>
```

## [C - Alt 텍스트 작성 기준]

- 단순 장식 이미지: alt="" (빈 문자열)
- 내용 전달 이미지: 이미지가 없어도 의미가 전달되도록 서술적으로 작성
- 코드 다이어그램: 핵심 흐름을 한 문장으로 요약
