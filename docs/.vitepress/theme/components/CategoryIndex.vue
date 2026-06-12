<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { DocItem } from '../../data/content.data'
import { sortRecent, sortToc } from '../utils/docSort'

interface Props {
  items: DocItem[]
  groupBy?: 'category' | 'section'
  flat?: boolean              // 카테고리 페이지: 그룹 헤더 없이 단일 목록
}
const props = withDefaults(defineProps<Props>(), { groupBy: 'category', flat: false })

type SortMode = 'toc' | 'recent'
const sortMode = ref<SortMode>('toc')   // 기본 = 목차(series_order)

const topKey  = (d: DocItem) => String(d[props.groupBy as keyof DocItem] ?? '기타').split('/')[0]
const subCat  = (d: DocItem) => {
  const parts = String(d[props.groupBy as keyof DocItem] ?? '').split('/')
  return parts.length > 1 ? parts.slice(1).join('/') : ''
}

const sortDocs = (list: DocItem[]) =>
  sortMode.value === 'recent' ? sortRecent(list) : sortToc(list)

const grouped = computed<Map<string, DocItem[]>>(() => {
  const list = visible.value                          // ← props.items 대신 '필터 반영된' 목록
  // 필터 걸렸거나(특정 카테고리 진입) flat prop이면 → 단일 목록(헤더 숨김)
  if (props.flat || activeFilter.value) {
    return new Map([['', sortDocs(list)]])
  }
  // 전체 뷰(해시 없음): 최상위 폴더(linux / blog-ops)로 그룹
  const map = new Map<string, DocItem[]>()
  for (const d of list) {
    const k = topFolder(d)                            // ← topKey(category) → topFolder(URL)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(d)
  }
  return new Map(
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([k, v]) => [k, sortDocs(v)] as [string, DocItem[]])
  )
})

const formatDate = (s: string) =>
  s ? new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : ''


