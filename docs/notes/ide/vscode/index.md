---
title: "VSCode"
search: false
---

<script setup>
import { data as allDocs } from '../../../.vitepress/data/content.data.ts'
import CategoryIndex from '../../../.vitepress/theme/components/CategoryIndex.vue'
const docs = allDocs.filter(
  d => d.section === 'notes' && (d.category ?? '').split('/')[1] === 'vscode'
)
</script>

# VSCode

<CategoryIndex :items="docs" flat />
