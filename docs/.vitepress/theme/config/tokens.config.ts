/**
 * tokens.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * 사이트 구조 토큰의 "단일 진실 원천(SSOT)".
 * 섹션, 결정 스코프, 결정 타입이라는 세 축의 정본 목록을 이 파일 하나에 모으고,
 * 타입 유니언과 ID 정규식과 로더 glob과 인덱스 URL을 전부 여기서 "파생"시킨다.
 * (카드 렌더 규칙을 docMeta.config.ts 한 곳에 모은 것과 같은 원칙)
 *
 * 확장은 전부 "데이터 수정"으로 끝난다. 소비자 코드는 건드리지 않는다.
 *   ★ 확장지점 A: 섹션 신설        → SECTIONS 에 문자열 1개 추가
 *   ★ 확장지점 B: 결정 스코프 신설  → DECISION_SCOPES 에 문자열 1개 추가
 *   ★ 확장지점 C: 결정 타입 신설    → DECISION_TYPES 에 문자열 1개 추가
 *
 * 소비자: content.data.ts(로더, 노드), docMeta.config.ts(테마, 클라이언트),
 *         docLint(노드), config.mts(빌드 설정).
 * 네 컨텍스트가 공용하므로 Vue, Vite, Node 내장 모듈 전부에 무의존한 순수 TS로 유지한다.
 * 배치 위치: docs/.vitepress/theme/config/tokens.config.ts
 * 근거 결정: DOCS-ADR-0002 §2.7 (토큰 레지스트리와 명칭 정비)
 * ─────────────────────────────────────────────────────────────────────────
 */

// ── 1. 섹션 축 ─────────────────────────────────────────────────────────────
// 사이트 최상위 콘텐츠 섹션. 폴더명 = section frontmatter 값 = URL 1단 경로.
// ("폴더가 섹션을 결정한다": frontmatter-conventions §설계원칙 3)
export const SECTIONS = [
  'articles',
  'notes',
  'deep-dive',
  'translations',
  'decisions',      // DOCS-ADR-0002 §2.1 신설
] as const

export type Section = typeof SECTIONS[number]

/** 로더 glob. content.data.ts 의 createContentLoader 인자로 그대로 전달한다. */
export const SECTION_GLOBS: string[] = SECTIONS.map(s => `${s}/**/*.md`)

/** 각 섹션의 인덱스 페이지 URL. 로더의 '인덱스 제외' 필터가 이 목록으로 판별한다. */
export const SECTION_INDEX_URLS: ReadonlySet<string> = new Set(SECTIONS.map(s => `/${s}/`))

/** section frontmatter 값 검증. docLint `section-registered` 규칙이 사용한다. */
export function isSection(v: unknown): v is Section {
  return typeof v === 'string' && (SECTIONS as readonly string[]).includes(v)
}

// ── 2. 결정 축 ─────────────────────────────────────────────────────────────
// 결정 기록 식별자 <SCOPE>-<TYPE>-<NNNN> 의 두 어휘. (제도 정의: CORE-ADR-0001)
export const DECISION_SCOPES = ['core', 'rdsm', 'docs'] as const
export type DecisionScope = typeof DECISION_SCOPES[number]

// rfc는 등재하지 않는다. (DOCS-ADR-0002 §2.6 폐기. 부활이 필요해지면 여기 한 줄이 전부다)
export const DECISION_TYPES = ['adr', 'cdr', 'chr'] as const
export type DecisionType = typeof DECISION_TYPES[number]

// ── 3. 결정 ID 문법 (파생) ──────────────────────────────────────────────────
// 앵커드(^…$) 정규식. frontmatter id 필드의 "전체"를 검증하는 용도라 부분 일치를 막는다.
// 연번은 4자리 고정. 어휘가 늘면 위 두 배열만 고치면 되고 이 정규식은 따라온다.
const SCOPE_ALT = DECISION_SCOPES.join('|')
const TYPE_ALT  = DECISION_TYPES.join('|')

export const DECISION_ID_RE = new RegExp(`^(${SCOPE_ALT})-(${TYPE_ALT})-(\\d{4})$`, 'i')

export interface DecisionId {
  id: string            // 정규화된 대문자 ID (예: 'DOCS-ADR-0002')
  scope: DecisionScope  // 소문자 (예: 'docs')
  type: DecisionType    // 소문자 (예: 'adr')
  seq: string           // 연번 (예: '0002'). 선행 0 보존을 위해 number가 아니라 string이다
}

/** id 문자열의 파싱과 정규화. 문법이 어긋나면 null. */
export function parseDecisionId(raw: unknown): DecisionId | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().match(DECISION_ID_RE)
  if (!m) return null
  const scope = m[1].toLowerCase() as DecisionScope
  const type  = m[2].toLowerCase() as DecisionType
  return {
    id: `${m[1].toUpperCase()}-${m[2].toUpperCase()}-${m[3]}`,
    scope,
    type,
    seq: m[3],
  }
}

// ── 4. 레거시 슬러그 폴백 (동결) ────────────────────────────────────────────
// 이관 전 문서의 URL 슬러그에서 구식 무스코프 ID를 도출하기 위한 정규식.
// 의도적으로 위 레지스트리에서 파생하지 않는다. 이것은 살아 있는 어휘가 아니라
// "과거 파일명"이라는 동결된 사실이고, rfc 폐기 이후에도 과거 사실은 불변이기 때문이다.
// 이관(DOCS-ADR-0002 §2.9) 완료 후 deriveDecisionId 의 폴백 경로와 함께 삭제한다.
export const LEGACY_DECISION_SLUG_RE = /(adr|cdr|rfc)-(\d+)/i
