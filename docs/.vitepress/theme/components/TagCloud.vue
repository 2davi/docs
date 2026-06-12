<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import ContentList from './ContentList.vue'
import type { DocItem } from '../../data/content.data'

interface Props {
  items: DocItem[]
  limit?: number      // 상위 N개만 표시 (홈 진입점용). 0 = 전체
  navigate?: boolean  // true: 필터 대신 /tags/#tag 로 이동하는 링크 모드 (홈용)
  foldAt?: number     // 이 개수 초과 시 접기. 0 = 접기 없음
}
const props = withDefaults(defineProps<Props>(), { limit: 0, navigate: false, foldAt: 15 })

type View = 'cloud' | 'bars'
const view = ref<View>('cloud')
const selectedTag = ref<string | null>(null)
const expanded = ref(false)

/* ── 반응형 분기: 960px — 아래 CSS 미디어쿼리와 반드시 같은 값 유지 ── */
const DESKTOP_MQ = '(min-width: 960px)'
const isDesktop = ref(true)   // SSR 기본값. 패널/시트는 마운트 후에만 열리므로 hydration 불일치 없음
let mq: MediaQueryList | null = null
const syncMq = () => { isDesktop.value = mq?.matches ?? true }

/* ── 집계 ── */
const tagMap = computed(() => {
  const map = new Map<string, DocItem[]>()
  for (const doc of props.items)
    for (const tag of doc.tags ?? []) {
      if (!map.has(tag)) map.set(tag, [])
      map.get(tag)!.push(doc)
    }
  return map
})

/* 사용량 내림차순(동률 시 이름순) → limit */
const ranked = computed(() => {
  const arr = [...tagMap.value.entries()]
    .sort(([ta, da], [tb, db]) => db.length - da.length || ta.localeCompare(tb, 'ko'))
  return props.limit > 0 ? arr.slice(0, props.limit) : arr
})

/* 접기: 랭킹 상위 N 슬라이스 */
const visible = computed(() =>
  (!props.foldAt || expanded.value) ? ranked.value : ranked.value.slice(0, props.foldAt)
)
const hiddenCount = computed(() => ranked.value.length - visible.value.length)
const maxCount    = computed(() => ranked.value[0]?.[1].length ?? 1)

const filteredDocs = computed(() =>
  selectedTag.value ? [...(tagMap.value.get(selectedTag.value) ?? [])] : []
)
const panelOpen = computed(() => !props.navigate && !!selectedTag.value)

/* ── 해시 ↔ 선택 동기화 (해시가 진실의 원천) ── */
const readHash = () => {
  const h = decodeURIComponent((location.hash || '').replace(/^#/, '')) || null
  selectedTag.value = h
  // 딥링크된 태그가 접힌 구간이면 펼쳐서 활성 칩이 보이게
  if (h && props.foldAt && !expanded.value) {
    const idx = ranked.value.findIndex(([t]) => t === h)
    if (idx >= props.foldAt) expanded.value = true
  }
}

function selectTag(tag: string) {
  const next = selectedTag.value === tag ? '' : '#' + encodeURIComponent(tag)
  if ((location.hash || '') === next) return
  location.hash = next   // → hashchange → readHash. 히스토리에 쌓여 뒤로가기 = 닫기/이전 태그
}

function closePanel() {
  if (location.hash) location.hash = ''   // URL 끝에 '#' 잔재가 남지만 무해한 외관 문제
  else selectedTag.value = null
}

/* 데스크탑 패널 전용 ESC. 모바일 시트는 <dialog>가 네이티브로 처리 */
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isDesktop.value && selectedTag.value) closePanel()
}

/* ── 모바일 시트(<dialog>) 제어 ── */
const sheetEl = ref<HTMLDialogElement | null>(null)

