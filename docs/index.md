---
layout: home
title: Davi's Devlog
description: 백엔드·인프라·아키텍처 학습 기록
search: false

hero:
  name: "Davi's Devlog"
  text: "백엔드 · 인프라 · 아키텍처"
  tagline: "실무에서 마주친 개념을 구조적으로 기록합니다"
  actions:
    - theme: brand
      text: Notes 보기
      link: /notes/
    - theme: alt
      text: Deep Dive 보기
      link: /deep-dive/
---

<script setup>
import { data as allDocs } from './.vitepress/data/content.data.ts'
import ContentList from './.vitepress/theme/components/ContentList.vue'
const recentDocs = allDocs.slice(0, 6)
</script>

## 최근 문서

<ContentList :items="recentDocs" compact />
