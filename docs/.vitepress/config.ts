import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'ko-KR',
  title: "Davi's Devlog",
  description: "백엔드·인프라·아키텍처 학습 기록",

  // GitHub Pages 배포 시 레포 이름이 서브패스인 경우
  base: '/my-devlog/',

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

    sidebar: {
      '/deep-dive/rest-domain-state-manager/': [
        {
          text: 'REST Domain State Manager',
          items: [
            { text: '프로젝트 개요', link: '/deep-dive/rest-domain-state-manager/' },
            { text: '역공학 학습 가이드', link: '/deep-dive/rest-domain-state-manager/01-reverse-engineering-guide' },
            { text: 'Technical Deep Dive', link: '/deep-dive/rest-domain-state-manager/02-technical-deep-dive' },
          ],
        },
      ],
      '/notes/': [
        { text: 'Java', items: [
          { text: 'JVM GC 튜닝', link: '/notes/java/jvm-gc-tuning' },
        ]},
        { text: 'Kubernetes', items: [
          { text: 'Cilium 네트워크 정책', link: '/notes/kubernetes/cilium-network-policy' },
        ]},
        { text: 'Database', items: [
          { text: 'PostgreSQL EXPLAIN ANALYZE', link: '/notes/database/postgresql-explain-analyze' },
        ]},
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/davi-dev' },
    ],

    search: { provider: 'local' },  // 로컬 전문 검색 (무료, 모바일 지원)
  },

  // 마크다운 확장
  markdown: {
    lineNumbers: true,             // 코드 블록 줄 번호 표시
    toc: { level: [2, 3] },        // H2, H3까지 목차 자동 생성
  },
})