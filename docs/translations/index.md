---
title: Translations
description: 
section: translations
search: false
---

## Translations

<script setup>
import { data as allDocs } from '../.vitepress/data/content.data.ts'
import CategoryIndex from '../.vitepress/theme/components/CategoryIndex.vue'
const docs = allDocs.filter(d => d.section === 'translations')
</script>

<CategoryIndex :items="docs" group-by="category" />
