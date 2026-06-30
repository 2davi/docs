# Filename Conventions (2026-04-07)

## 파일명 네이밍 컨벤션

| 규칙                                | 예시                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| 소문자 영문 + 하이픈                | spring-boot-3-migration.md                                                    |
| 날짜 포함 (article 한정)            | 2026/spring-boot-3-migration.md → URL: /articles/2026/spring-boot-3-migration |
| 시리즈 순서 접두사 (deep-dive 한정) | 01-reverse-engineering-guide.md                                               |
| 한글 파일명 사용 금지               | GitHub URL 인코딩 문제 발생 가능                                              |
| 공백·특수문자 금지                  | my post.md → my-post.md                                                       |

## 결정 기록 (decisions/)

파일명: `<scope>-<type>-<nnnn>-<imperative-title>.md`  (소문자·하이픈)
  예) core-adr-0001-adr-identifier-numbering-convention.md
      rdsm-adr-0000-initial-design-alignment.md

디렉터리: decisions/<scope>/  (core / rdsm / docs)
ID 도출: 파일명 prefix `<scope>-<type>-<nnnn>` → 카드가 `<SCOPE>-<TYPE>-<NNNN>` 링크 생성
규칙 전체: convention-manual.md §3 (CORE-ADR-0001)
