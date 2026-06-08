import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import IDEF0Editor from './components/IDEF0Editor.vue'
import Journal from './components/Journal.vue'
import Piano from './components/Piano.vue'
import './styles/index.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('IDEF0Editor', IDEF0Editor)
    app.component('Journal', Journal)
    app.component('Piano', Piano)
  },
} satisfies Theme