const activeFilter = ref('')                       // 해시의 폴더경로, '' = 전체
const readHash = () => { activeFilter.value = decodeURIComponent((location.hash || '').replace(/^#/, '')) }
onMounted(() => { readHash(); updateHeading(); window.addEventListener('hashchange', readHash) })
onUnmounted(() => window.removeEventListener('hashchange', readHash))

const notesPath = (d: DocItem) => d.url.replace(/^\/notes\//, '').replace(/\.html$/, '')
const topFolder = (d: DocItem) => notesPath(d).split('/')[0]    // 'linux' | 'blog-ops'

const visible = computed(() => {
  if (!activeFilter.value) return props.items
  const pre = activeFilter.value + '/'
  return props.items.filter(d => { const p = notesPath(d); return p === activeFilter.value || p.startsWith(pre) })
})
// grouped: 필터 있으면 flat, 없으면 topFolder로 그룹 (기존 topKey를 topFolder로 교체)

function updateHeading() {
  const h = document.getElementById('notes')
  if (!h) return
  const seg   = activeFilter.value.split('/').pop() ?? ''
  const label = activeFilter.value ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'Notes'
  const text  = [...h.childNodes].find(n => n.nodeType === 3) // TEXT_NODE만
  if (text) text.nodeValue = label + ' '
}
watch(activeFilter, updateHeading)

// difficulty 표시 약어 (frontmatter 원본은 유지 → lv- 색 매핑·컨벤션 그대로)
const DIFF_LABEL: Record<string, string> = {
  beginner:     'beginner',
  intermediate: 'intermed.',
  advanced:     'advanced',
  expert:       'expert',
}
const diffLabel = (d?: string) => DIFF_LABEL[d ?? ''] ?? (d ?? '')
</script>

<template>
  <div class="category-index">
    <!-- 정렬 토글: 한 줄, 우측 정렬 -->
    <div class="ci-toolbar">
      <button class="ci-sort" :class="{ 'ci-sort--active': sortMode === 'toc' }"    @click="sortMode = 'toc'">목차</button>
      <span class="ci-sort__sep">|</span>
      <button class="ci-sort" :class="{ 'ci-sort--active': sortMode === 'recent' }" @click="sortMode = 'recent'">최근</button>
    </div>

    <section v-for="[catKey, catItems] in grouped" :key="catKey || '_flat'" class="category-index__section">
      <h2 v-if="!flat && catKey" class="category-index__heading">
        <span class="category-index__heading-text">{{ catKey }}</span>
        <span class="category-index__count">{{ catItems.length }}</span>
      </h2>

      <ul class="category-index__list">
        <li v-for="(doc, idx) in catItems" :key="doc.url" class="category-index__item">
          <a :href="doc.url" class="category-index__link">
            <span class="category-index__num">{{ idx + 1 }}</span>

            <!-- 뱃지 슬롯: subcat ⇄ difficulty (hover 1초 후 crossfade) -->
            <span v-if="subCat(doc) || doc.difficulty" class="ci-morph ci-morph--badge">
              <template v-if="subCat(doc)">
                <span class="ci-morph__a category-index__subcat">{{ subCat(doc) }}</span>
                <span v-if="doc.difficulty" class="ci-morph__b category-index__difficulty" :class="'lv-' + doc.difficulty" :title="doc.difficulty">{{ diffLabel(doc.difficulty) }}</span>
              </template>
              <span v-else class="category-index__difficulty" :class="'lv-' + doc.difficulty" :title="doc.difficulty">{{ diffLabel(doc.difficulty) }}</span>
            </span>

            <span class="category-index__title">{{ doc.title }}</span>

            <span class="category-index__right">
              <span v-if="doc.status === 'wip'" class="category-index__wip">WIP</span>
              <!-- 날짜 슬롯: date(작성 시작일) ⇄ lastmod(수정일) -->
              <span class="ci-morph ci-morph--date">
                <span class="ci-morph__a category-index__date">{{ formatDate(doc.date) }}</span>
                <span class="ci-morph__b category-index__date category-index__date--mod">{{ formatDate(doc.lastmod || doc.date) }}</span>
              </span>
            </span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.category-index {
  margin-top: 1.5rem;
}

.category-index__section {
  margin-bottom: 2.5rem;
}

.category-index__heading {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.05rem;
  font-weight: 700;
  text-transform: capitalize;
  padding-bottom: 0.4rem;
  border-bottom: 2px solid var(--vp-c-brand-1);
  margin-bottom: 0.5rem;
}

.category-index__heading-text {
  color: var(--vp-c-text-1);
}

.category-index__count {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.05rem 0.5rem;
  border-radius: 9999px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-variant-numeric: tabular-nums;
}

.category-index__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-index__item {
  border-bottom: 1px solid var(--vp-c-divider);
}

.category-index__link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 0.25rem;
  text-decoration: none;
  color: inherit;
  transition: color 0.18s;
}

.category-index__link:hover .category-index__title {
  color: var(--vp-c-brand-1);
}

.category-index__title {
  font-size: 0.95rem;
  color: var(--vp-c-text-1);
  transition: color 0.18s;
  flex: 1;
}

.category-index__right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.category-index__wip {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  background: var(--vp-c-yellow-soft);
  color: var(--vp-c-yellow-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.category-index__version {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

.category-index__date {
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
  min-width: 6rem;
  text-align: right;
}

.category-index__num {
  flex-shrink: 0;
  width: 1.6rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  opacity: 0.7;
  text-align: right;
  padding-right: 0.5rem;
}

.category-index__link:hover .category-index__num {
  opacity: 1;
}

.category-index__subcat {
  flex-shrink: 0;
  width: 5rem;           /* ← 고정 너비 추가 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;    /* ← 열 안에서 중앙 정렬 */
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--vp-c-text-3);
  padding: 0.05rem 0.45rem;
  border-radius: var(--dv-radius-sm);
  background: var(--vp-c-bg-mute);
  margin-right: 0.25rem;
}
/* ── 정렬 토글 ── */
.ci-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.ci-sort {
  background: none; border: none; cursor: pointer; padding: 0;
  font-size: 0.78rem; font-family: inherit;
  color: var(--vp-c-text-3); transition: color 0.15s;
}
.ci-sort:hover            { color: var(--vp-c-text-2); }
.ci-sort--active          { color: var(--vp-c-brand-1); font-weight: 600; }
.ci-sort__sep             { color: var(--vp-c-divider); font-size: 0.78rem; }

/* ── hover morph: 1초 hold 후 crossfade, 마우스 떼면 즉시 복귀 ── */
.ci-morph              { position: relative; display: inline-flex; align-items: center; }
.ci-morph__a,
.ci-morph__b           { transition: opacity 0.4s ease; transition-delay: 0s; }
.ci-morph__a           { opacity: 1; }
.ci-morph__b           { position: absolute; top: 50%; transform: translateY(-50%); opacity: 0; white-space: nowrap; }
.category-index__item:hover .ci-morph__a { opacity: 0; transition-delay: 0.4s; }
.category-index__item:hover .ci-morph__b { opacity: 1; transition-delay: 0.4s; }

/* 날짜 슬롯: 우측 정렬, b는 오른쪽에 겹침 */
.ci-morph--date        { min-width: 6rem; justify-content: flex-end; }
.ci-morph--date .ci-morph__b { right: 0; }
.category-index__date--mod   { color: var(--vp-c-text-2); }   /* 수정일 = 더 진한 회색 */

/* 뱃지 슬롯: 좌측 정렬, b는 왼쪽에 겹침 */
.ci-morph--badge       { width: 5rem; }
.ci-morph--badge .ci-morph__b { left: 0; }
.category-index__difficulty {
  font-size: 0.72rem; font-weight: 600;
  padding: 0.05rem 0.45rem; border-radius: var(--dv-radius-sm);
  background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1);
}

/* 기본(폴백) */
.category-index__difficulty {
  font-weight: 600;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
/* 난이도 4단계 — 낮음→높음 */
.category-index__difficulty.lv-beginner     { background: var(--vp-c-green-soft);  color: var(--vp-c-green-1); }
.category-index__difficulty.lv-intermediate { background: var(--vp-c-indigo-soft); color: var(--vp-c-indigo-1); }
.category-index__difficulty.lv-advanced     { background: var(--vp-c-yellow-soft); color: var(--vp-c-yellow-1); }
.category-index__difficulty.lv-expert       { background: var(--vp-c-red-soft);    color: var(--vp-c-red-1); }
</style>
