/**
 * docMeta.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * 문서 상단 메타데이터 카드(DocMetaCard)의 "단일 진실 원천(SSOT)".
 * 카드가 [어떤 doc_type에 / 어떤 필드를 / 어떻게] 그릴지의 모든 규칙을 이 파일 하나에 모은다.
 * (정렬 규칙을 docSort.ts 한 곳에 모은 것과 같은 원칙)
 *
 * 확장은 전부 "데이터 수정"으로 끝난다 — 컴포넌트 템플릿은 건드리지 않는다.
 *   ★ 확장지점 A: 새 doc_type 추가        → DocType + SECTION_DEFAULT_DOCTYPE + CARD_MATRIX
 *   ★ 확장지점 B: 상태 enum 추가/override → DECISION_STATUS_VOCAB (또는 DOC/DIFFICULTY)
 *   ★ 확장지점 C: 카드 노출 필드 변경      → CARD_MATRIX 의 필드 배열
 *
 * 배치 위치: docs/.vitepress/theme/config/docMeta.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 */

import { deprecate } from "node:util"

// ── 0. 타입 ────────────────────────────────────────────────────────────────
// export type Section = 'articles' | 'notes' | 'deep-dive' | 'translations' | 'decisions'
import {
  DECISION_TYPES,
  LEGACY_DECISION_SLUG_RE,
  parseDecisionId,
  type DecisionType,
  type Section,
} from './tokens.config'

export type { Section } from './tokens.config'

// export type DocType =
//   | 'adr' | 'cdr' | 'chr' | 'rfc'               // 결정 기록 (decision records)
//   | 'learning-guide' | 'technical-deep-dive'    // deep-dive 본문
//   | 'translation'
//   | 'note'
//   | 'article'
export type DocType =
  | DecisionType                                // 'adr' | 'cdr' | 'chr'
  | 'learning-guide' | 'technical-deep-dive'    // deep-dive 본문
  | 'translation'
  | 'note'
  | 'article'

// ── 1. doc_type 해석 ───────────────────────────────────────────────────────
// 카드 규칙의 진짜 키는 section이 아니라 doc_type이다.
// 이유: notes/blog-ops 의 cdr 문서와 일반 note 문서는 둘 다 section='notes' 라서
//       section만으로는 구분되지 않는다. 따라서 doc_type을 1순위 키로 쓰고,
//       doc_type이 비어 있으면 section이 '기본 doc_type'을 공급한다.
const SECTION_DEFAULT_DOCTYPE: Partial<Record<Section, DocType>> = {
  articles:     'article',
  notes:        'note',
  'deep-dive':  'technical-deep-dive',
  translations: 'translation',
}

const KNOWN_DOCTYPES: ReadonlySet<DocType> = new Set<DocType>([
  ...DECISION_TYPES, 'learning-guide', 'technical-deep-dive', 'translation', 'note', 'article',
])

/** frontmatter → doc_type. doc_type 우선, 없으면 section 기본값, 그것도 없으면 'note'. */
export function resolveDocType(fm: Record<string, any>): DocType {
  const dt = fm?.doc_type as DocType | undefined
  if (dt && KNOWN_DOCTYPES.has(dt)) return dt
  const section = fm?.section as Section | undefined
  return (section && SECTION_DEFAULT_DOCTYPE[section]) || 'note'
}

// ── 2. 상태(status) 어휘 레지스트리 ────────────────────────────────────────
export type StatusStyle = 'neutral' | 'positive' | 'active' | 'negative' | 'muted'
export type StatusVocab = Record<string, { label: string; style: StatusStyle }>

// 문서 수명주기 (frontmatter `status`) — active | wip | archived
const DOC_STATUS_VOCAB: StatusVocab = {
  active:   { label: 'Active',   style: 'positive' },
  wip:      { label: 'WIP',      style: 'active'   },
  archived: { label: 'Archived', style: 'muted'    },
}

// 난이도 (frontmatter `difficulty`)
const DIFFICULTY_VOCAB: StatusVocab = {
  beginner:     { label: 'Beginner',     style: 'neutral'  },
  intermediate: { label: 'Intermediate', style: 'active'   },
  advanced:     { label: 'Advanced',     style: 'negative' },
}

