import DefaultTheme from 'vitepress/theme'
import { onMounted, nextTick, watch } from 'vue'
import { useRoute, inBrowser, useRouter }   from 'vitepress'
import type { Theme } from 'vitepress'
import ContentList    from './components/ContentList.vue'
import CategoryIndex  from './components/CategoryIndex.vue'
import TagCloud       from './components/TagCloud.vue'
import SeriesNav      from './components/SeriesNav.vue'
//import './custom.css'
import './style.css'
import DocEmbed  from './components/DocEmbed.vue'

/* ── .item 통합 클릭 + active 동기화 ───────────────────────── */
const NOTES_BASE = 1 // '/notes/' 의 세그먼트 수(notes)

// 그룹 .item 에서 '카테고리 폴더 경로' 도출 → 해시
// level-0 → '#linux',  level-1 → '#linux/proxmox'
function groupHash(groupEl: Element): string | null {
  const leaf = groupEl.querySelector('a[href*="/notes/"]') as HTMLAnchorElement | null
  if (!leaf) return null
  const level = groupEl.classList.contains('level-0') ? 0
              : groupEl.classList.contains('level-1') ? 1 : -1
  if (level < 0) return null
  const segs = new URL(leaf.href).pathname.split('/').filter(Boolean) // [notes, linux, proxmox, …]
  const path = segs.slice(NOTES_BASE, NOTES_BASE + level + 1).join('/')
  return path ? '#' + path : null
}

function setupSidebar(router: ReturnType<typeof useRouter>) {
  const goFilter = (hash: string) => {
    const onNotes = location.pathname.replace(/\/+$/, '') === '/notes'
    if (onNotes) {
      if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'))
      else location.hash = hash                  // hashchange 발화 → CategoryIndex 필터
    } else {
      router.go('/notes/' + hash)                // 다른 페이지 → SPA로 /notes/ 이동 + 해시
    }
  }

  const syncActive = () => {
    const hash = decodeURIComponent(location.hash || '')
    document.querySelectorAll('.VPSidebarItem.cat-active').forEach(el => el.classList.remove('cat-active'))
    if (!hash) return
    document.querySelectorAll('.VPSidebarItem.level-0.collapsible, .VPSidebarItem.level-1.collapsible')
      .forEach(el => { if (groupHash(el) === hash) el.classList.add('cat-active') })
  }

  // .item 단위 클릭: 펼침은 VitePress가 role="button"으로 처리, 우리는 필터만 얹음
  document.addEventListener('click', (e) => {
    const item = (e.target as Element).closest(
      '.VPSidebarItem.level-0 > .item, .VPSidebarItem.level-1 > .item'
    )
    if (!item) return
    const group = item.parentElement!
    if (!group.classList.contains('collapsible')) return

    // (2) /notes/ 인덱스 위에 있을 때만 필터 발화
    const onNotes = location.pathname.replace(/\/+$/, '') === '/notes'
    if (!onNotes) return

    const hash = groupHash(group)
    if (!hash) return
    if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'))
    else location.hash = hash
  }, true)

  window.addEventListener('hashchange', syncActive)
  router.onAfterRouteChanged = () => setTimeout(syncActive, 0) // 라우트 바뀌면 사이드바 재생성 → 재반영
  setTimeout(syncActive, 0)
}

/* ── 사이드바 리사이즈 ─────────────────────────────────────── */
const SIDEBAR_BREAKPOINT = 1280   // VitePress lg 기준

function ensureResizeHandle(): void {
  if (window.innerWidth < SIDEBAR_BREAKPOINT) {
    document.querySelector('.sidebar-resize-handle')?.remove(); return
  }
  const sidebar = document.querySelector('.VPSidebar') as HTMLElement | null
  if (!sidebar) return                                                  // 아직 없음 → observer가 재호출
  if (sidebar.querySelector(':scope > .sidebar-resize-handle')) return  // 이미 있음(idempotent)

  console.log('[resize] attaching handle')                             // 임시 진단

  const KEY = 'vp-sidebar-width', MIN = 200, MAX = 520, DEF = 284
  const saved = localStorage.getItem(KEY)
  document.documentElement.style.setProperty('--vp-sidebar-width', `${saved ? parseInt(saved,10) : DEF}px`)

  const handle = document.createElement('div')
  handle.className = 'sidebar-resize-handle'
  sidebar.appendChild(handle)

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault()
    const x0 = e.clientX
    const w0 = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vp-sidebar-width'), 10) || DEF
    handle.classList.add('dragging')
    document.body.style.userSelect = 'none'; document.body.style.cursor = 'col-resize'
    const move = (ev: MouseEvent) =>
      document.documentElement.style.setProperty('--vp-sidebar-width',
        `${Math.min(MAX, Math.max(MIN, w0 + ev.clientX - x0))}px`)
    const up = () => {
      handle.classList.remove('dragging')
      document.body.style.userSelect = ''; document.body.style.cursor = ''
      localStorage.setItem(KEY, String(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--vp-sidebar-width'), 10)))
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  })
}

function setupSidebarResize(): void {
  ensureResizeHandle()
  // 사이드바가 늦게 뜨거나 라우트 이동으로 재렌더돼도 핸들 보장
  new MutationObserver(() => ensureResizeHandle())
    .observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', ensureResizeHandle, { passive: true })
}

/* ── Theme export ──────────────────────────────────────────── */
export default {
  ...DefaultTheme,
  enhanceApp({ app, router }) {
    app.component('ContentList',   ContentList)
    app.component('CategoryIndex', CategoryIndex)
    app.component('TagCloud',      TagCloud)
    app.component('SeriesNav',     SeriesNav)
    app.component('DocEmbed',      DocEmbed)
    if(inBrowser){
       setupSidebar(router)
       setupSidebarResize()
    }
  },
  setup() {
    const route = useRoute()
  }
} satisfies Theme