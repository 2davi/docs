import DefaultTheme from 'vitepress/theme'
import { onMounted, nextTick, watch } from 'vue'
import { useRoute, inBrowser, useRouter }   from 'vitepress'
import type { Theme } from 'vitepress'
import ContentList    from './components/ContentList.vue'
import CategoryIndex  from './components/CategoryIndex.vue'
import TagCloud       from './components/TagCloud.vue'
import SeriesNav      from './components/SeriesNav.vue'
import './style.css'
import DocEmbed  from './components/DocEmbed.vue'
import DocLayout from './DocLayout.vue'

import 'photoswipe/style.css'

const isCoarse = () => window.matchMedia('(pointer: coarse)').matches

function docImages(): HTMLImageElement[] {
  return [...document.querySelectorAll<HTMLImageElement>('.vp-doc img')]
    .filter(img => !img.closest('a') && !img.classList.contains('no-zoom'))
}

/** 2026-06-22;
 * 1. photoswipe 초기 사진 크기를 뷰포트의 90%로 고정
 * 2. 모바일 환경의 photoswipe 패널 닫기 -> 빈 영역 터치
 * 3. Tag, photoswipe 뒤로가기 기능 오류 -> pushState로 직접 관리
 */
const LIGHTBOX_VIEWPORT_RATIO = 0.9;

function lightboxSize(img: HTMLImageElement): {width: number; height: number} {
  const maxW = window.innerWidth * LIGHTBOX_VIEWPORT_RATIO;
  const maxH = window.innerHeight * LIGHTBOX_VIEWPORT_RATIO;

  // 기준 ─ 종횡비: SVG는 intrinsic 픽셀이 0
  let rw = img.naturalWidth;
  let rh = img.naturalHeight;
  if(!rw || !rh) {
    const r = img.getBoundingClientRect();
    rw = r.width || 4;
    rh = r.height || 3;
  }
  const ratio = rw/rh;

  // maxW * maxH 박스에 img의 종횡비를 유지하며 내접시킨다.
  let w = maxW
  let h = maxW / ratio;
  if(h > maxH) { h = maxH; w = maxH * ratio; }

  return { width: Math.round(w), height: Math.round(h) };
}

async function openLightbox(clicked: HTMLImageElement): Promise<void> {
  const imgs = docImages()
  const index = imgs.indexOf(clicked)
  if (index < 0) return

  //2026-06-24; 비동기 시점과 뒤로가기 기능(패널 닫기)의 어긋남 디버깅
  history.replaceState({ ...history.state, scrollPosition: window.scrollY }, '');
  history.pushState({ pswp: true }, '');
  // PhotoSwipe 패널 활성화 시 뒤로가기 == 닫기. pushState로 항목을 쌓고 popstate로 닫는다.
  let viaPop = false;
  const onPop = () => { viaPop = true, pswp.close() };
  window.addEventListener('popstate', onPop);



  const { default: PhotoSwipe } = await import('photoswipe')  // 열 때만 로드(코드 스플릿)

  const pswp = new PhotoSwipe({            // 2026-06-22; new PhotoSwipe를 pswp 변수로 받는다.
    dataSource: imgs.map(img => {
      const { width, height } = lightboxSize(img)    // 2026-06-22; 사진의 가로*세로 크기를 계산한다.
      return {
        src: img.currentSrc || img.src,
        msrc: img.currentSrc || img.src,     // 로딩 중 플레이스홀더
        width,//:  img.naturalWidth  || 1600,   // SVG처럼 intrinsic 0이면 안전값
        height,//: img.naturalHeight || 1200,
        element: img,                        // 썸네일 → 확대 애니메이션 기준점
        alt: img.alt,
      }
    }),
    index,
    showHideAnimationType: 'zoom',
    wheelToZoom: true,        // 데스크탑: Ctrl 없이 휠로 배율
    initialZoomLevel: 'fit',  // 열릴 때 화면 맞춤
    secondaryZoomLevel: 2,    // 더블클릭/더블탭 토글 배율 (원본의 2배)
    maxZoomLevel: 5,
    bgOpacity: 0.92,
    padding: { top: 24, bottom: 24, left: 24, right: 24 },

    //2026-06-22; 모바일 환경에서 PhotoSwipe 패널 닫기. (배경을 탭하여 닫기)
    //tapAction: 'close',
    bgClickAction: 'close',
  })//.init() //2026-06-22; 뒤로가기 기능을 이벤트로 부여한 뒤에 init() 시켜준다.

  //2026-06-24; 비동기 선언 전으로 이동한다.
  // pswp.on('beforeOpen', () => {
  //   //2026-06-23; VitePress의 Scroll Restoration 로직을 사용하기 위해, 엔트리에 스크롤 좌표 저장.
  //   history.replaceState({ ...history.state, scrollPosition: window.scrollY }, '');
  //   history.pushState({ pswp: true }, '');
  //   window.addEventListener('popstate', onPop);
  // });
  pswp.on('destroy', () => {
    window.removeEventListener('popstate', onPop);
    if(!viaPop && history.state?.pswp) history.back();
  });

  pswp.init();
}
/* 2026-06-22; END. */

function setupImageLightbox(): void {
  // 데스크탑(정밀 포인터): 클릭 즉시
  document.addEventListener('click', (e) => {
    if (isCoarse()) return
    const img = (e.target as HTMLElement).closest?.('.vp-doc img') as HTMLImageElement | null
    if (img && !img.closest('a') && !img.classList.contains('no-zoom')) {
      e.preventDefault()
      openLightbox(img)
    }
  })
  // 모바일: 더블탭 수동 판정 — iOS Safari는 dblclick 이벤트를 안 쏜다
  let t0 = 0, x0 = 0, y0 = 0
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return
    const img = (e.target as HTMLElement).closest?.('.vp-doc img') as HTMLImageElement | null
    if (!img || img.closest('a') || img.classList.contains('no-zoom')) return
    const now = performance.now()
    const double = now - t0 < 350 && Math.hypot(e.clientX - x0, e.clientY - y0) < 32
    t0 = double ? 0 : now
    x0 = e.clientX; y0 = e.clientY
    if (double) openLightbox(img)
  })
}

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
  router.onAfterRouteChanged = () => {setTimeout(syncActive, 0)} // 라우트 바뀌면 사이드바 재생성 → 재반영
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
  Layout: DocLayout,
  enhanceApp({ app, router }) {
    app.component('ContentList',   ContentList)
    app.component('CategoryIndex', CategoryIndex)
    app.component('TagCloud',      TagCloud)
    app.component('SeriesNav',     SeriesNav)
    app.component('DocEmbed',      DocEmbed)
    if(inBrowser){
       setupSidebar(router)
       setupSidebarResize()
       setupImageLightbox()
    }
  },
  setup() {
    const route = useRoute()
  }
} satisfies Theme