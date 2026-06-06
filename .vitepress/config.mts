import { defineConfig } from 'vitepress'
import { fileURLToPath, URL } from 'url'

const vp = (path: string) =>
  fileURLToPath(new URL(`../node_modules/vitepress/node_modules/${path}`, import.meta.url))

export default defineConfig({
  title: 'Alterfo',
  description: 'Персональный сайт Олега Сидоркина',
  lang: 'ru-RU',
  ignoreDeadLinks: [/^\/(reflection|stack-1|stack-2|stack-3)$/],
  srcExclude: [
    'blog/_posts/**',
    'blog/.vuepress/**',
    'blog/about.md',
    'blog/idef0.md',
    'node_modules/**',
    'KODA.md',
    'README.md',
  ],
  nav: [
    { text: 'Главная', link: '/' },
    { text: 'Блог', link: '/blog/' },
  ],
  vite: {
    resolve: {
      alias: [
        { find: /^vue$/, replacement: vp('vue/index.mjs') },
        { find: /^vue\/server-renderer/, replacement: vp('vue/server-renderer/index.mjs') },
      ],
    },
  },
})