// 결정 수명주기 표준 (ADR / Nygard): proposed → accepted → (rejected) → deprecated → superseded
const ADR_STANDARD_STATUS: StatusVocab = {
  proposed:   { label: 'Proposed',   style: 'neutral'  },
  accepted:   { label: 'Accepted',   style: 'positive' },
  rejected:   { label: 'Rejected',   style: 'negative' },
  deprecated: { label: 'Deprecated', style: 'muted'    },
  superseded: { label: 'Superseded', style: 'muted'    },
}

// 헌장(Charter) 수명주기. 결정과 달리 '임무 완수'가 본질 상태다 (DOCS-ADR-0002 §2.5)
const CHR_STATUS: StatusVocab = {
  proposed:   { label: 'Proposed',   style: 'neutral'  },
  active:     { label: 'Active',     style: 'active'   },
  completed:  { label: 'Completed',  style: 'positive' },
  withdrawn:  { label: 'Withdrawn',  style: 'muted'    },
  superseded: { label: 'Superseded', style: 'muted'    },
}

// ★ 확장지점 B — decision_status 어휘. 기본은 ADR 표준, doc_type별 override 가능.
//   cdr은 표준에 'in-progress'를 추가한 예시(현재 CDR 문서가 쓰는 값).
//   새 결정 타입을 추가하거나 표준에 값을 더하려면 여기만 수정한다.
const DECISION_STATUS_VOCAB: Partial<Record<DocType, StatusVocab>> = {
  adr: ADR_STANDARD_STATUS,
  cdr: {
    ...ADR_STANDARD_STATUS,
    'in-progress': { label: 'In-Progress', style: 'active' },
  },
  chr: CHR_STATUS,
}

export type VocabKey = 'decision' | 'doc' | 'difficulty'

/** 결정 타입의 등록 어휘 ─ 미등록이면 null. docLint 게이트용 엄격한 조회 */
export function decisionVocabOf(docType: DocType): StatusVocab | null {
  return DECISION_STATUS_VOCAB[docType] ?? null
}

/** 뱃지 필드가 어떤 어휘를 쓸지 해석. 'decision'은 doc_type별로 갈린다. */
export function resolveVocab(vocab: VocabKey, docType: DocType): StatusVocab {
  if (vocab === 'doc') return DOC_STATUS_VOCAB
  if (vocab === 'difficulty') return DIFFICULTY_VOCAB
  return decisionVocabOf(docType) ?? ADR_STANDARD_STATUS  // 렌더는 관대: 미등록 → 표준 폴백
}

// ── 3. 카드 필드 매트릭스 ──────────────────────────────────────────────────
export type FieldKind =
  | 'text'     // 평문 값
  | 'date'     // 날짜 → YYYY.MM.DD (YAML이 Date로 파싱돼 ISO 문자열 되는 것 차단)
  | 'badge'    // 상태 색 뱃지 (vocab 필요)
  | 'link'     // 단일 링크 (urlKey로 href를 다른 키에서 가져올 수 있음)
  | 'pills'    // 배열 → pill 묶음 (tags)
  | 'people'   // 배열/문자열 → 쉼표 평문 (deciders, 원저자)
  | 'range'    // {start,end} → "start ~ end" (end 없으면 ongoing)
  | 'series'   // series + series_order → "이름 · Ch.N"
  | 'refs'     // 배열 → pill 묶음(텍스트) (related_decisions)
  | 'lang'     // original_lang → translation_lang
  | 'project'  // 볼드체 평문 값

export interface CardField {
  key: string             // frontmatter 키 (range/series/lang은 가상 키 → 컴포넌트가 조립)
  label: string           // 카드 표시 라벨
  kind: FieldKind
  vocab?: VocabKey        // kind='badge'일 때 사용할 어휘
  urlKey?: string         // kind='link'일 때 href를 다른 키에서 가져옴 (예: license ← license_url)
  text?: string
}

