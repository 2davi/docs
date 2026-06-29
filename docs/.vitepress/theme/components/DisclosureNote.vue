<!--
  DisclosureNote.vue
  ─────────────────────────────────────────────────────────────────────────
  ai_assistance 를 읽어 본문 하단(doc-after)에 AI 활용 고지를 렌더한다.
  - 문장 조립 규칙은 docMeta.config.ts 의 buildDisclosure(SSOT)에서만 온다.
  - 본문에 AI가 관여한 경우(ai-drafted | co-authored)에만 표시된다(EU 50(4) 대상 = AI 생성 텍스트).
  - '흐릿한 숨은 각주'가 아니라 '명확·구별 가능한' 박스로 — EU 가이드라인이 숨긴 스니펫을
    불충분 고지로 명시하기 때문이다.
  배치 위치: docs/.vitepress/theme/components/DisclosureNote.vue
  ─────────────────────────────────────────────────────────────────────────
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import { buildDisclosure, type AiAssistance } from '../config/docMeta.config'

const { frontmatter } = useData()
const d = computed(() => buildDisclosure(frontmatter.value?.ai_assistance as AiAssistance | undefined))
</script>

<template>
  <aside v-if="d.show" class="ai-disclosure" aria-label="AI 활용 고지">
    <span class="aid-badge" aria-hidden="true">AI</span>
    <div class="aid-text">
      <p class="aid-main">{{ d.text }}</p>
      <p class="aid-meta" v-if="d.models.length || d.roles">
        <template v-if="d.models.length">사용 모델: {{ d.models.join(', ') }}</template>
        <template v-if="d.models.length && d.roles"> · </template>
        <template v-if="d.roles">활용: {{ d.roles }}</template>
      </p>
    </div>
  </aside>
</template>

<style scoped>
/* '명확하고 구별 가능한' 고지 — 흐릿한 숨은 각주가 아니라 읽히는 박스. */
.ai-disclosure {
  margin: 24px 0 0 0 !important;
  padding: 14px 16px;
  display: flex; gap: 12px; align-items: flex-start;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--dv-radius-sm, 6px);
  background: var(--vp-c-bg-soft);
}
.aid-badge {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  border-radius: 6px;
  background: var(--vp-c-brand-1); color: #fff;
  font-weight: 800; font-size: 0.74rem; letter-spacing: 0.02em;
}
.aid-text { min-width: 0; }
.aid-main { margin: 0; font-size: 0.84rem; line-height: 1.6; color: var(--vp-c-text-1); }
.aid-meta { margin: 3px 0 0; font-size: 0.78rem; color: var(--vp-c-text-3); }
</style>
