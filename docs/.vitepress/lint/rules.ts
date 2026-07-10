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
import { SECTIONS } from '../theme/config/tokens.config'

export type Severity = 'error' | 'warn'
export type Engine   = 'doclint' | 'vitepress' | 'redirects'

/** 스캐너가 규칙에 넘기는 문서 표현 */
export interface DocFile {
  path: string               // srcDir 상대 경로, posix 구분자 (예: 'notes/git/soft-reset.md')
  fm:   Record<string, any>  // gray-matter가 파싱한 frontmatter
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

export const RULES: readonly LintRule[] = [
  // ── warn: 노출 감사 채널 (1차 관측 파동) ──────────────────────────────────
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
    id: 'section-folder-mismatch',
    severity: 'warn', engine: 'doclint', enabled: true,  // 이관 안정화 후 error 승격 (0003 후속 2)
    summary: 'frontmatter section과 폴더의 불일치',
    applies: d => typeof d.fm.section === 'string' && inLoaderGlob(d),
    check: d => d.fm.section === sectionOf(d)
      ? null
      : `section: "${d.fm.section}" 이 폴더 "${sectionOf(d)}" 와 다름`,
  },
  {
    id: 'search-excluded',
    severity: 'warn', engine: 'doclint', enabled: true,
    summary: 'search: false 문서 목록',
    check: d => d.fm.search === false ? '검색 제외' : null,
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
]
