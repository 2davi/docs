---
title: Deep Dive
description: 프로젝트 단위 심층 분석 문서
section: deep-dive
search: false
---

## Deep Dive

<script setup>
import { data as allDocs } from '../.vitepress/data/content.data.ts'
import ContentList from '../.vitepress/theme/components/ContentList.vue'
const docs = allDocs
  .filter(d => d.section === 'deep-dive' && !d.series_order)
  .sort((a, b) => a.order - b.order)
</script>

<ContentList :items="docs" />