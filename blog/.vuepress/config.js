const { description } = require('../../package')

module.exports = {
  title: 'Блог',
  description: description,
  head: [
    ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }],
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  ],

  themeConfig: {
    footer: {
      text: 'Персональный блог человека, разработчика и музыканта.'
    }
  },

  /**
   * Apply plugins，ref：https://v1.vuepress.vuejs.org/zh/plugin/
   */
  plugins: [
    ['@vuepress/blog', {
      directories: [
        {
          id: 'home',
          dirname: '_posts',
          path: '/',
          itemPermalink: '/posts/:year/:month/:day/:slug',
          layout: 'Layout',
          itemLayout: 'Post',
        }
      ]
    }
    ],
    [
      '@vuepress/google-analytics',
      {
        'ga': 'UA-66011663-2'
      }
    ]
  ]
}
