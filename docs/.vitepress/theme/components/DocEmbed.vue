<script setup>
/**
 * DocEmbed.vue — import.meta.glob 기반 섹션 추출
 *
 * fetch() 방식은 vitepress dev에서 SPA 쉘만 반환해 동작 불가.
 * 빌드 타임에 .md 파일을 raw 텍스트로 수집 → 런타임에 slug 매칭 → markdown-it 렌더링.
 * vitepress dev / vitepress build 양쪽에서 모두 동작.
 */
import { ref, computed, nextTick } from 'vue'
import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: true, linkify: true, typographer: true })

// /notes/** 아래 모든 .md 파일을 raw 텍스트로 수집 (Vite 빌드 타임 처리)
// 패턴이 프로젝트 루트 기준이므로 VitePress 소스 루트와 일치해야 함
const mdFiles = import.meta.glob('/notes/**/*.md', { query: '?raw', import: 'default' })

const props = defineProps({
  src:   { type: String, required: true },  // e.g. "/notes/linux/proxmox/02-proxmox-vm-create"
  anchor: { type: String, required: true }, // e.g. "_1-vm-라이프사이클-lifecycle-개요"
  title:  { type: String, default: '' },
})

const content   = ref(null)
const loading   = ref(false)
const error     = ref(null)
const hasOpened = ref(false)
const detailsRef = ref(null)

function closeEmbed(event) {
  // 1. 닫기 전: 버튼의 뷰포트 기준 Y 위치 기록
  const btnViewportY = event.currentTarget.getBoundingClientRect().top

  // 2. 닫기 전: details 상단의 문서 기준 절대 Y 위치 계산
  //    (닫힌 후에도 details 엘리먼트는 남아있으므로 기준점으로 사용)
  const detailsDocY = detailsRef.value.getBoundingClientRect().top + window.scrollY

  detailsRef.value.open = false

  // 3. DOM이 축소된 뒤: details 상단이 버튼이 있던 뷰포트 위치에 오도록 스크롤
  nextTick(() => {
    window.scrollTo({
      top: detailsDocY - btnViewportY,
      behavior: 'instant',   // 튀는 느낌 없이 즉시 이동
    })
  })
}

const displayTitle = computed(() =>
  props.title || props.anchor.replace(/-/g, ' ')
)

// ── VitePress slug 생성 규칙 재현 ─────────────────────────────────
// 근거: markdown-it-anchor 기본 slugify + VitePress 숫자 시작 처리
// 검증: "1. VM 라이프사이클 (Lifecycle) 개요" → "_1-vm-라이프사이클-lifecycle-개요"
function vitepressSlugify(text) {
  // 마크다운 인라인 요소 제거 (backtick code, 링크 텍스트 등)
  const clean = text
    .normalize('NFC')  // ← 추가: 파일에서 읽은 텍스트를 NFC로 통일
    .replace(/`[^`]*`/g, s => s.slice(1, -1))  // 인라인 코드 → 텍스트만
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')     // 링크 → 텍스트만

  let slug = clean
    .toLowerCase()
    .replace(/[.·•]/g, '-')
    .replace(/[^\w\uAC00-\uD7A3\s-]/gu, '')       // 한글, 영문/숫자/_ 유지, 나머지 제거
    .trim()
    .replace(/[\s_]+/g, '-')                      // 공백·_ → 하이픈
    .replace(/-+/g, '-')                           // 연속 하이픈 정리
    .replace(/^-+|-+$/g, '')                       // 양 끝 하이픈 제거

  // CSS id 규칙: 숫자 시작 불가 → _ 접두사
  if (/^\d/.test(slug)) slug = `_${slug}`
  return slug
}

async function handleToggle(event) {
  if (!event.target.open || hasOpened.value) return
  hasOpened.value = true
  loading.value = true
  error.value   = null

  try {
    // import.meta.glob 키는 ".md" 확장자 포함
    const key     = props.src.replace(/\.md$/, '') + '.md'
    const loader  = mdFiles[key]
    if (!loader) {
      throw new Error(`파일을 찾을 수 없습니다: ${key}\n등록된 키: ${Object.keys(mdFiles).join(', ')}`)
    }

    const rawMd = await loader()
    const lines  = rawMd.split('\n')

    // ── 헤딩 탐색: slug 매칭 ───────────────────────────────────────
    let startLine    = -1
    let headingLevel = 0

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)$/)
      if (!match) continue

      const slug = vitepressSlugify(match[2].trim())
      // 마크다운 파일의 한글과 브라우저 DOM에서 읽어온 `props.anchor` 모두 NFC 정규화한 뒤 비교
      if (slug.normalize('NFC') === props.anchor.normalize('NFC')) {
        startLine    = i + 1
        headingLevel = match[1].length
        break
      }
    }

    if (startLine === -1) {
      // 디버깅: 실제 생성된 slug 목록 출력
      const slugList = lines
        .filter(l => /^#{1,6}\s/.test(l))
        .map(l => {
          const m = l.match(/^(#{1,6})\s+(.+)$/)
          return m ? `  "${vitepressSlugify(m[2].trim())}"  ← ${l.slice(0, 60)}` : ''
        })
        .join('\n')
      throw new Error(`앵커 "${props.anchor}" 매칭 실패.\n생성된 slug 목록:\n${slugList}`)
    }

    // ── 섹션 콘텐츠 수집: 같은/상위 레벨 헤딩 직전까지 ──────────────
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
</script>

<template>
  <details class="doc-embed" ref="detailsRef" @toggle="handleToggle">
    <summary>
      {{ displayTitle }}
      <span class="embed-source">{{ src }}#{{ anchor }}</span>
    </summary>

    <div v-if="loading"              class="embed-loading">불러오는 중...</div>
    <div v-else-if="error"           class="embed-error" style="white-space: pre-wrap">⚠ {{ error }}</div>
    <template v-else-if="content !== null">
      <div class="embed-body vp-doc" v-html="content" />
      <button class="embed-close-btn" @click="closeEmbed">↑ 접기</button>
    </template>
  </details>
</template>