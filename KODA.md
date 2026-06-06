# KODA.md — Контекст проекта

## Обзор проекта

Это персональный сайт-портфолио Олега Сидоркина, построенный на **VitePress 1.x** с Vue 3. Проект включает в себя:

1. **Портфолио** — стартовая страница-сетка с карточками проектов
2. **Блог** с постами на различные темы (разработка, управление, личностный рост)
3. **IDEF0 Editor** — интерактивный визуальный редактор для создания IDEF0 диаграмм
4. **AR Engine** — WebGPU аудио-реактивный визуализатор (git submodule)

### Основные технологии

| Технология | Версия | Назначение |
|------------|--------|------------|
| VitePress | ^1.6.4 | Статический генератор сайтов |
| Vue.js | 3.x | Фреймворк для компонент (Composition API) |
| Yarn | 4.7.0 | Менеджер пакетов |
| IndexedDB | - | Клиентское хранилище для IDEF0 Editor |
| WebGPU | - | Анимация частиц (Layout.vue + WebGPUParticles.js) |
| Emscripten (emsdk) | - | Сборка WASM для AR Engine (только CI/CD) |

### Структура проекта

```
.
├── .vitepress/                # Конфигурация VitePress
│   ├── config.mts             # Основной конфиг (buildEnd, srcExclude, Vue alias)
│   └── theme/
│       ├── index.mts          # Регистрация глобальных компонентов
│       ├── Layout.vue         # Кастомный лейаут (WebGPU частицы, blog/idef0)
│       ├── Portfolio.vue      # Компонент портфолио-сетки
│       ├── components/
│       │   ├── BlogList.vue
│       │   ├── CountDown.vue
│       │   ├── WebGPUParticles.js
│       │   └── IDEF0Editor/   # Модули редактора IDEF0
│       └── styles/            # CSS переменные и глобальные стили
├── posts/                     # Посты блога (Markdown, ГГГГ-ММ-ДД-название.md)
├── public/
│   └── particles/             # WGSL шейдеры для WebGPU (compute, point, render)
├── ar-engine/                 # Git submodule: AudioReactiveVideo
├── posts.data.ts              # VitePress data loader для списка постов
├── index.md                   # Стартовая страница (layout: portfolio)
├── blog/index.md              # Список постов блога
├── idef0.md                   # Страница IDEF0 редактора (layout: false)
├── package.json               # Зависимости и скрипты
├── deploy.sh                  # Скрипт деплоя на GitHub Pages
└── .github/workflows/deploy.yml
```

## Сборка и запуск

### Команды

```bash
# Установка зависимостей
yarn install --immutable

# Режим разработки (hot reload)
yarn dev

# Сборка продакшн-версии
yarn build

# Деплой на GitHub Pages
yarn deploy
```

### Путь сборки

- Исходники: корень репозитория
- Выходная папка: `.vitepress/dist/`

### AR Engine submodule

```bash
# Инициализировать submodule (нужно при первом clone)
git submodule update --init

# AR Engine компилируется только в CI через emsdk
# Локально /ar/ недоступен — карточка AR в портфолио показывает иконку-заглушку
```

## Архитектурные паттерны

### Layout-переключение по frontmatter

`Layout.vue` читает `frontmatter.layout`:
- `'portfolio'` → рендерит `Portfolio.vue`
- `false` (idef0.md) → рендерит только `<Content />`
- иначе → стандартный блог/страница с WebGPU шапкой

### Генерация редиректов в buildEnd

`config.mts` содержит `buildEnd` хук, который генерирует статические HTML-редиректы для старых URL формата VuePress (`/posts/YYYY/MM/DD/slug` → `/posts/YYYY-MM-DD-slug`). Это нужно для обратной совместимости с входящими ссылками.

### Vue alias

В `config.mts` → `vite.resolve.alias` переопределяются `vue` и `vue/server-renderer` на внутренние копии VitePress. **Не удалять** — без этого алиаса сборка падает из-за дублирования экземпляров Vue.

### Data loader для постов

`posts.data.ts` — кастомный VitePress data loader (не `createContentLoader`). Читает frontmatter через `gray-matter`, сортирует по дате. Используется в `BlogList.vue` через `import { data } from '../../../posts.data'`.