// 재사용 필드 묶음 ──
const DECISION_FIELDS: CardField[] = [
  { key: 'decision_status',   label: 'Status',          kind: 'badge',  vocab: 'decision' },
  { key: 'project',           label: 'Project',         kind: 'project' },
  { key: 'period',            label: 'Decided',         kind: 'range'    },
  { key: 'deciders',          label: 'Deciders',        kind: 'people'  },
  { key: 'series',            label: 'Series',          kind: 'series'  },
  { key: 'supersedes',        label: 'Supersedes',      kind: 'refs'    },
  { key: 'superseded_by',     label: 'Supersedes by',   kind: 'refs'    },
  { key: 'related_decisions', label: 'Related',         kind: 'refs'    },
  { key: 'issue',             label: 'Issue',           kind: 'link',   urlKey: 'issue_url' },
  { key: 'tags',              label: 'Tags',            kind: 'pills'   },
]

const CHARTER_FIELDS: CardField[] = [
  { key: 'status',            label: 'Status',          kind: 'badge',  vocab: 'doc' },
  { key: 'period',            label: 'Date',            kind: 'date'    },
  { key: 'deciders',          label: 'Owners',          kind: 'people'  },
  { key: 'related_decisions', label: 'Decomposes into', kind: 'refs'    },
  { key: 'tags',              label: 'Tags',            kind: 'pills'   },
]

const DEEPDIVE_FIELDS: CardField[] = [
  { key: 'status',            label: 'Status',          kind: 'badge',  vocab: 'doc' },
  { key: 'project',           label: 'Project',         kind: 'text'    },
  { key: 'series',            label: 'Series',          kind: 'series'  },
  { key: 'difficulty',        label: 'Level',           kind: 'badge',  vocab: 'difficulty' },
  { key: 'related_decisions', label: 'Related',         kind: 'refs'    },
  { key: 'lastmod',           label: 'Updated',         kind: 'date'    },
  { key: 'tags',              label: 'Tags',            kind: 'pills'   },
]

const TRANSLATION_FIELDS: CardField[] = [
  { key: 'author',            label: '원저자',          kind: 'people'  },
  { key: 'translator',        label: '번역',            kind: 'text'    },
  { key: 'original_url',      label: '원문',            kind: 'link',   text: '원문 보기' },
  { key: 'license',           label: 'License',         kind: 'link',   urlKey: 'license_url' },
  { key: 'lang',              label: 'Lang',            kind: 'lang'    },
  // canonical: 의도적 제외 — SEO용이지 독자용이 아님
]

const NOTE_FIELDS: CardField[] = [
  { key: 'version',           label: 'Version',         kind: 'text'    },   // ★ note 핵심 필드
  { key: 'status',            label: 'Status',          kind: 'badge',   vocab: 'doc' },
  { key: 'difficulty',        label: 'Level',           kind: 'badge',   vocab: 'difficulty' },
  { key: 'lastmod',           label: 'Updated',         kind: 'date'    },
  { key: 'tags',              label: 'Tags',            kind: 'pills'   },
]

// ★ 확장지점 A·C — doc_type → 카드 필드 배열.
//   항목이 없으면(undefined) 카드를 그리지 않는다(예: article).
//   "모든 문서에 컴포넌트는 달리되, 매트릭스에 없는 타입은 스스로 렌더를 생략한다."
const CARD_MATRIX: Partial<Record<DocType, CardField[]>> = {
  adr: DECISION_FIELDS,
  cdr: DECISION_FIELDS,
  chr: DECISION_FIELDS,     // 헌장 전용 필드가 필요해지면 확장지점 C에서 분화 (0002 §2.5)
  'learning-guide':      DEEPDIVE_FIELDS,
  'technical-deep-dive': DEEPDIVE_FIELDS,
  translation: TRANSLATION_FIELDS,
  note: NOTE_FIELDS,
  // article: (의도적으로 없음 → 카드 미렌더)
}

/** doc_type에 해당하는 카드 필드 목록. 없으면 null(=카드 안 그림). */
export function getCardFields(docType: DocType): CardField[] | null {
  return CARD_MATRIX[docType] ?? null
}

// ── 4. AI 활용 공개(disclosure) ────────────────────────────────────────────
// EU AI Act 50(4) 대상은 'AI가 생성/조작한 텍스트'. 따라서 본문에 AI가 관여한
// 경우(ai-drafted | co-authored)에만 고지. metadata-only/human은 생략.
// 표기는 'AI-assisted' 프레이밍 — 'fully AI'로 과표기하면 저작권에 불리(Bird & Bird).

