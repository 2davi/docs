<script setup>
import { ref, computed, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'

// ── 설정 ─────────────────────────────────────────────────────
const md = new MarkdownIt({ html: true, linkify: true, typographer: true })

// md Custom Renderer
md.renderer.rules.fence = (tokens, idx) => {
  const token   = tokens[idx]
  const lang    = token.info.trim() || 'text'
  const raw     = token.content
  const lines   = raw.split('\n')
  // 마지막 빈 줄 제외
  const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length

  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const lineNums = Array.from({ length: lineCount }, (_, i) =>
    `<span class="line-number">${i + 1}</span><br>`
  ).join('')

  return (
    `<div class="language-${lang} vp-adaptive-theme line-numbers-mode">` +
    `<button title="Copy Code" class="copy"></button>` +
    `<span class="lang">${lang}</span>` +
    `<pre class="vp-code"><code class="language-${lang}">${escaped}</code></pre>` +
    `<div class="line-numbers-wrapper" aria-hidden="true">${lineNums}</div>` +
    `</div>`
  )
}

// Embed-body ref 추가 및 Copy 버튼 setup
const embedBodyRef = ref(null)

function setupCopyButtons() {
  if (!embedBodyRef.value) return
  embedBodyRef.value.querySelectorAll('.copy').forEach(btn => {
    if (btn.dataset.bound) return   // 중복 바인딩 방지
    btn.dataset.bound = '1'
    btn.addEventListener('click', () => {
      const code = btn.closest('[class*="language-"]')?.querySelector('code')
      if (!code) return
      navigator.clipboard.writeText(code.textContent ?? '').then(() => {
        btn.classList.add('copied')
        setTimeout(() => btn.classList.remove('copied'), 2000)
      })
    })
  })
}

// glob 경로: 이 파일(docs/.vitepress/theme/components/) 기준 상대 경로
// ../../../ → docs/ 이므로 docs/notes/**/*.md 를 가리킴
const mdFiles = import.meta.glob('../../../notes/**/*.md', { query: '?raw', import: 'default' })

// ── Props ─────────────────────────────────────────────────────
const props = defineProps({
  src:    { type: String, required: true },
  anchor: { type: String, required: true },
  title:  { type: String, default: '' },
})

// ── 상태 ─────────────────────────────────────────────────────
const content    = ref(null)
const loading    = ref(false)
const error      = ref(null)
const hasOpened  = ref(false)
const detailsRef = ref(null)

// ── 계산 ─────────────────────────────────────────────────────
const displayTitle = computed(() =>
  props.title || props.anchor.replace(/-/g, ' ')
)

// ── Slug 재현 (VitePress / markdown-it-anchor 기본 동작) ──────
function slugify(text) {
  let slug = text
    .normalize('NFC')
    .replace(/`[^`]*`/g, s => s.slice(1, -1))   // 인라인 코드 → 텍스트
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')      // 링크 → 텍스트
    .toLowerCase()
    .replace(/[.·•]/g, '-')                        // 점류 → 하이픈
    .replace(/[^\w\uAC00-\uD7A3\s-]/gu, '')        // 허용 문자만 유지
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  // CSS id 규칙: 숫자 시작 불가 → _ 접두사
  if (/^\d/.test(slug)) slug = '_' + slug
  return slug
}

// ── 이벤트 핸들러 ─────────────────────────────────────────────
async function handleToggle(event) {
  if (!event.target.open || hasOpened.value) return
  hasOpened.value = true
  loading.value   = true
  error.value     = null

  try {
    // glob 키 조합: props.src 앞 '/' 제거 후 상대 경로 prefix 추가
    const key = '../../../' + props.src.replace(/^\//, '').replace(/\.md$/, '') + '.md'
    const loader = mdFiles[key]

    if (!loader) {
      const keys = Object.keys(mdFiles).join('\n  ')
      throw new Error(`파일을 찾을 수 없습니다: ${key}\n등록된 키:\n  ${keys}`)
    }

    // as: 'raw' glob은 loader()가 string을 직접 resolve
    const rawMd = await loader()
    const lines  = rawMd.split(/\r?\n/)  // Windows CRLF 대응

    // ── 헤딩 탐색 ────────────────────────────────────────────
    const rawAnchor = props.anchor.trim()
    const targetSlug = rawAnchor.startsWith('#')
      ? slugify(rawAnchor.slice(1).trim()).normalize('NFC')   // 원문 → slug 변환
      : rawAnchor.normalize('NFC')                            // 이미 slug
    
    let startLine    = -1
    let headingLevel = 0
    let inFence      = false   // ← 추가

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 코드 펜스 토글 (``` 또는 ~~~)
      if (/^[ \t]*(```|~~~)/.test(line)) {
        inFence = !inFence
      }

      // 펜스 안에서는 헤딩 탐색 건너뜀
      if (inFence) continue

      const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
      if (!match) continue

      const slug = slugify(match[2].trim())
      if (slug.normalize('NFC') === targetSlug) {
        startLine    = i + 1
        headingLevel = match[1].length
        break
      }
    }

    if (startLine === -1) {
      const slugList = lines
        .filter(l => /^#{1,6}\s/.test(l))
        .map(l => {
          const m = l.match(/^(#{1,6})\s+(.+)$/)
          return m ? `  "${slugify(m[2].trim())}"  ← ${l.slice(0, 60)}` : ''
        })
        .filter(Boolean)
        .join('\n')
      throw new Error(`앵커 "${props.anchor}" 매칭 실패.\n생성된 slug 목록:\n${slugList}`)
    }

    // ── 섹션 수집 ─────────────────────────────────────────────
    const contentLines = []
    let inFence2 = false   // ← 추가 (헤딩 탐색 루프와 별도 상태)

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i]

      // 코드 펜스 토글
      if (/^[ \t]*(```|~~~)/.test(line)) {
        inFence2 = !inFence2
      }

      // 펜스 밖에서만 종료 헤딩 체크
      if (!inFence2) {
        const m = line.match(/^(#{1,6})\s+/)
        if (m && m[1].length <= headingLevel) break
      }

      contentLines.push(line)
    }

    const rendered = md.render(contentLines.join('\n').trim())
    content.value  = rendered || '<p><em>(이 섹션에 내용이 없습니다.)</em></p>'

  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
    // content가 세팅된 직후 버튼 초기화
    await nextTick()
    setupCopyButtons()
  }
}

function closeEmbed(event) {
  const btnViewportY  = event.currentTarget.getBoundingClientRect().top
  const detailsDocY   = detailsRef.value.getBoundingClientRect().top + window.scrollY

  detailsRef.value.open = false

  nextTick(() => {
    window.scrollTo({
      top: detailsDocY - btnViewportY,
      behavior: 'instant',
    })
  })
}
</script>

<template>
  <details class="doc-embed" ref="detailsRef" @toggle="handleToggle">
    <summary>
      {{ displayTitle }}
      <span class="embed-source">{{ src }}#{{ anchor }}</span>
    </summary>

    <div v-if="loading" class="embed-loading">불러오는 중...</div>
    <div v-else-if="error" class="embed-error" style="white-space: pre-wrap">⚠ {{ error }}</div>
    <template v-else-if="content !== null">
      <div class="embed-body vp-doc" ref="embedBodyRef" v-html="content" />
      <button class="embed-close-btn" @click="closeEmbed">↑ 접기</button>
    </template>
  </details>
</template>