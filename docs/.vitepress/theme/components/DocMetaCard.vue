<!--
  DocMetaCard.vue
  ─────────────────────────────────────────────────────────────────────────
  문서 frontmatter를 읽어 상단 메타 카드를 그린다.
  - 렌더 규칙은 docMeta.config.ts(SSOT)에서만 온다 → 템플릿에 doc_type 분기 하드코딩 없음.
  - doc_type이 매트릭스에 없거나(article 등) 표시할 값이 하나도 없으면 → 아무것도 렌더 안 함.
  배치 위치: docs/.vitepress/theme/components/DocMetaCard.vue
  ─────────────────────────────────────────────────────────────────────────
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import { data as allDocs } from '../../data/content.data'
import {
  resolveDocType, getCardFields, resolveVocab, buildAdrIndex, resolveRef,
  type CardField, type StatusVocab,
} from '../config/docMeta.config'

const { frontmatter } = useData()

// doc_type 해석 → 필드 목록. 목록이 없으면 카드 자체를 렌더하지 않는다.
const docType = computed(() => resolveDocType(frontmatter.value))
const fields  = computed(() => getCardFields(docType.value))

// frontmatter에서 '실제 값이 있는' 필드만 추린다(빈 칸은 카드에서 제외).
type Resolved = { field: CardField; value: any }
const rows = computed<Resolved[]>(() => {
  if (!fields.value) return []
  const fm = frontmatter.value
  return fields.value
    .map(field => ({ field, value: pick(field, fm) }))
    .filter(r => !isEmpty(r.value))
})

// ── 값 추출: 가상 키(range/series/lang/link)는 여러 frontmatter 키를 조립한다 ──
function pick(field: CardField, fm: Record<string, any>): any {
  switch (field.kind) {
    case 'range':  return fm.period ?? null                         // { start, end }
    case 'series': return fm.series ? { name: fm.series, order: fm.series_order } : null
    case 'lang':   return fm.original_lang ? { from: fm.original_lang, to: fm.translation_lang } : null
    case 'link':  {
      const raw = fm[field.key]
      if (raw == null || raw === '') return null
      const text = field.text ?? String(raw)
      const url  = (field.urlKey && fm[field.urlKey]) ? fm[field.urlKey]
                : isUrl(raw) ? raw : null
      return { text, url }
    }
    default:       return fm[field.key] ?? null
  }
}

// null / 빈 문자열 / 빈 배열 / 전부 null인 객체 → "값 없음"으로 간주
function isEmpty(v: any): boolean {
  if (v == null) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.values(v).every(x => x == null)
  return v === ''
}

// ── 뱃지: 값을 어휘로 매핑해 라벨+색 스타일 도출 ──
function badge(field: CardField, value: string): { label: string; style: string } {
  const vocab: StatusVocab = resolveVocab(field.vocab ?? 'doc', docType.value)
  const hit = vocab[value]
  return { label: hit?.label ?? String(value), style: hit?.style ?? 'neutral' }
}

