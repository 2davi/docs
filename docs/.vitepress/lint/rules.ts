/**
 * docLint 규칙 대장 (SSOT)
 * ─────────────────────────────────────────────────────────────────────────
 * 규칙 하나 = 엔트리 하나. 규칙의 존재, 스위치(enabled), 심각도, 집행 주체가
 * 전부 이 목록에서 관리된다. 켜고 끄기와 확장은 데이터 수정으로 끝난다.
 *
 * engine(집행 주체):
 *   doclint   : 이 모듈의 실행기가 직접 검사한다 (check 필수)
 *   vitepress : VitePress 고유 관문에 위임한다 (예: dead-links, check 없음)
 *   redirects : buildEnd 스텁 생성기의 가드에 위임한다 (check 없음)
 *
 * 배치 위치: docs/.vitepress/lint/rules.ts
 * 근거 결정: DOCS-ADR-0003 §2.2(레지스트리), §2.5(집행 위임), §2.6(초기 목록)
 * ─────────────────────────────────────────────────────────────────────────
 */
import { SECTIONS, DECISION_TYPES, parseDecisionId, isSection } from '../theme/config/tokens.config'
import { decisionVocabOf } from '../theme/config/docMeta.config'

export type Severity = 'error' | 'warn'
export type Engine   = 'doclint' | 'vitepress' | 'redirects'

/** 스캐너가 규칙에 넘기는 문서 표현 */
export interface DocFile {
  path: string               // srcDir 상대 경로, posix 구분자 (예: 'notes/git/soft-reset.md')
  fm:   Record<string, any>  // gray-matter가 파싱한 frontmatter
}

/** 대장 조회. 위임 규칙의 스위치를 소유자 측 설정이 파생할 때 쓴다 (DOCS-ADR-0003 §2.5) */
export function isRuleEnabled(id: string): boolean {
  return RULES.some(r => r.id === id && r.enabled)
}

export interface LintRule {
  id:       string
  severity: Severity
  engine:   Engine
  enabled:  boolean
  summary:  string                          // 기동 로그에 찍히는 한 줄 설명
  applies?: (doc: DocFile) => boolean       // 생략 시 전 문서 대상
  check?:   (doc: DocFile) => string | null // 위반 메시지 반환, 통과 시 null. 위임 규칙은 생략
}

// ── 콘텐츠 스캔 제외 (srcExclude와 단일 원천) ───────────────────────────────
// config.mts의 srcExclude가 이 값에서 파생되고, 스캐너도 같은 값으로 걷는다.
// 백업, 이력, 임베드는 페이지가 아니므로 빌드에서도 검사에서도 제외한다.
export const EXCLUDED_DIR_NAMES   = ['_backups', '_history', '_embeds'] as const
export const EXCLUDED_FILE_PREFIX = 'bak-'

// ── 예외 명단 (데이터 예외) ─────────────────────────────────────────────────
// 로더 glob 밖이지만 의도된 단독 페이지. 예외 추가도 데이터 한 줄이다.
const STANDALONE_PAGES = new Set<string>([
  'index.md',
  'tags/index.md',
  'frontmatter-conventions.md',
  'convention-manual.md',
  'filename-conventions.md',
])

const sectionOf    = (doc: DocFile) => doc.path.split('/')[0]
const inLoaderGlob = (doc: DocFile) => (SECTIONS as readonly string[]).includes(sectionOf(doc))
const isDecisionRecord = (doc: DocFile) => sectionOf(doc) === 'decisions' && !doc.path.endsWith('index.md')
const isTranslation = (doc: DocFile) => sectionOf(doc) === 'translations' && !doc.path.endsWith('index.md')

// category가 폴더 경로에서 섹션명을 뺀 값과 일치해야 하는 섹션.
// ADR-0004 §2.2: 이 규칙은 category를 폴더 경로에 일치시킨다(예: kubernetes/node-runtime).
//
// notes는 이 목록에서 제외한다. 현재 notes/linux/proxmox/ 이하의 시리즈 문서군은
// 숫자 접두사 폴더(01-setup 등)로 순서를 갖는 시리즈물이며, notes(단건 노트)가 아니라
// deep-dive(시리즈·프로젝트 학습 기록) 대상이다. 섹션 이관이 예정된 부채이므로
// (별도 ADR 필요) 그때까지 notes를 검사에서 제외한다. 이관이 끝나면 notes에는
// 단건 노트만 남고, category-folder 일치를 notes에도 적용할 수 있다.
//
// 전 섹션 통일(ADR-0004 §4.3 유예)이 끝나면 이 상수를 제거하고 규칙을 일반화한다.
const CATEGORY_PREFIXED_SECTIONS = new Set<string>(['translations'])

