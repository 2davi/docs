import DefaultTheme from 'vitepress/theme'
import { onMounted, nextTick, watch } from 'vue'
import { useRoute }   from 'vitepress'
import type { Theme } from 'vitepress'
import ContentList    from './components/ContentList.vue'
import CategoryIndex  from './components/CategoryIndex.vue'
import TagCloud       from './components/TagCloud.vue'
import SeriesNav      from './components/SeriesNav.vue'
//import './custom.css'
import './style.css'
import DocEmbed  from './components/DocEmbed.vue'

/* ── 사이드바 리사이즈 ─────────────────────────────────────── */
const SIDEBAR_BREAKPOINT = 1280   // VitePress lg 기준

function setupSidebarResize(): void {
  // lg 미만(드로어 모드)에서는 리사이즈 비활성
  if (window.innerWidth < SIDEBAR_BREAKPOINT) {
    // 혹시 이전에 붙은 핸들이 있으면 제거
    document.querySelector('.sidebar-resize-handle')?.remove()
    return
  }

  if (document.querySelector('.sidebar-resize-handle')) return

  const sidebar = document.querySelector('.VPSidebar') as HTMLElement | null
  if (!sidebar) return

  const STORAGE_KEY   = 'vp-sidebar-width'
  const MIN_WIDTH     = 200
  const MAX_WIDTH     = 520
  const DEFAULT_WIDTH = 284

  const saved   = localStorage.getItem(STORAGE_KEY)
  const initial = saved ? parseInt(saved, 10) : DEFAULT_WIDTH
  document.documentElement.style.setProperty('--vp-sidebar-width', `${initial}px`)

  const handle = document.createElement('div')
  handle.className = 'sidebar-resize-handle'
  sidebar.appendChild(handle)

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault()

    const startX     = e.clientX
    const startWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--vp-sidebar-width'),
      10
    ) || DEFAULT_WIDTH

    handle.classList.add('dragging')
    document.body.style.userSelect = 'none'
    document.body.style.cursor     = 'col-resize'

    const onMove = (e: MouseEvent): void => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX)))
      document.documentElement.style.setProperty('--vp-sidebar-width', `${newWidth}px`)
    }

    const onUp = (): void => {
      handle.classList.remove('dragging')
      document.body.style.userSelect = ''
      document.body.style.cursor     = ''

      const current = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--vp-sidebar-width'),
        10
      )
      localStorage.setItem(STORAGE_KEY, String(current))

      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  })
}

/* ── Theme export ──────────────────────────────────────────── */
export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component('ContentList',   ContentList)
    app.component('CategoryIndex', CategoryIndex)
    app.component('TagCloud',      TagCloud)
    app.component('SeriesNav',     SeriesNav)
    app.component('DocEmbed',      DocEmbed)
  },
  setup() {
    const route = useRoute()
    
    onMounted(() => {
      setupSidebarResize()

      // 브라우저 크기 변경 시 핸들 재평가
      window.addEventListener('resize', () => {
        setupSidebarResize()
      }, { passive: true })
    })

    // SPA 라우팅 후 사이드바가 재마운트됐을 경우 대비
    watch(() => route.path, () => {
      nextTick(() => setupSidebarResize())
    })
  }
} satisfies Theme