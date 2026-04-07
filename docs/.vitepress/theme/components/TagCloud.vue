<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocItem } from '../../data/content.data'

interface Props {
  items: DocItem[]
}

const props = defineProps<Props>()

const selectedTag = ref<string | null>(null)

// 태그별 카운트 집계
const tagMap = computed(() => {
  const map = new Map<string, DocItem[]>()
  for (const doc of props.items) {
    for (const tag of (doc.tags ?? [])) {
      if (!map.has(tag)) map.set(tag, [])
      map.get(tag)!.push(doc)
    }
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko')))
})

const filteredDocs = computed(() => {
  if (!selectedTag.value) return []
  return (tagMap.value.get(selectedTag.value) ?? []).sort(
    (a, b) => +new Date(b.date) - +new Date(a.date)
  )
})

function selectTag(tag: string) {
  selectedTag.value = selectedTag.value === tag ? null : tag
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// 글씨 크기: 카운트가 많을수록 크게
function tagSize(count: number): string {
  const max = Math.max(...[...tagMap.value.values()].map(v => v.length))
  const min = 1
  const ratio = max === min ? 0.5 : (count - min) / (max - min)
  const em = 0.78 + ratio * 0.55  // 0.78em ~ 1.33em
  return `${em.toFixed(2)}em`
}
</script>

<template>
  <div class="tag-cloud">
    <div class="tag-cloud__cloud">
      <button
        v-for="[tag, docs] in tagMap"
        :key="tag"
        class="tag-cloud__tag"
        :class="{ 'tag-cloud__tag--active': selectedTag === tag }"
        :style="{ fontSize: tagSize(docs.length) }"
        @click="selectTag(tag)"
      >
        #{{ tag }}
        <span class="tag-cloud__count">{{ docs.length }}</span>
      </button>
    </div>

    <!-- 태그 선택 시 문서 목록 -->
    <transition name="slide-down">
      <div v-if="selectedTag && filteredDocs.length" class="tag-cloud__results">
        <h3 class="tag-cloud__results-title">
          #{{ selectedTag }}
          <span class="tag-cloud__results-count">{{ filteredDocs.length }}건</span>
        </h3>
        <ul class="tag-cloud__results-list">
          <li v-for="doc in filteredDocs" :key="doc.url">
            <a :href="doc.url" class="tag-cloud__result-link">
              <span>{{ doc.title }}</span>
              <span class="tag-cloud__result-date">{{ formatDate(doc.date) }}</span>
            </a>
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.tag-cloud {
  margin-top: 1.5rem;
}

.tag-cloud__cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: baseline;
  margin-bottom: 1.5rem;
}

.tag-cloud__tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  line-height: 1.4;
}

.tag-cloud__tag:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.tag-cloud__tag--active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.tag-cloud__count {
  font-size: 0.7em;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}

.tag-cloud__results {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  background: var(--vp-c-bg-soft);
}

.tag-cloud__results-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tag-cloud__results-count {
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--vp-c-text-3);
}

.tag-cloud__results-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tag-cloud__result-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--vp-c-divider);
  text-decoration: none;
  color: var(--vp-c-text-1);
  font-size: 0.9rem;
  transition: color 0.15s;
}

.tag-cloud__result-link:hover {
  color: var(--vp-c-brand-1);
}

.tag-cloud__result-date {
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* 슬라이드 트랜지션 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
