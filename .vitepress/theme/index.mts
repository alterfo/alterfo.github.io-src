import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import IDEF0Editor from './components/IDEF0Editor.vue'
import './styles/index.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('IDEF0Editor', IDEF0Editor)
  },
} satisfies Theme
