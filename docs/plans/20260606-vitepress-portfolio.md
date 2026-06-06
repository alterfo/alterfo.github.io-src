# Migrate to VitePress + Portfolio Landing Page

## Overview

Переписать `alterfo.github.io-src` с VuePress 1.x на VitePress, добавить портфолио-страницу
на корне сайта, починить IDEF0Editor (Vue 2 → Vue 3).

**Результат:**
- `alterfo.github.io/` — портфолио-сетка: AR Engine, Блог, GitHub, IDEF0
- `alterfo.github.io/blog/` — блог (все посты, та же тема)
- `alterfo.github.io/blog/posts/...` — старые URL с редиректами
- `alterfo.github.io/idef0` — IDEF0 редактор (починенный, Vue 3)
- `alterfo.github.io/ar/` — AR-движок (деплоится отдельно из AudioReactiveVideo)

## Context

- Проект: `/Users/olegsidorkin/WebstormProjects/alterfo.github.io-src/`
- Фреймворк сейчас: VuePress 1.9.10 + `@vuepress/theme-blog` 2.3.2
- Целевой фреймворк: VitePress (последняя стабильная версия)
- Деплой: `deploy.sh` → force-push в `alterfo/alterfo.github.io` (не меняем)
- IDEF0Editor: 1081 строка, Vue 2 Options API + canvas-рендер, нужно портировать на Vue 3
- `public/particles/` — WebGL шейдеры, используются в шапке блога, переносим как есть
- 36+ постов в `_posts/` в формате markdown с frontmatter

## Development Approach

- **Testing approach**: Regular (ручная проверка в браузере после каждой задачи)
- Сначала инфраструктура VitePress, потом контент, потом компоненты
- Блог работает до того как трогаем портфолио и IDEF0
- Деплой настраиваем последним, только когда всё работает локально

## Technical Details

### Структура VitePress
```
alterfo.github.io-src/
  .vitepress/
    config.ts           site config, nav, blog plugin
    theme/
      index.ts          theme entry (extends default или кастом)
      Layout.vue        кастомный layout с particles в шапке
      Portfolio.vue     портфолио-сетка (главная страница)
      BlogLayout.vue    layout для блога
    components/
      IDEF0Editor.vue   портированный на Vue 3
  posts/                blog posts (из _posts/)
  public/
    particles/          WebGL шейдеры (копируем)
  index.md              главная страница → Portfolio.vue
  blog/
    index.md            список постов
  idef0.md              страница с IDEF0Editor
  package.json
```

### Редиректы старых URL
VitePress поддерживает `rewrites` в config. Старый формат:
`/posts/2021/01/15/slug` → новый: `/blog/posts/2021/01/15/slug`

Дополнительно: сгенерировать статические HTML-редиректы (meta refresh) для SEO.

### Карточки портфолио
```vue
const projects = [
  { title: 'AR Engine', href: '/ar/', desc: 'Audio-reactive WebGPU визуализатор', tag: 'WebGPU' },
  { title: 'Блог', href: '/blog/', desc: 'Заметки о разработке и музыке', tag: 'Blog' },
  { title: 'IDEF0', href: '/idef0', desc: 'Редактор функциональных диаграмм', tag: 'Tool' },
  { title: 'GitHub', href: 'https://github.com/alterfo', desc: 'Open source проекты', tag: 'Profile' },
]
```

## Implementation Steps

### Task 1: Инициализация VitePress рядом со старым VuePress
- [ ] `npm add -D vitepress` в корне проекта
- [ ] создать `.vitepress/config.ts` с минимальным конфигом (title, description)
- [ ] создать `.vitepress/theme/index.ts` с кастомной темой (extends DefaultTheme)
- [ ] создать `index.md` в корне — пока просто "Hello VitePress"
- [ ] убедиться: `npx vitepress dev` запускается без ошибок
- [ ] старый VuePress (папка `blog/`) не трогаем пока

### Task 2: Перенос постов блога
- [ ] скопировать все `blog/_posts/*.md` в `posts/` (переименовать `_posts` → `posts`)
- [ ] проверить frontmatter — VitePress требует `date`, `title`; адаптировать если нужно
- [ ] настроить `createContentLoader('posts/*.md')` в config для листинга
- [ ] создать `blog/index.md` — страница со списком постов (VitePress blog layout)
- [ ] проверить: `npx vitepress dev` — посты отображаются на `/blog/`
- [ ] проверить: отдельный пост открывается с нормальным markdown

