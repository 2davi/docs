---
title: "Chart.js Types"
search: false
---

<script setup>
import { data as allDocs } from '../../../../.vitepress/data/content.data.ts'
import CategoryIndex from '../../../../.vitepress/theme/components/CategoryIndex.vue'
const docs = allDocs.filter(
  d => d.section === 'notes' && (d.category ?? '').split('/')[2] === 'types'
)
</script>

# Chart.js Types

<CategoryIndex :items="docs" flat />
