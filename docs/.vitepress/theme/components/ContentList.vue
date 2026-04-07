<script setup lang="ts">
import { computed } from 'vue'
import type { DocItem } from '../../data/content.data'

interface Props {
  items:       DocItem[]
  sortBy?:     'date' | 'title' | 'order'
  descending?: boolean
  compact?:    boolean
  groupBy?:    'category' | 'section' | null
}

const props = withDefaults(defineProps<Props>(), {
  sortBy:     'date',
  descending: true,
  compact:    false,
  groupBy:    null,
})

const sorted = computed(() => {
  const list = [...props.items]
  list.sort((a, b) => {
    if (props.sortBy === 'date') {
      const diff = +new Date(b.date) - +new Date(a.date)
      return props.descending ? diff : -diff
    }
    if (props.sortBy === 'title') {
      const diff = a.title.localeCompare(b.title, 'ko')
      return props.descending ? -diff : diff
    }
    if (props.sortBy === 'order') {
      const diff = (a.order ?? 9999) - (b.order ?? 9999)
      return props.descending ? -diff : diff
    }
    return 0
  })
  return list
})

const grouped = computed(() => {
  if (!props.groupBy) return null
  const map = new Map<string, DocItem[]>()
  for (const item of sorted.value) {
    const key = String(item[props.groupBy as keyof DocItem] ?? '기타')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return map
})

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const statusLabel: Record<string, string> = {
  wip:      'WIP',
  archived: 'Archived',
}
</script>

<template>
  <!-- 그룹핑 없는 단순 목록 -->
  <div v-if="!grouped" class="content-list">
    <a
      v-for="doc in sorted"
      :key="doc.url"
      :href="doc.url"
      class="content-list__item"
      :class="{ 'content-list__item--compact': compact }"
    >
      <div class="content-list__meta">
        <span class="content-list__date">{{ formatDate(doc.date) }}</span>
        <span
          v-if="doc.status && doc.status !== 'active'"
          class="content-list__badge"
          :class="`content-list__badge--${doc.status}`"
        >{{ statusLabel[doc.status] ?? doc.status }}</span>
        <span v-if="doc.difficulty" class="content-list__badge content-list__badge--difficulty">
          {{ doc.difficulty }}
        </span>
      </div>
      <h3 class="content-list__title">{{ doc.title }}</h3>
      <p v-if="!compact && doc.description" class="content-list__desc">{{ doc.description }}</p>
      <div v-if="!compact && doc.tags?.length" class="content-list__tags">
        <span v-for="tag in doc.tags" :key="tag" class="content-list__tag">#{{ tag }}</span>
      </div>
    </a>
  </div>

  <!-- 그룹핑 목록 -->
  <div v-else class="content-list content-list--grouped">
    <section v-for="[groupKey, groupItems] in grouped" :key="groupKey" class="content-list__group">
      <h2 class="content-list__group-title">{{ groupKey }}</h2>
      <a
        v-for="doc in groupItems"
        :key="doc.url"
        :href="doc.url"
        class="content-list__item"
        :class="{ 'content-list__item--compact': compact }"
      >
        <div class="content-list__meta">
          <span class="content-list__date">{{ formatDate(doc.date) }}</span>
          <span
            v-if="doc.status && doc.status !== 'active'"
            class="content-list__badge"
            :class="`content-list__badge--${doc.status}`"
          >{{ statusLabel[doc.status] ?? doc.status }}</span>
        </div>
        <h3 class="content-list__title">{{ doc.title }}</h3>
        <p v-if="!compact && doc.description" class="content-list__desc">{{ doc.description }}</p>
        <div v-if="!compact && doc.tags?.length" class="content-list__tags">
          <span v-for="tag in doc.tags" :key="tag" class="content-list__tag">#{{ tag }}</span>
        </div>
      </a>
    </section>
  </div>
</template>

<style scoped>
.content-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 1.5rem;
}

.content-list__item {
  display: block;
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--vp-c-divider);
  text-decoration: none;
  color: inherit;
  transition: background 0.18s;
}
.content-list__item:hover .content-list__title {
  color: var(--vp-c-brand-1);
}

.content-list__item--compact {
  padding: 0.75rem 0;
}

.content-list__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.content-list__date {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.content-list__badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
}
.content-list__badge--wip      { background: var(--vp-c-yellow-soft); color: var(--vp-c-yellow-1); }
.content-list__badge--archived { background: var(--vp-c-default-soft); color: var(--vp-c-text-3); }
.content-list__badge--difficulty { background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }

.content-list__title {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.4;
  margin: 0 0 0.4rem;
  color: var(--vp-c-text-1);
  transition: color 0.18s;
}

.content-list__desc {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
  margin: 0 0 0.5rem;
  line-height: 1.6;
}

.content-list__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.content-list__tag {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
}

.content-list--grouped .content-list__group {
  margin-bottom: 2rem;
}

.content-list__group-title {
  font-size: 1.1rem;
  font-weight: 700;
  text-transform: capitalize;
  border-bottom: 2px solid var(--vp-c-brand-1);
  padding-bottom: 0.4rem;
  margin-bottom: 0.25rem;
}
</style>
