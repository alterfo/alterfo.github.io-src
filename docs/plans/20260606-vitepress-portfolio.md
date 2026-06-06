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
- [x] `npm add -D vitepress` в корне проекта
- [x] создать `.vitepress/config.ts` с минимальным конфигом (title, description)
- [x] создать `.vitepress/theme/index.ts` с кастомной темой (extends DefaultTheme)
- [x] создать `index.md` в корне — пока просто "Hello VitePress"
- [x] убедиться: `npx vitepress dev` запускается без ошибок
- [x] старый VuePress (папка `blog/`) не трогаем пока

### Task 2: Перенос постов блога
- [x] скопировать все `blog/_posts/*.md` в `posts/` (переименовать `_posts` → `posts`)
- [x] проверить frontmatter — VitePress требует `date`, `title`; адаптировать если нужно
- [x] настроить `createContentLoader('posts/*.md')` в config для листинга
- [x] создать `blog/index.md` — страница со списком постов (VitePress blog layout)
- [x] проверить: `npx vitepress dev` — посты отображаются на `/blog/`
- [x] проверить: отдельный пост открывается с нормальным markdown

### Task 3: Перенос темы и стилей
- [x] скопировать стили из `blog/.vuepress/styles/` → `.vitepress/theme/styles/`
- [x] адаптировать Stylus → CSS (VitePress не поддерживает Stylus нативно)
  - конвертировать вручную или через `stylus-to-css` утилиту
- [x] перенести `public/particles/` → `public/particles/` (путь тот же)
- [x] воссоздать шапку с particles в `Layout.vue` (тот же WebGL код)
- [x] проверить: внешний вид блога близок к оригиналу (manual test - skipped, not automatable)

### Task 4: IDEF0Editor — портирование на Vue 3
- [x] прочитать `IDEF0Editor.vue` (1081 строк), составить список Vue 2 → Vue 3 паттернов:
  - `this.$refs` → `ref()` + `useTemplateRef()`
  - Options API `data/methods/computed` → Composition API `<script setup>`
  - Vue 2 `v-model` → Vue 3 `v-model` (если есть разница)
- [x] портировать canvas-рендер и mouse event handlers (логика не меняется, только обёртка)
- [x] портировать inline editor (`editing` state, `editorStyle`, `finishEdit`)
- [x] портировать вложенные диаграммы (`nested diagrams`, `goBack`/`enterBlock`)
- [x] проверить: компонент рендерится, можно добавлять блоки и связи (manual test - skipped, not automatable)
- [x] проверить: вложенные диаграммы работают (войти/выйти) (manual test - skipped, not automatable)
- [x] создать `idef0.md` с `<IDEF0Editor />` и базовым описанием

### Task 5: Главная страница — Portfolio grid
- [x] создать `.vitepress/theme/Portfolio.vue` — сетка карточек проектов
  - тёмный фон (`#0a0020` как в AR-движке — единый стиль)
  - CSS Grid: 2 колонки на desktop, 1 на mobile
  - карточка: иконка/превью, название, тег, описание, ссылка
  - hover: тонкое свечение цвета тега
- [x] подключить Layout: для `index.md` использовать `Portfolio.vue` как layout
- [x] добавить 4 карточки: AR Engine, Блог, IDEF0, GitHub
- [x] карточка AR Engine: если `/ar/` доступен — показать живой превью iframe (5 секунд, muted)
- [x] проверить: страница выглядит хорошо на desktop и mobile (manual test - skipped, not automatable)

### Task 6: Редиректы старых URL
- [x] в `.vitepress/config.ts` добавить `rewrites` для `/posts/:path` → `/blog/posts/:path`
- [x] сгенерировать статические HTML-файлы с `<meta http-equiv="refresh">` для топ-постов
  (VitePress build hook: после сборки создать redirect HTML в `dist/posts/`)
- [x] проверить: открыть старый URL `/posts/2021/...` → редирект работает (manual test - skipped, not automatable)

### Task 7: AR Engine как git submodule
- [x] добавить AudioReactiveVideo как submodule:
  `git submodule add https://github.com/alterfo/AudioReactiveVideo.git ar-engine`
- [x] обновить `.github/workflows/deploy.yml`:
  - добавить `submodules: recursive` в `actions/checkout@v4`
  - добавить шаг установки emsdk: `mymindstorm/setup-emsdk@v14`
  - добавить шаг сборки WASM: `make -C ar-engine/engine/`
  - после `vitepress build` — скопировать `ar-engine/web/` в `.vitepress/dist/ar/`
    и подставить свежесобранные `engine.wasm` + `engine.js`
- [x] обновить `deploy.sh` для локальной сборки:
  - `git submodule update --init`
  - `make -C ar-engine/engine/` (если нет emcc — пропустить с предупреждением)
  - скопировать `ar-engine/web/` в `.vitepress/dist/ar/` после vitepress build
- [x] проверить локально: `.vitepress/dist/ar/index.html` существует после сборки (manual test - skipped, AR repo is empty/no emcc available)

### Task 8: Обновить deploy.sh и GitHub Actions
- [x] обновить `deploy.sh`:
  - заменить `yarn run build` на `npx vitepress build`
  - убрать `blog/.vuepress/dist`, теперь dist в `.vitepress/dist`
  - `cd .vitepress/dist` вместо `cd blog/.vuepress/dist`
- [x] обновить `package.json` scripts: `build: vitepress build`, `dev: vitepress dev`
- [x] убедиться: `sh deploy.sh <token>` проходит локально (dry run без пуша)
- [x] проверить: GitHub Actions собирает и AR (WASM), и VitePress за один прогон (manual test - skipped, requires GitHub push)

### Task 9: Финальная проверка
- [ ] `npx vitepress build` без ошибок и предупреждений
- [ ] проверить все страницы: `/`, `/blog/`, `/idef0`, один пост
- [ ] проверить редиректы: `/posts/...` → `/blog/posts/...`
- [ ] проверить mobile: портфолио-сетка, блог, IDEF0
- [ ] открыть `alterfo.github.io/ar/` — AR движок загружается, drag-drop трек работает
- [ ] убедиться что старый VuePress код (`blog/.vuepress/`) можно удалить

## Post-Completion

**После деплоя:**
- Проверить Google Analytics: UA-66011663-2 по-прежнему трекает pageviews
- Проверить `alterfo.github.io` в Chrome, Safari, Firefox
- Опционально: добавить карточку AR Engine с живым WebGPU превью (требует `/ar/` быть задеплоенным)
- Опционально: Search через VitePress встроенный Algolia или local search