### WebGPU с fallback

`WebGPUParticles.js` инициализирует WebGPU. При отсутствии поддержки компонент в `Layout.vue` просто не рендерит анимацию (graceful degradation через try/catch в `initWebGPU`).

## IDEF0 Editor — Детали реализации

### Ключевые функции

| Функция | Описание |
|---------|----------|
| Создание блоков | Добавление прямоугольных блоков с текстом |
| Стрелки ICOM | Input, Control, Output, Mechanism — 4 типа связей |
| Декомпозиция | Вложенные диаграммы при клике на блок |
| Панорамирование | Пробел + ЛКМ |
| Масштабирование | Колесо мыши (зум к курсору) |
| Редактирование текста | Двойной клик по блоку/стрелке |
| Экспорт | PNG, SVG, JSON |
| Автосохранение | IndexedDB с синхронизацией между вкладками через localStorage storage event |

### Архитектура редактора

```
IDEF0Editor.vue (основной компонент, Vue 3 Composition API)
├── constants.js   # Константы (цвета, размеры)
├── db.js          # IndexedDB + localStorage cross-tab sync
├── validation.js  # Валидация диаграмм (ICOM edge rules)
├── exporter.js    # Экспорт в PNG/SVG/JSON
├── router.js      # URL query параметр ?diagramId=
├── hierarchy.js   # Вложенность диаграмм (A0 → A1, A2, ...)
├── renderer.js    # Canvas отрисовка (IDEF0Renderer class, не используется напрямую)
├── manhattan.js   # Manhattan routing для стрелок
└── minimap.js     # Миникарта (не подключена к Layout)
```

Вся интерактивная логика и рендеринг реализованы инлайн в `IDEF0Editor.vue`; класс `IDEF0Renderer` в `renderer.js` не инстанциируется.

### Структура данных диаграммы

```javascript
{
  id: 'A0',
  name: 'Контекстная диаграмма',
  blocks: [
    { id: 'block-1', name: 'Функция', x, y, w, h, diagramId: null }
  ],
  arrows: [
    {
      id: 'arrow-1749123456789-0',
      name: 'Поток',
      type: 'input|output|control|mechanism',
      from: { blockId, edge, offset },
      to: { blockId, edge, offset },
      segments: []
    }
  ],
  view: { x, y, scale }
}
```

### Цветовая схема стрелок

| Тип | Цвет |
|-----|------|
| Input | #2980b9 (синий) |
| Output | #27ae60 (зелёный) |
| Control | #e74c3c (красный) |
| Mechanism | #8e44ad (фиолетовый) |

## CI/CD

`.github/workflows/deploy.yml` запускается при push в ветку `master`:
1. `actions/checkout@v4` с `submodules: recursive`
2. `mymindstorm/setup-emsdk@v14` — Emscripten для сборки AR Engine
3. `actions/setup-node@v4`
4. `yarn install --immutable`
5. `vitepress build`
6. `deploy.sh` — пушит `.vitepress/dist/` в репозиторий `alterfo/alterfo.github.io`

## Правила разработки

### Стиль кода

- **Vue components**: Single File Components (`.vue`), Vue 3 Composition API (`<script setup>`)
- **Naming**: PascalCase для компонентов, camelCase для методов
- **Modularity**: Разделение по функциональности в отдельных файлах

### Посты блога

Статьи расположены в `posts/`. Формат имени файла: `ГГГГ-ММ-ДД-название.md`

Обязательный frontmatter:
```yaml
---
title: Заголовок поста
date: ГГГГ-ММ-ДД
---
```

### Внешние ссылки

- [VitePress Documentation](https://vitepress.dev/)
- [IDEF0 Standard](https://en.wikipedia.org/wiki/IDEF0)

## Известные особенности

1. **Yarn 4.7.0** с PnP (Plug'n'Play) — файл `.yarnrc.yml` настроен соответствующим образом
2. **`ignoreDeadLinks`** в config.mts — подавляет ошибки для постов с VuePress `permalink:` (`/reflection`, `/stack-1`, `/stack-2`, `/stack-3`), которые не имеют redirect-страниц
3. **Навигация** — кастомный `Layout.vue` не включает VitePress default nav; `themeConfig.nav` в config.mts не рендерится
