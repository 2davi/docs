<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import type { DocItem } from '../../data/content.data'

interface Props {
  items: DocItem[]     // 전체 문서 목록 (content.data에서 넘겨줌)
}

const props = defineProps<Props>()
const { page } = useData()

// 현재 페이지와 같은 시리즈의 문서만 series_order 순서로 정렬
const seriesItems = computed(() => {
  const currentUrl = page.value.relativePath.replace(/\.md$/, '').replace(/^/, '/')
  const currentDoc = props.items.find(d => d.url === currentUrl || `/${d.url}` === currentUrl)
  if (!currentDoc?.series) return []

  return props.items
    .filter(d => d.series === currentDoc.series)
    .sort((a, b) => (a.seriesOrder ?? 9999) - (b.seriesOrder ?? 9999))
})

const currentIndex = computed(() => {
  const path = page.value.relativePath.replace(/\.md$/, '')
  return seriesItems.value.findIndex(d => d.url.includes(path) || path.includes(d.url.replace(/^\//, '')))
})

const prev = computed(() => currentIndex.value > 0 ? seriesItems.value[currentIndex.value - 1] : null)
const next = computed(() => currentIndex.value < seriesItems.value.length - 1 ? seriesItems.value[currentIndex.value + 1] : null)
const hasSeries = computed(() => seriesItems.value.length > 1)
</script>

<template>
  <div v-if="hasSeries" class="series-nav">
    <!-- 시리즈 전체 목록 -->
    <div class="series-nav__toc">
      <p class="series-nav__series-name">
        📚 시리즈: <strong>{{ seriesItems[0]?.series }}</strong>
      </p>
      <ol class="series-nav__list">
        <li
          v-for="(doc, idx) in seriesItems"
          :key="doc.url"
          class="series-nav__list-item"
          :class="{ 'series-nav__list-item--current': idx === currentIndex }"
        >
          <a v-if="idx !== currentIndex" :href="doc.url" class="series-nav__list-link">
            {{ idx + 1 }}. {{ doc.title }}
          </a>
          <span v-else class="series-nav__list-current">
            {{ idx + 1 }}. {{ doc.title }}
          </span>
        </li>
      </ol>
    </div>

    <!-- 이전 / 다음 네비게이션 -->
    <div class="series-nav__pager">
      <a v-if="prev" :href="prev.url" class="series-nav__prev">
        <span class="series-nav__arrow">←</span>
        <span class="series-nav__pager-inner">
          <span class="series-nav__pager-label">이전</span>
          <span class="series-nav__pager-title">{{ prev.title }}</span>
        </span>
      </a>
      <div v-else class="series-nav__placeholder" />

      <a v-if="next" :href="next.url" class="series-nav__next">
        <span class="series-nav__pager-inner series-nav__pager-inner--right">
          <span class="series-nav__pager-label">다음</span>
          <span class="series-nav__pager-title">{{ next.title }}</span>
        </span>
        <span class="series-nav__arrow">→</span>
      </a>
      <div v-else class="series-nav__placeholder" />
    </div>
  </div>
</template>

<style scoped>
.series-nav {
  margin-top: 3rem;
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 2rem;
}

.series-nav__toc {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}

.series-nav__series-name {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.75rem;
}

.series-nav__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.series-nav__list-item {
  font-size: 0.9rem;
}

.series-nav__list-link {
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.15s;
}
.series-nav__list-link:hover {
  color: var(--vp-c-brand-1);
}

.series-nav__list-current {
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

.series-nav__pager {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.series-nav__prev,
.series-nav__next {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  flex: 1;
  max-width: 48%;
  transition: border-color 0.15s, background 0.15s;
}

.series-nav__prev:hover,
.series-nav__next:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.series-nav__next {
  justify-content: flex-end;
  text-align: right;
}

.series-nav__placeholder {
  flex: 1;
  max-width: 48%;
}

.series-nav__arrow {
  font-size: 1.1rem;
  color: var(--vp-c-brand-1);
  flex-shrink: 0;
}

.series-nav__pager-inner {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.series-nav__pager-inner--right {
  align-items: flex-end;
}

.series-nav__pager-label {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.series-nav__pager-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
</style>