watch([selectedTag, isDesktop], () => {
  const el = sheetEl.value
  if (!el) return
  const show = !props.navigate && !!selectedTag.value && !isDesktop.value
  if (show && !el.open) el.showModal()    // 이미 열린 dialog에 재호출하면 throw → open 가드
  if (!show && el.open) el.close()
  document.body.style.overflow = show ? 'hidden' : ''  // showModal은 배경 스크롤을 안 막는다
}, { flush: 'post' })

const onSheetClose = () => { if (selectedTag.value) closePanel() }                 // ESC 네이티브 닫힘 → 해시 동기화
const onSheetClick = (e: MouseEvent) => { if (e.target === sheetEl.value) closePanel() } // 백드롭 클릭 = 닫기

onMounted(() => {
  mq = window.matchMedia(DESKTOP_MQ)
  syncMq()
  mq.addEventListener('change', syncMq)
  if (!props.navigate) {
    readHash()
    window.addEventListener('hashchange', readHash)
    window.addEventListener('keydown', onKey)
  }
})
onUnmounted(() => {
  mq?.removeEventListener('change', syncMq)
  window.removeEventListener('hashchange', readHash)
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})

const tagHref = (tag: string) => '/tags/#' + encodeURIComponent(tag)

function tagSize(count: number): string {
  const max = maxCount.value
  const ratio = max === 1 ? 0.5 : (count - 1) / (max - 1)
  return `${(0.78 + ratio * 0.55).toFixed(2)}em`
}
</script>

<template>
  <div class="tag-cloud" :class="{ 'tag-cloud--open': panelOpen }">
    <!-- ════ 좌: 태그 목록 (마스터) ════ -->
    <div class="tag-cloud__list">
      <div v-if="!navigate" class="tag-cloud__toolbar">
        <button class="tc-view" :class="{ 'tc-view--active': view === 'cloud' }" @click="view = 'cloud'">클라우드</button>
        <span class="tc-view__sep">|</span>
        <button class="tc-view" :class="{ 'tc-view--active': view === 'bars' }"  @click="view = 'bars'">사용량</button>
      </div>

      <!-- 모드 A: 클라우드 -->
      <div v-if="view === 'cloud' || navigate" class="tag-cloud__cloud">
        <template v-if="navigate">
          <a v-for="[tag, docs] in visible" :key="tag" :href="tagHref(tag)"
             class="tag-cloud__tag" :style="{ fontSize: tagSize(docs.length) }">
            #{{ tag }} <span class="tag-cloud__count">{{ docs.length }}</span>
          </a>
          <a v-if="limit > 0 && tagMap.size > limit" href="/tags/" class="tag-cloud__more">전체 보기 →</a>
        </template>
        <template v-else>
          <button v-for="[tag, docs] in visible" :key="tag"
                  class="tag-cloud__tag" :class="{ 'tag-cloud__tag--active': selectedTag === tag }"
                  :style="{ fontSize: tagSize(docs.length) }" @click="selectTag(tag)">
            #{{ tag }} <span class="tag-cloud__count">{{ docs.length }}</span>
          </button>
        </template>
      </div>

      <!-- 모드 B: 사용량 비교 -->
      <ul v-else class="tag-cloud__bars">
        <li v-for="[tag, docs] in visible" :key="tag">
          <button class="tc-bar" :class="{ 'tc-bar--active': selectedTag === tag }" @click="selectTag(tag)">
            <span class="tc-bar__label">#{{ tag }}</span>
            <span class="tc-bar__track">
              <span class="tc-bar__fill" :style="{ width: (docs.length / maxCount * 100) + '%' }" />
            </span>
            <span class="tc-bar__count">{{ docs.length }}</span>
          </button>
        </li>
      </ul>

      <button v-if="!navigate && foldAt && ranked.length > foldAt"
              class="tag-cloud__fold" @click="expanded = !expanded">
        {{ expanded ? '접기 ▴' : `+ ${hiddenCount}개 더 보기 ▾` }}
      </button>
    </div>

    <!-- ════ 우: 결과 패널 (디테일, 데스크탑 ≥960px 전용) ════ -->
    <aside v-if="!navigate" class="tag-cloud__panel" aria-label="태그 문서 목록">
      <div class="tag-cloud__panel-inner">
        <div class="tag-cloud__panel-head">
          <h3 class="tag-cloud__results-title">
            #{{ selectedTag }} <span class="tag-cloud__results-count">{{ filteredDocs.length }}건</span>
          </h3>
          <button class="tag-cloud__close" aria-label="닫기" @click="closePanel">✕</button>
        </div>
        <div class="tag-cloud__panel-body">
          <ContentList v-if="filteredDocs.length" :items="filteredDocs" compact />
          <p v-else class="tag-cloud__empty">이 태그가 달린 문서가 없어요.</p>
        </div>
      </div>
    </aside>

    <!-- ════ 모바일 시트: 같은 상태의 다른 표현 (패널과 의도적 중복 — Locality 우선) ════ -->
    <dialog v-if="!navigate" ref="sheetEl" class="tag-cloud__sheet"
            aria-label="태그 문서 목록" @close="onSheetClose" @click="onSheetClick">
      <div class="tag-cloud__sheet-inner">
        <div class="tag-cloud__panel-head">
          <h3 class="tag-cloud__results-title">
            #{{ selectedTag }} <span class="tag-cloud__results-count">{{ filteredDocs.length }}건</span>
          </h3>
          <button class="tag-cloud__close" aria-label="닫기" @click="closePanel">✕</button>
        </div>
        <div class="tag-cloud__panel-body">
          <ContentList v-if="filteredDocs.length" :items="filteredDocs" compact />
          <p v-else class="tag-cloud__empty">이 태그가 달린 문서가 없어요.</p>
        </div>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.tag-cloud { margin-top: 1.5rem; }

