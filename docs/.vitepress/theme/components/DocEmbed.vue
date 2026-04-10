<script setup>
import { ref, computed, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'

// ── 설정 ─────────────────────────────────────────────────────
const md = new MarkdownIt({ html: true, linkify: true, typographer: true })

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
    const targetSlug = props.anchor.normalize('NFC')
    let startLine    = -1
    let headingLevel = 0

    for (let i = 0; i < lines.length; i++) {
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
    for (let i = startLine; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+/)
      if (m && m[1].length <= headingLevel) break
      contentLines.push(lines[i])
    }

    const rendered = md.render(contentLines.join('\n').trim())
    content.value  = rendered || '<p><em>(이 섹션에 내용이 없습니다.)</em></p>'

  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
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
      <div class="embed-body vp-doc" v-html="content" />
      <button class="embed-close-btn" @click="closeEmbed">↑ 접기</button>
    </template>
  </details>
</template>