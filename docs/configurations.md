# Configurations (2026-04-07)

## [A - `docs/.vitepress/config.ts` 기본 설정]

```javascript
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
```

## [B - GitHub Actions 자동 배포 설정]

### `.github/workflows/deploy.yml`

```yaml
name: Deploy VitePress to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0       # lastmod 계산을 위해 전체 히스토리 필요

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build VitePress
        run: npm run docs:build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### `package.json` 핵심 스크립트

```json
{
  "scripts": {
    "docs:dev":   "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  },
  "devDependencies": {
    "vitepress": "^1.x"
  }
}
```
