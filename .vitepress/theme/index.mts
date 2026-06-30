import { defineAsyncComponent } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import Piano from './components/Piano.vue'
import MusicAlbums from './components/MusicAlbums.vue'
import HomeMark from './components/HomeMark.vue'
import './styles/index.css'

const IDEF0Editor = defineAsyncComponent(() => import('./components/IDEF0Editor.vue'))
const Journal = defineAsyncComponent(() => import('./components/Journal.vue'))
const OpenPoseEditor = defineAsyncComponent(() => import('./components/OpenPoseEditor.vue'))
const PlannerEditor = defineAsyncComponent(() => import('./components/PlannerEditor.vue'))
const DecisionJournal = defineAsyncComponent(() => import('./components/DecisionJournal.vue'))

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('IDEF0Editor', IDEF0Editor)
    app.component('Journal', Journal)
    app.component('Piano', Piano)
    app.component('OpenPoseEditor', OpenPoseEditor)
    app.component('PlannerEditor', PlannerEditor)
    app.component('DecisionJournal', DecisionJournal)
    app.component('MusicAlbums', MusicAlbums)
    app.component('HomeMark', HomeMark)
  },
} satisfies Theme
