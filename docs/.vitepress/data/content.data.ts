import { createContentLoader } from 'vitepress'

interface DocItem {
  url:         string
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
  [
    'articles/**/*.md',
    'notes/**/*.md',
    'deep-dive/**/*.md',
    'translations/**/*.md',
  ],
  {
    excerpt: true,
    transform(raw): DocItem[] {
      return raw
        .filter(p => !p.frontmatter.draft)
        .filter(p => p.url !== '/articles/' && p.url !== '/notes/'
                  && p.url !== '/deep-dive/' && p.url !== '/translations/')
        .map(p => ({
          url:         p.url,
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
    },
  }
)

export type { DocItem }