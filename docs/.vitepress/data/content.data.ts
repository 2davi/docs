import { createContentLoader } from 'vitepress'
import { compareRecent } from '../theme/utils/docSort'
import { SECTION_GLOBS, SECTION_INDEX_URLS } from '../theme/config/tokens.config'

interface DocItem {
  url:         string
  id:          string | null    // 결정 ID의 SSOT (DOCS-ADR-0002 §2.2). 비결정 문서는 null
  title:       string
  description: string
  date:        string
  lastmod:     string
  section:     string
  category:    string
  tags:        string[]
  series:      string | null
  seriesOrder: number
  order:       number
  status:      string
  difficulty:  string | null
  project:     string | null
  doc_type:    string | null
  draft:       boolean
  search:      boolean
  excerpt:     string | undefined
}

export default createContentLoader(
  SECTION_GLOBS,   // 섹션 축의 정본에서 파생 (tokens.config). decisions 가 여기로 편입된다
  {
    excerpt: true,
    transform(raw): DocItem[] {
      return raw
        .filter(p => !p.frontmatter.draft)
        .filter(p => !SECTION_INDEX_URLS.has(p.url))     // OLD 하드코딩 → 인덱스 제외한 모든 SECTION
        .map(p => ({
          url:         p.url,
          id:          p.frontmatter.id          ?? null,
          title:       p.frontmatter.title       ?? '(제목 없음)',
          description: p.frontmatter.description ?? '',
          date:        p.frontmatter.date        ?? '',
          lastmod:     p.frontmatter.lastmod     ?? p.frontmatter.date ?? '',
          section:     p.frontmatter.section     ?? '',
          category:    p.frontmatter.category    ?? '',
          tags:        p.frontmatter.tags        ?? [],
          series:      p.frontmatter.series      ?? null,
          seriesOrder: p.frontmatter.series_order ?? 9999,
          order:       p.frontmatter.order       ?? 9999,
          status:      p.frontmatter.status      ?? 'active',
          difficulty:  p.frontmatter.difficulty  ?? null,
          project:     p.frontmatter.project     ?? null,
          doc_type:    p.frontmatter.doc_type    ?? null,
          draft:       p.frontmatter.draft       ?? false,
          search:      p.frontmatter.search      ?? true,
          excerpt:     p.excerpt,
        }))
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .sort(compareRecent)
    },
  }
)

export type { DocItem }

declare const data: DocItem[]
export { data }