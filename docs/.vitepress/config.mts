import { defineConfig }                 from 'vitepress'
import { generateSidebar }              from 'vitepress-sidebar'
import type { VitePressSidebarOptions } from 'vitepress-sidebar/types'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath }                from 'url'
import { wrapTables }                   from './theme/markdown/wrapTables'
import { REDIRECTS, SITE_ORIGIN } from './theme/config/redirects.config'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { docLint } from '.'
import { EXCLUDED_DIR_NAMES, EXCLUDED_FILE_PREFIX, isRuleEnabled } from './lint/rules'

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

export default withMermaid(
defineConfig({
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
          sortMenusByFrontmatterOrder: true,
          collapsed:                   true,
          collapseDepth:               2,
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

  buildEnd(siteConfig) {
    // 스텁 리다이렉트 생성 (DOCS-ADR-0002 §2.8)
    // 가드 둘은 docLint redirect-integrity 규칙의 선행 구현 (DOCS-ADR-0003 §2.6)
    const out = siteConfig.outDir
    const redirectGuard = isRuleEnabled('redirect-integrity')

    for (const [oldUrl, newUrl] of Object.entries(REDIRECTS)) {
      const target = `${newUrl}.html`               // 물리 파일명, 현행 URL 체계와 일치
      const canonical = `${SITE_ORIGIN}${target}`   // 검색엔진용 절대 URL (https://developers.google.com/search/docs/crawling-indexing/301-redirects)
      const stub = join(out, `${oldUrl}.html`)

      if(redirectGuard) {
        const newAsFile  = join(out, `${newUrl}.html`)
        const newAsIndex = join(out, newUrl, 'index.html')
        if (!existsSync(newAsFile) && !existsSync(newAsIndex)) {
          throw new Error([
            `[redirects] 신주소에 문서가 없습니다: ${newUrl}`,
            `  구주소 ${oldUrl} 의 스텁이 가리킬 페이지가 이번 빌드 산출물에 없습니다.`,
            `  레지스트리 오타이거나, 문서가 그 경로에 존재하지 않는 상태입니다.`,
            `  검사한 경로:\n    ${newAsFile}\n    ${newAsIndex}`,
          ].join('\n'))
        }
        if (existsSync(stub)) {
          throw new Error([
            `[redirects] 구주소가 아직 살아 있습니다: ${oldUrl}`,
            `  이 주소에 실제 페이지가 존재해 스텁으로 덮어쓸 수 없습니다.`,
            `  원본을 아직 옮기지 않았거나, 레지스트리의 구주소가 잘못됐습니다.`,
            `  충돌 파일: ${stub}`,
          ].join('\n'))
        }
      }
      
      mkdirSync(dirname(stub), { recursive: true })
      writeFileSync(stub, [
        '<!doctype html>',
        '<html lang="ko"><head><meta charset="utf-8">',
        '<title>이동된 문서</title>',
        `<meta http-equiv="refresh" content="0; url=${target}">`,
        `<link rel="canonical" href="${canonical}">`,
        `<script>location.replace(${JSON.stringify(target)})</script>`,
        `</head><body><p>문서가 이동했습니다: <a href="${target}">${target}</a></p></body></html>`,
      ].join('\n'))
      console.log(`[redirects] ${oldUrl} → ${newUrl}`)
    }
  },

  // 스위치는 규칙 대장에서 On(TRUE)/Off(FALSE), 집행은 VitePress에게 위임.
  // TRUE = localhost 예시 링크만 면제, 나머지 데드 링크는 빌드 실패
  ignoreDeadLinks: isRuleEnabled('dead-links') ? 'localhostLinks' : true,
  srcExclude: [
    ...EXCLUDED_DIR_NAMES.map(d => `**/${d}/**`),
    `**/${EXCLUDED_FILE_PREFIX}*.md`,
  ],
  vite: { plugins: [docLint(docRoot)] },
})
)