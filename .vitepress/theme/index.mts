import { defineAsyncComponent } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import MusicAlbums from './components/MusicAlbums.vue'
import HomeMark from './components/HomeMark.vue'
import AppHeader from './components/AppHeader.vue'
import './styles/index.css'

const IDEF0Editor = defineAsyncComponent(() => import('./components/IDEF0Editor.vue'))
const Journal = defineAsyncComponent(() => import('./components/Journal.vue'))
const Piano = defineAsyncComponent(() => import('./components/Piano.vue'))
const OpenPoseEditor = defineAsyncComponent(() => import('./components/OpenPoseEditor.vue'))
const PlannerEditor = defineAsyncComponent(() => import('./components/PlannerEditor.vue'))
const DecisionJournal = defineAsyncComponent(() => import('./components/DecisionJournal.vue'))
const FinanceApp = defineAsyncComponent(() => import('./components/FinanceApp.vue'))

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
    app.component('FinanceApp', FinanceApp)
    app.component('MusicAlbums', MusicAlbums)
    app.component('HomeMark', HomeMark)
    app.component('AppHeader', AppHeader)
  },
} satisfies Theme
