import { defineConfig }                 from 'vitepress'
import { generateSidebar }              from 'vitepress-sidebar'
import type { VitePressSidebarOptions } from 'vitepress-sidebar/types'
import { existsSync }                   from 'fs'
import { resolve }                      from 'path'
import { fileURLToPath }                from 'url'
import { wrapTables }                   from './theme/markdown/wrapTables'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const docRoot   = resolve(__dirname, '../')


// ── 사이드바 후처리: depth-1 그룹에만 폴더 index 링크 주입 (A′) ──────────
type SidebarItem = { text?: string; link?: string; items?: SidebarItem[]; [k: string]: unknown }

function entry(
  scanStartPath: string,
  resolvePath:   string,
  extra:         Partial<VitePressSidebarOptions> = {}  // ← SidebarEntry → VitePressSidebarOptions
): VitePressSidebarOptions  | null {
  if (!existsSync(resolve(docRoot, scanStartPath))) return null
  return {
    documentRootPath:                  'docs',
    scanStartPath,
    resolvePath,
    useTitleFromFrontmatter:           true,
    useFolderTitleFromIndexFile:       true,
    excludeByGlobPattern:              ['**/index.md', '**/_embeds/**', '**/_backups/**', '**/bak-*.md', '**/_history/**'],
    excludeFilesByFrontmatterFieldName:'draft',
    ...extra,
  }
}

export default defineConfig({
  lang:        'ko-KR',
  title:       "Davi's Devlog",
  description: '백엔드·인프라·아키텍처 학습 기록',
  base:        '/',

  head: [
    ['link', { rel: 'icon',             href: '/docs/favicon.ico' }],
    ['meta', { property: 'og:type',     content: 'website' }],
    ['meta', { property: 'og:site_name',content: "Davi's Devlog" }],
  ],

  themeConfig: {
    nav: [
      { text: 'Articles',     link: '/articles/' },
      { text: 'Notes',        link: '/notes/' },
      { text: 'Deep Dive',    link: '/deep-dive/' },
      { text: 'Decisions',    link: '/decisions/' },
      { text: 'Translations', link: '/translations/' },
      { text: 'Tags',         link: '/tags/'},
    ],

    sidebar: generateSidebar(
      [
        // ── Articles: 날짜 역순, 단일 depth ──────────────────────
        entry('articles', '/articles/', {
          sortMenusByFrontmatterDate:  true,
          sortMenusOrderByDescending:  true,
          collapsed:                   false,
        }),

        // ── Notes: 중주제/소주제 폴더 계층, depth 2 펼침 ─────────
        entry('notes', '/notes/', {
          sortMenusOrderNumericallyFromLink: true,   // 파일명 01-, 02- prefix 정렬
          collapsed:    true,
          collapseDepth: 2,   // depth 1(중주제)은 펼침, depth 2(소주제)부터 접힘
        }),

        // ── Deep Dive: 프로젝트별 시리즈, order frontmatter 우선 ──
        entry('deep-dive', '/deep-dive/', {
          sortMenusByFrontmatterOrder: true,          // frontmatter order 정렬
          collapsed:                   true,
          collapseDepth:               2,
        }),

        entry('decisions', '/decisions/', {
          sortMenusByFrontmatterOrder: true,
          collapsed:                   true,
          collapseDepth:               2,
        }),

        // ── Translations: 날짜 역순, 단일 depth ──────────────────
        entry('translations', '/translations/', {
          sortMenusByFrontmatterDate: true,
          sortMenusOrderByDescending: true,
          collapsed:                  false,
        }),
      ].filter(Boolean) as VitePressSidebarOptions []
    ),

    search:      { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/2davi' }],
  },

  markdown: {
    lineNumbers: true,
    toc: { level: [2, 3] },
    theme: {
      light: 'github-dark-dimmed',
      dark: 'github-dark-dimmed'
    },
    config(md) {
      md.use(wrapTables)
    },
  },

  ignoreDeadLinks: 'localhostLinks',
})