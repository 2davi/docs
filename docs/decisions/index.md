---
title: Decisions
description: 결정 기록 아카이브. CORE·RDSM·DOCS 스코프의 ADR·CDR·CHR
section: decisions
search: false
---

## Decisions {#decisions}

<script setup>
import { data as allDocs } from '../.vitepress/data/content.data.ts'
import CategoryIndex from '../.vitepress/theme/components/CategoryIndex.vue'
const docs = allDocs.filter(d => d.section === 'decisions')
</script>

<CategoryIndex :items="docs" group-by="category" />
