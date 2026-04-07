<script setup lang="ts">
import { computed } from 'vue'
import type { DocItem } from '../../data/content.data'

interface Props {
  items:   DocItem[]
  groupBy?: 'category' | 'section'
}

const props = withDefaults(defineProps<Props>(), {
  groupBy: 'category',
})

const grouped = computed(() => {
  const map = new Map<string, DocItem[]>()
  const list = [...props.items].sort((a, b) =>
    a.title.localeCompare(b.title, 'ko')
  )
  for (const item of list) {
    const key = String(item[props.groupBy as keyof DocItem] ?? '기타')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  // 카테고리명 알파벳 정렬
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko')))
})

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
</script>

<template>
  <div class="category-index">
    <section
      v-for="[catKey, catItems] in grouped"
      :key="catKey"
      class="category-index__section"
    >
      <h2 class="category-index__heading">
        <span class="category-index__heading-text">{{ catKey }}</span>
        <span class="category-index__count">{{ catItems.length }}</span>
      </h2>

      <ul class="category-index__list">
        <li v-for="doc in catItems" :key="doc.url" class="category-index__item">
          <a :href="doc.url" class="category-index__link">
            <span class="category-index__title">{{ doc.title }}</span>
            <span class="category-index__right">
              <span v-if="doc.status === 'wip'" class="category-index__wip">WIP</span>
              <span v-if="doc.version" class="category-index__version">{{ doc.version }}</span>
              <span class="category-index__date">{{ formatDate(doc.lastmod || doc.date) }}</span>
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
</style>
