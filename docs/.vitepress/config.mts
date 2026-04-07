import { defineConfig } from 'vitepress'
import { generateSidebar } from 'vitepress-sidebar'

export default defineConfig({
  lang: 'ko-KR',
  title: "Davi's Devlog",
  description: "백엔드·인프라·아키텍처 학습 기록",

  // GitHub Pages 배포 시 레포 이름이 서브패스인 경우
  base: '/docs/',

  head: [
    ['link', { rel: 'icon', href: '/my-devlog/favicon.ico' }],
    // Open Graph 기본값 (각 페이지 frontmatter가 덮어씀)
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: "Davi's Devlog" }],
  ],

  themeConfig: {
    nav: [
      { text: 'Blog', link: '/blog/' },
      { text: 'Notes', link: '/notes/' },
      { text: 'Deep Dive', link: '/deep-dive/' },
      { text: 'Translations', link: '/translations/' },
    ],


    sidebar: generateSidebar([
      {
        documentRootPath: 'docs',
        scanStartPath:    'articles',
        resolvePath:      '/articles/',
        useTitleFromFrontmatter:    true,
        sortMenusByFrontmatterDate: true,
        sortMenusOrderByDescending: true,
        excludeByGlobPattern:   ['**/index.md'],
        excludeFilesByFrontmatterFieldName: 'draft'
      },
      {
        documentRootPath: 'docs',
        scanStartPath:    'notes',
        resolvePath:      '/notes/',
        useTitleFromFrontmatter:  true,
        useFolderTitleFromIndexFile: true,
        excludeByGlobPattern:   ['**/index.md'],
      },
      {
        documentRootPath:    'docs',
        scanStartPath:       'deep-dive',
        resolvePath:         '/deep-dive/',
        useTitleFromFrontmatter:   true,
        useFolderTitleFromIndexFile: true,
        sortMenusByFrontmatterOrder: true,   // series_order 기준 정렬
        excludeByGlobPattern: ['**/index.md']
      },
      {
        documentRootPath: 'docs',
        scanStartPath:    'translations',
        resolvePath:      '/translations/',
        useTitleFromFrontmatter: true,
        excludeByGlobPattern:   ['**/index.md'],
      },
    ]),

    search:      { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/davi-dev' }],
  },

  // 마크다운 확장
  markdown: {
    lineNumbers: true,             // 코드 블록 줄 번호 표시
    toc: { level: [2, 3] },        // H2, H3까지 목차 자동 생성
  },
})