export interface AiAssistance {
  authorship?: 'human' | 'ai-drafted' | 'co-authored' | 'none'
  role?: string[]
  model?: string[]
  review?: 'verified' | 'reviewed' | 'unreviewed'
  date?: string
}

const DISCLOSURE_TRIGGER = new Set(['ai-drafted', 'co-authored'])

// authorship → 첫 구절 ('초안'/'부분'으로 인간 기여를 분명히)
const AUTHORSHIP_LEAD: Record<string, string> = {
  'ai-drafted':  'AI 보조로 초안을 작성한 뒤',
  'co-authored': '일부 섹션을 AI와 함께 작성한 뒤',
}

// role → 사람이 읽을 구절 (metadata는 본문 미관여 → 제외)
const ROLE_PHRASE: Record<string, string> = {
  drafting: '초안 작성', research: '자료 조사', editing: '문장 교정',
  review: '검토', translation: '번역', diagramming: '도형 생성',
}

// review → 신뢰 구절. 이 문장이 곧 50(4) '편집 검토 면제'의 근거 기록이 된다.
const REVIEW_PHRASE: Record<string, string> = {
  verified: '작성자가 모든 내용을 사실 검증하고 직접 재작성했습니다',
  reviewed: '작성자가 전체를 검토·수정했습니다',
  // pending/unreviewed: 검수 전 → draft:true 라서 미게시, 고지 문구 fallback.
}

export interface Disclosure { show: boolean; text: string; models: string[]; roles: string }

/** ai_assistance → 고지 데이터. 본문 미관여거나 정보 부족 시 show:false. */
export function buildDisclosure(ai?: AiAssistance): Disclosure {
  const off: Disclosure = { show: false, text: '', models: [], roles: '' }
  if (!ai?.authorship || !DISCLOSURE_TRIGGER.has(ai.authorship)) return off

  const lead  = AUTHORSHIP_LEAD[ai.authorship] ?? ''
  const trust = ai.review ? (REVIEW_PHRASE[ai.review] ?? '') : ''
  const roles = (ai.role ?? []).map(r => ROLE_PHRASE[r]).filter(Boolean).join('·')
  const text  = trust ? `이 문서는 ${lead}, ${trust}.` : `이 문서는 ${lead} 게시되었습니다.`

  return { show: true, text, models: ai.model ?? [], roles }
}

// ── 5. 결정 참조 해석 (related 필드 → URL) ─────────────────────────────────
// ID의 단일 진실 원천은 frontmatter `id` 다 (DOCS-ADR-0002 §2.2).
// URL 슬러그 파생은 이관 전 문서용 레거시 폴백이며, 이관 완료 후 폴백 경로째 삭제한다.

/** 문서에서 결정 ID 도출. 1순위 id 필드, 폴백 레거시 슬러그. 해당 없으면 null. */
export function deriveDecisionId(doc: { url?: string; id?: string | null }): string | null {
  const parsed = parseDecisionId(doc.id)     // 1순위: 스코프 인지 + 정규화
  if (parsed) return parsed.id

  if (!doc.url) return null                  // 폴백: 구식 무스코프 슬러그 (동결 규칙)
  const seg = doc.url.split('/').filter(Boolean).pop() ?? ''
  const m = seg.match(LEGACY_DECISION_SLUG_RE)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null
}

/** allDocs → { 'DOCS-ADR-0002': '/decisions/docs/...' } 인덱스. */
export function buildDecisionIndex(
  docs: ReadonlyArray<{ url?: string; id?: string | null }>,
): Record<string, string> {
  const idx: Record<string, string> = {}
  for (const d of docs) {
    const id = deriveDecisionId(d)
    if (id && d.url) idx[id] = d.url
  }
  return idx
}

const isExternalUrl = (s: any) => typeof s === 'string' && /^https?:\/\//.test(s)
export function resolveRef(id: string, idx: Record<string, string>): { label: string; url?: string } {
  if (idx[id]) return { label: id, url: idx[id] }          // 1) 내부 페이지
  if (isExternalUrl(id)) return { label: id, url: id }     // 2) 풀 URL 직접 기입
  return { label: id }                                     // 3) 폴백 (url 생략 = undefined)
}