---
title: Notes
description: 기술 스택별 빠른 레퍼런스 노트
section: notes
search: false
---

## Notes

<script setup>
import { data as allDocs } from '../.vitepress/data/content.data.ts'
import CategoryIndex from '../.vitepress/theme/components/CategoryIndex.vue'
const docs = allDocs.filter(d => d.section === 'notes')
</script>

<CategoryIndex :items="docs" group-by="category" />