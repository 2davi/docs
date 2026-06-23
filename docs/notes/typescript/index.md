---
title: "TypeScript"
search: false
---

<script setup>
import { data as allDocs } from '../../.vitepress/data/content.data.ts'
import CategoryIndex from '../../.vitepress/theme/components/CategoryIndex.vue'
const docs = allDocs.filter(
  d => d.section === 'notes' && (d.category ?? '').split('/')[0] === 'typescript'
)
</script>

# TypeScript

<CategoryIndex :items="docs" flat />