/* ── 마스터-디테일: 960px↑ — script의 DESKTOP_MQ와 같은 값 유지 ── */
@media (min-width: 960px) {
  .tag-cloud { display: flex; align-items: flex-start; }  /* flex-start: sticky 동작 조건 */
  .tag-cloud__list { flex: 1; min-width: 0; }

  .tag-cloud__panel {
    flex: 0 0 auto;
    width: 0; opacity: 0; margin-left: 0;
    overflow: hidden;
    transition: width .3s ease, opacity .25s ease, margin-left .3s ease;
    position: sticky;
    top: calc(var(--vp-nav-height) + 24px);
    max-height: calc(100dvh - var(--vp-nav-height) - 48px);
  }
  .tag-cloud--open .tag-cloud__panel { width: 500px; opacity: 1; margin-left: 1.5rem; }

  /* 내부 고정폭 = '커튼 걷기': 바깥 width 트랜지션 중 내용 재줄바꿈 방지 */
  .tag-cloud__panel-inner {
    width: 500px;
    display: flex; flex-direction: column;
    max-height: inherit;
    border: 1px solid var(--vp-c-divider); border-radius: 8px;
    background: var(--vp-c-bg-soft);
  }
}
@media (max-width: 959px) {
  .tag-cloud__panel { display: none; }   /* 모바일은 시트가 담당 */
}

/* ── 패널/시트 공용 머리·몸통 ── */
.tag-cloud__panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: .85rem 1.1rem; border-bottom: 1px solid var(--vp-c-divider);
  flex: 0 0 auto;
}
.tag-cloud__panel-body { padding: 0 1.1rem .85rem; overflow-y: auto; }
.tag-cloud__panel-body :deep(.content-list) { margin-top: .25rem; }
.tag-cloud__results-title { font-size: .95rem; font-weight: 700; margin: 0; display: flex; align-items: center; gap: .5rem; }
.tag-cloud__results-count { font-size: .78rem; font-weight: 400; color: var(--vp-c-text-3); }
.tag-cloud__close {
  background: none; border: none; cursor: pointer; padding: .2rem .4rem;
  color: var(--vp-c-text-3); font-size: .9rem; line-height: 1; border-radius: 4px;
}
.tag-cloud__close:hover { color: var(--vp-c-text-1); background: var(--vp-c-bg-mute); }
.tag-cloud__empty { font-size: .85rem; color: var(--vp-c-text-3); margin: .75rem 0; }

