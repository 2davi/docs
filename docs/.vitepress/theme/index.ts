import DefaultTheme from 'vitepress/theme'
import ContentList    from './components/ContentList.vue'
import CategoryIndex  from './components/CategoryIndex.vue'
import TagCloud       from './components/TagCloud.vue'
import SeriesNav      from './components/SeriesNav.vue'
import type { Theme } from 'vitepress'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ContentList',   ContentList)
    app.component('CategoryIndex', CategoryIndex)
    app.component('TagCloud',      TagCloud)
    app.component('SeriesNav',     SeriesNav)
  },
} satisfies Theme