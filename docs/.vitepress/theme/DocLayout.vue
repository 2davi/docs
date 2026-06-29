<!--
  DocLayout.vue
  ─────────────────────────────────────────────────────────────────────────
  DefaultTheme.Layout을 감싸 #doc-before 슬롯(렌더된 마크다운 직전 = H1 위, 본문 컬럼)에
  메타 카드를 주입한다. 파일마다 <DocMetaCard/>를 박을 필요 없이 이 래퍼 한 곳에서 전 문서에 적용된다.

  ※ 이미 커스텀 Layout을 쓰고 있다면(예: 라이트박스 onMounted가 들어간 래퍼),
    이 파일을 새로 만들지 말고 그 Layout 안에 아래 <template #doc-before> 블록만 추가하면 된다.
  배치 위치: docs/.vitepress/theme/DocLayout.vue
  ─────────────────────────────────────────────────────────────────────────
-->
<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import DocMetaCard from './components/DocMetaCard.vue'
import DisclosureNote from './components/DisclosureNote.vue'
const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before>
      <DocMetaCard />
    </template>
    <template #doc-after>
      <DisclosureNote />
    </template>
  </Layout>
</template>