export const RULES: readonly LintRule[] = [
  // ── warn: 노출 감사 채널 ────────────────────────────────────────────────
  {
    id: 'draft-inventory',
    severity: 'warn', engine: 'doclint', enabled: true,
    summary: '비공개(draft: true) 문서 목록',
    check: d => d.fm.draft === true ? '비공개 상태' : null,
  },
  {
    id: 'outside-loader-glob',
    severity: 'warn', engine: 'doclint', enabled: true,
    summary: '로더 glob 밖이라 목록·태그·related 인덱스에 잡히지 않는 문서',
    applies: d => !STANDALONE_PAGES.has(d.path),
    check: d => inLoaderGlob(d) ? null : '섹션 디렉터리 밖',
  },
  {
    id: 'search-excluded',
    severity: 'warn', engine: 'doclint', enabled: true,
    summary: 'search: false 문서 목록',
    applies: d => !d.path.endsWith('index.md'),
    check: d => d.fm.search === false ? '검색 제외' : null,
  },
  {
    id: 'translations-canonical-set',
    severity: 'warn', engine: 'doclint', enabled: true,
    summary: 'translations 문서에 canonical이 지정됨 (frontmatter-conventions §4: 미지정이 정책)',
    applies: d => isTranslation(d),
    check: d => d.fm.canonical != null ? `canonical 지정됨: "${d.fm.canonical}" (자기 참조 기본을 벗어남)` : null,
  },
  {
    id: 'order-missing',
    severity: 'warn', engine: 'doclint', enabled: true,
    summary: 'order 정렬 섹션에서 order 누락 (DOCS-ADR-0004 §2.3)',
    // order로 정렬하는 섹션에서 order가 없으면 로더 기본값 9999로 뭉친다.
    // translations는 order 정렬로 전환됐다(ADR-0004 §2.3). deep-dive도 order 정렬이나
    // 이 규칙은 이번 근거(§2.3) 대상인 translations로 한정한다.
    applies: d => isTranslation(d),
    check: d => d.fm.order == null ? 'order 누락 (사이드바에서 9999로 뭉침)' : null,
  },
  {
    id: 'review-unreviewed-published',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: '발행 문서의 review가 unreviewed (DOCS-CDR-0002 §2.4)',
    applies: d => 'ai_assistance' in d.fm,
    check: d => d.fm.ai_assistance?.review === 'unreviewed' ? 'AI 산출물 미검토 상태로 발행됨' : null,
  },
  {
    id: 'review-backlog',
    severity: 'warn', engine: 'doclint', enabled: true,
    summary: 'review: reviewing 발행 문서 목록 (검토 대기열)',
    applies: d => d.fm.draft !== true && 'ai_assistance' in d.fm,
    check: d => d.fm.ai_assistance?.review === 'reviewing' ? '검토 진행 중' : null,
  },

  // ── 위임 규칙: 집행은 각 소유자가, 등재와 가시성은 이 대장이 ────────────────
  // 값 파생 배선(ignoreDeadLinks ← 대장)은 3차 파동에서 연결한다.
  {
    id: 'dead-links',
    severity: 'error', engine: 'vitepress', enabled: true,
    summary: '내부 링크 유효성 (현행값 localhostLinks 보존)',
  },
  {
    id: 'redirect-integrity',
    severity: 'error', engine: 'redirects', enabled: true,
    summary: '스텁 무결성: 신주소 실존, 구주소 비생존 (buildEnd 가드)',
  },
  // ── error: draft:false 문서만 집행. ─────────────────────────────────────
  {
    id: 'section-folder-mismatch',
    severity: 'error', engine: 'doclint', enabled: true,  // 이관 안정화 후 error 승격 (0003 후속 2)
    summary: 'frontmatter section과 폴더의 불일치',
    applies: d => typeof d.fm.section === 'string' && inLoaderGlob(d),
    check: d => d.fm.section === sectionOf(d)
      ? null
      : `section: "${d.fm.section}" 이 폴더 "${sectionOf(d)}" 와 다름`,
  },
  {
    id: 'section-registered',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: 'section 값이 SECTIONS 레지스트리에 존재',
    applies: d => d.fm.section != null,
    check: d => isSection(d.fm.section) ? null : `미등록 section 값: "${d.fm.section}"`,
  },
  {
    id: 'decisions-doctype-required',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: '결정 기록의 doc_type 명시 의무 (DOCS-ADR-0002 §2.4)',
    applies: d => isDecisionRecord(d),
    check: d => (DECISION_TYPES as readonly string[]).includes(d.fm.doc_type)
      ? null : `doc_type 누락 또는 미등록: "${d.fm.doc_type ?? '(없음)'}"`,
  },
  {
    id: 'decisions-id-required',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: '결정 ID의 SSOT인 frontmatter id 필수 (DOCS-ADR-0002 §2.2)',
    applies: d => isDecisionRecord(d),
    check: d => parseDecisionId(d.fm.id) ? null : `id 누락 또는 문법 위반: "${d.fm.id ?? '(없음)'}"`,
  },
  {
    id: 'decision-id-path-consistency',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: 'id의 스코프·타입과 디렉터리·파일명의 일치 (DOCS-ADR-0002 §2.2, §2.3)',
    applies: d => isDecisionRecord(d) && !!parseDecisionId(d.fm.id),
    check: d => {
      const id   = parseDecisionId(d.fm.id)!
      const segs = d.path.split('/')
      const file = segs[segs.length - 1]
      const expected = `${id.scope}-${id.type}-${id.seq}-`
      if (segs[1] !== id.scope) return `id 스코프 "${id.scope}" ≠ 디렉터리 "${segs[1]}"`
      if (!file.startsWith(expected)) return `파일명이 id와 불일치. 기대 접두 "${expected}", 실제 "${file}"`
      // `git grep -n "^id:" -- docs/decisions` 명령어 결과를 통해 확인 가능.
      return null
    },
  },
  {
    id: 'decision-status-in-vocab',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: 'decision_status가 doc_type의 등록 어휘에 속함 (DOCS-ADR-0002 §2.5)',
    applies: d => isDecisionRecord(d) && (DECISION_TYPES as readonly string[]).includes(d.fm.doc_type),
    check: d => {
      if (typeof d.fm.decision_status !== 'string') return 'decision_status 누락'
      const vocab = decisionVocabOf(d.fm.doc_type)
      if (!vocab) return `doc_type "${d.fm.doc_type}" 의 상태 어휘 미등록`
      return d.fm.decision_status in vocab
        ? null
        : `미등록 상태 값: "${d.fm.decision_status}"`
    },
  },
  {
    id: 'translations-license-required',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: '발행된 translations 문서의 license·license_url 필수 (DOCS-ADR-0004 §2.6)',
    applies: d => isTranslation(d),
    check: d => {
      const missing: string[] = []
      if (!d.fm.license)     missing.push('license')
      if (!d.fm.license_url) missing.push('license_url')
      return missing.length ? `저작권 필드 누락: ${missing.join(', ')}` : null
    },
  },
  {
    id: 'translations-original-url-required',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: '발행된 translations 문서의 original_url 필수 (DOCS-ADR-0004 §2.6)',
    applies: d => isTranslation(d),
    check: d => d.fm.original_url ? null : 'original_url 누락 (원문 출처 표기 의무)',
  },
  {
    id: 'category-folder-mismatch',
    severity: 'error', engine: 'doclint', enabled: true,
    summary: 'category가 섹션 아래 폴더 경로와 일치 (DOCS-ADR-0004 §2.2)',
    // 접두사를 빼는 섹션만 대상. category와 section이 모두 있어야 판정 가능.
    applies: d =>
      CATEGORY_PREFIXED_SECTIONS.has(sectionOf(d)) &&
      typeof d.fm.category === 'string' &&
      !d.path.endsWith('index.md'),
    check: d => {
      // 기대값: 파일 경로에서 [섹션명]과 [파일명]을 뺀 중간 폴더 경로.
      // 예) translations/kubernetes/node-runtime/k8s-node-allocatable.md
      //     → 기대 category = "kubernetes/node-runtime"
      const segs = d.path.split('/')
      const folderPath = segs.slice(1, -1).join('/')  // 섹션·파일명 제외
      return d.fm.category === folderPath ? null : `category "${d.fm.category}" 이 폴더 경로 "${folderPath}" 와 다름`
    },
  },
]