/* ── 모바일 시트: 하단 고정 바텀시트 ── */
.tag-cloud__sheet {
  width: 100%; max-width: 100%;
  height: 85vh; height: 85dvh;        /* dvh 미지원 폴백 */
  max-height: 85dvh;
  margin: auto 0 0;                    /* top:auto → 하단 고정 */
  padding: 0; border: none;
  border-radius: 16px 16px 0 0;
  background: var(--vp-c-bg); color: var(--vp-c-text-1);
}
.tag-cloud__sheet::backdrop { background: rgba(0, 0, 0, .45); }
.tag-cloud__sheet[open] { animation: tc-sheet-up .25s ease; }
@keyframes tc-sheet-up { from { transform: translateY(24px); opacity: 0; } }
.tag-cloud__sheet-inner { display: flex; flex-direction: column; height: 100%; }

/* ── 툴바 ── */
.tag-cloud__toolbar { display: flex; justify-content: flex-end; align-items: center; gap: .4rem; margin-bottom: .75rem; }
.tc-view { background: none; border: none; cursor: pointer; padding: 0; font-size: .78rem; font-family: inherit; color: var(--vp-c-text-3); transition: color .15s; }
.tc-view:hover   { color: var(--vp-c-text-2); }
.tc-view--active { color: var(--vp-c-brand-1); font-weight: 600; }
.tc-view__sep    { color: var(--vp-c-divider); font-size: .78rem; }

/* ── 클라우드 ── */
.tag-cloud__cloud { display: flex; flex-wrap: wrap; gap: .5rem .75rem; align-items: baseline; margin-bottom: .75rem; }
.tag-cloud__tag {
  display: inline-flex; align-items: center; gap: .25rem;
  padding: .2rem .55rem; border-radius: 9999px;
  border: 1px solid var(--vp-c-divider);
  background: transparent; color: var(--vp-c-text-2);
  cursor: pointer; transition: all .15s;
  font-family: inherit; line-height: 1.4; text-decoration: none;
}
.tag-cloud__tag:hover,
.tag-cloud__tag--active { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.tag-cloud__tag--active { font-weight: 600; }
.tag-cloud__count { font-size: .7em; color: var(--vp-c-text-3); font-variant-numeric: tabular-nums; }
.tag-cloud__more  { font-size: .8rem; color: var(--vp-c-brand-1); text-decoration: none; align-self: center; }

/* ── 사용량 막대 ── */
.tag-cloud__bars { list-style: none; padding: 0; margin: 0 0 .75rem; }
.tc-bar {
  display: grid; grid-template-columns: 9rem 1fr 2.5rem;
  align-items: center; gap: .75rem; width: 100%;
  background: none; border: none; cursor: pointer;
  padding: .3rem .25rem; font-family: inherit;
  border-bottom: 1px solid var(--vp-c-divider);
}
.tc-bar__label { text-align: left; font-size: .85rem; color: var(--vp-c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-bar:hover .tc-bar__label, .tc-bar--active .tc-bar__label { color: var(--vp-c-brand-1); }
.tc-bar__track { height: 8px; border-radius: 4px; background: var(--vp-c-bg-mute); overflow: hidden; }
.tc-bar__fill  { display: block; height: 100%; background: var(--vp-c-brand-1); border-radius: 4px; transition: width .3s ease; }
.tc-bar__count { text-align: right; font-size: .78rem; color: var(--vp-c-text-3); font-variant-numeric: tabular-nums; }

/* ── 접기 ── */
.tag-cloud__fold {
  display: block; margin: .25rem auto 0;
  background: none; border: none; cursor: pointer;
  font-size: .78rem; font-family: inherit; color: var(--vp-c-text-3);
}
.tag-cloud__fold:hover { color: var(--vp-c-brand-1); }
</style>