### Task 3: Перенос темы и стилей
- [ ] скопировать стили из `blog/.vuepress/styles/` → `.vitepress/theme/styles/`
- [ ] адаптировать Stylus → CSS (VitePress не поддерживает Stylus нативно)
  - конвертировать вручную или через `stylus-to-css` утилиту
- [ ] перенести `public/particles/` → `public/particles/` (путь тот же)
- [ ] воссоздать шапку с particles в `Layout.vue` (тот же WebGL код)
- [ ] проверить: внешний вид блога близок к оригиналу

### Task 4: IDEF0Editor — портирование на Vue 3
- [ ] прочитать `IDEF0Editor.vue` (1081 строк), составить список Vue 2 → Vue 3 паттернов:
  - `this.$refs` → `ref()` + `useTemplateRef()`
  - Options API `data/methods/computed` → Composition API `<script setup>`
  - Vue 2 `v-model` → Vue 3 `v-model` (если есть разница)
- [ ] портировать canvas-рендер и mouse event handlers (логика не меняется, только обёртка)
- [ ] портировать inline editor (`editing` state, `editorStyle`, `finishEdit`)
- [ ] портировать вложенные диаграммы (`nested diagrams`, `goBack`/`enterBlock`)
- [ ] проверить: компонент рендерится, можно добавлять блоки и связи
- [ ] проверить: вложенные диаграммы работают (войти/выйти)
- [ ] создать `idef0.md` с `<IDEF0Editor />` и базовым описанием

### Task 5: Главная страница — Portfolio grid
- [ ] создать `.vitepress/theme/Portfolio.vue` — сетка карточек проектов
  - тёмный фон (`#0a0020` как в AR-движке — единый стиль)
  - CSS Grid: 2 колонки на desktop, 1 на mobile
  - карточка: иконка/превью, название, тег, описание, ссылка
  - hover: тонкое свечение цвета тега
- [ ] подключить Layout: для `index.md` использовать `Portfolio.vue` как layout
- [ ] добавить 4 карточки: AR Engine, Блог, IDEF0, GitHub
- [ ] карточка AR Engine: если `/ar/` доступен — показать живой превью iframe (5 секунд, muted)
- [ ] проверить: страница выглядит хорошо на desktop и mobile

### Task 6: Редиректы старых URL
- [ ] в `.vitepress/config.ts` добавить `rewrites` для `/posts/:path` → `/blog/posts/:path`
- [ ] сгенерировать статические HTML-файлы с `<meta http-equiv="refresh">` для топ-постов
  (VitePress build hook: после сборки создать redirect HTML в `dist/posts/`)
- [ ] проверить: открыть старый URL `/posts/2021/...` → редирект работает

### Task 7: Обновить deploy.sh и GitHub Actions
- [ ] обновить `deploy.sh`:
  - заменить `yarn run build` на `npx vitepress build`
  - убрать `blog/.vuepress/dist`, теперь dist в `.vitepress/dist`
  - `cd .vitepress/dist` вместо `cd blog/.vuepress/dist`
- [ ] обновить `package.json` scripts: `build: vitepress build`, `dev: vitepress dev`
- [ ] убедиться: `sh deploy.sh <token>` проходит локально (dry run без пуша)
- [ ] проверить: GitHub Actions workflow запускается и деплоит без ошибок

### Task 8: Финальная проверка
- [ ] `npx vitepress build` без ошибок и предупреждений
- [ ] проверить все страницы: `/`, `/blog/`, `/idef0`, один пост
- [ ] проверить редиректы: `/posts/...` → `/blog/posts/...`
- [ ] проверить mobile: портфолио-сетка, блог, IDEF0
- [ ] проверить что `/ar/` карточка ведёт на правильный URL (задеплоен из AudioReactiveVideo)
- [ ] убедиться что старый VuePress код (`blog/.vuepress/`) можно удалить (или архивировать в ветку)

## Post-Completion

**После деплоя:**
- Проверить Google Analytics: UA-66011663-2 по-прежнему трекает pageviews
- Проверить `alterfo.github.io` в Chrome, Safari, Firefox
- Опционально: добавить карточку AR Engine с живым WebGPU превью (требует `/ar/` быть задеплоенным)
- Опционально: Search через VitePress встроенный Algolia или local search