// ── 날짜 포맷: UTC 날짜 파트(시각 버림)만 추출 → 뷰어 타임존 무관하게 frontmatter에 적은 값 그대로 노출
function fmtDate(v: any): string {
  if(v == null || v === '') return ''
  const d = new Date(v)
  if(Number.isNaN(d.getTime())) return String(v)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}. ${m}. ${day}.`;
}

const adrIndex = computed(() => buildAdrIndex(allDocs as Array<{ url?: string }>)
)

// row.value(ID 배열)를 해석된 ref 객체 배열로
function resolveRefs(ids: string[]): Array<{ label: string; url?: string }> {
  const arr = Array.isArray(ids) ? ids : ids ? [ids] : []
  return arr.map(id => resolveRef(id, adrIndex.value))
}

// ── 표기 헬퍼 ──
const rangeText  = (r: { start?: string; end?: string }) => `${fmtDate(r.start)} ~ ${r.end ? fmtDate(r.end) : 'ongoing'}`
const seriesText = (s: { name: string; }) => s.name
const orderText  = (s: { order?: number }) => s.order != null ? ` · Ch.${s.order}`  : null
const isUrl = (s: any) => typeof s === 'string' && /^https?:\/\//.test(s)
</script>

<template>
  <div v-if="rows.length" class="doc-meta-card" :data-doctype="docType">
    <dl class="dmc-grid">
      <template v-for="row in rows" :key="row.field.key">
        <dt class="dmc-key">{{ row.field.label }}</dt>
        <dd class="dmc-val">

          <!-- badge: 상태/난이도 -->
          <span v-if="row.field.kind === 'badge'"
                class="dmc-badge" :class="'is-' + badge(row.field, row.value).style">
            {{ badge(row.field, row.value).label }}
          </span>

          <!-- link: issue / original_url / license -->
          <template v-else-if="row.field.kind === 'link'">
            <a v-if="row.value.url" :href="row.value.url" target="_blank" rel="noreferrer" class="dmc-link">{{ row.value.text }} ↗</a>
            <span v-else>{{ row.value.text }}</span>
          </template>

          <!-- pills: tags -->
          <span v-else-if="row.field.kind === 'pills'" class="dmc-pills">
            <span v-for="t in row.value" :key="t" class="dmc-pill">{{ t }}</span>
          </span>

          <!-- refs: related_adrs -->
          <span v-else-if="row.field.kind === 'refs'" class="dmc-pills">
            <template v-for="ref in resolveRefs(row.value)" :key="ref.label">
              <a v-if="ref.url" :href="ref.url" class="dmc-pill dmc-pill--ref dmc-pill--link">{{ ref.label }}</a>
              <span v-else class="dmc-pill dmc-pill--ref">{{ ref.label }}</span>
            </template>
          </span>

          <!-- people: deciders / 원저자 (배열·문자열 모두 허용) -->
          <span v-else-if="row.field.kind === 'people'">
            {{ Array.isArray(row.value) ? row.value.join(', ') : row.value }}
          </span>

          <!-- range: period -->
          <span v-else-if="row.field.kind === 'range'">{{ rangeText(row.value) }}</span>

          <!-- series -->
          <span v-else-if="row.field.kind === 'series'">{{ seriesText(row.value) }}<i style="color: gray; font-size: 0.7rem;">{{ orderText(row.value) }}</i></span>

          <!-- date: lastmod 등 -->
          <span v-else-if="row.field.kind === 'date'">{{ fmtDate(row.value) }}</span>

          <!-- lang -->
          <span v-else-if="row.field.kind === 'lang'">{{ row.value.from }} → {{ row.value.to }}</span>

          <!-- project (bold text) -->
          <span v-else-if="row.field.kind === 'project'" class="dmc-project">{{ row.value }}</span>

          <!-- text (default) -->
          <span v-else>{{ row.value }}</span>

        </dd>
      </template>
    </dl>
  </div>
</template>

<style scoped>
/* 압축 2열 key/value 그리드 — JEP head 테이블 정서. terra cotta 토큰 재사용. */
.doc-meta-card {
  margin: 0 0 28px;
  padding: 14px 18px;
  border: 1px solid var(--vp-c-divider);
  border-left: 3px solid var(--vp-c-brand-1);
  border-radius: var(--dv-radius-sm, 6px);
  background: var(--vp-c-bg-soft);
  font-size: 0.86rem;
  line-height: 1.6;
}
.dmc-grid {
  display: grid;
  grid-template-columns: max-content 1fr;   /* 라벨 폭 자동, 값은 나머지 */
  gap: 6px 16px;
  margin: 0;
}
.dmc-key { color: var(--vp-c-text-3); font-weight: 600; white-space: nowrap; }
.dmc-val { margin: 0; color: var(--vp-c-text-1); min-width: 0; }

/* 상태 뱃지 */
.dmc-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.5;
}
.dmc-badge.is-positive { background: color-mix(in srgb, #3fb950 18%, transparent); color: #3fb950; }
.dmc-badge.is-active   { background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.dmc-badge.is-neutral  { background: var(--vp-c-bg-alt); color: var(--vp-c-text-2); }
.dmc-badge.is-negative { background: color-mix(in srgb, #e04b3a 16%, transparent); color: #e04b3a; }
.dmc-badge.is-muted    { background: var(--vp-c-bg-alt); color: var(--vp-c-text-3); }

/* 링크 */
.dmc-link { color: var(--vp-c-brand-1); font-weight: 500; }
.dmc-link:hover { text-decoration: underline; }

/* pill 묶음 (tags / refs) */
.dmc-pills { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.dmc-pill {
  padding: 1px 8px; border-radius: 4px;
  font-size: 0.76rem;
  background: var(--vp-c-bg-alt); color: var(--vp-c-text-2);
}
.dmc-pill--ref {
  background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1);
  font-variant-numeric: tabular-nums;   /* ADR-0001 정렬 깔끔하게 */
}
.dmc-project {
  font-weight: bold;
}

/* 모바일: 1열로 접어 라벨/값 세로 배치 */
@media (max-width: 640px) {
  .dmc-grid { grid-template-columns: 1fr; gap: 2px 0; }
  .dmc-key { margin-top: 8px; }
  .dmc-key:first-child { margin-top: 0; }
}
</style>
