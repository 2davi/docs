---
title: "Chart.js"
search: false
---

<script setup>
import { data as allDocs } from '../../../.vitepress/data/content.data.ts'
import CategoryIndex from '../../../.vitepress/theme/components/CategoryIndex.vue'
const docs = allDocs.filter(
  d => d.section === 'notes' && (d.category ?? '').split('/')[0] === 'chart.js'
)
</script>

# Chart.js

<CategoryIndex :items="docs" flat />