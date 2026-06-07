# alterfo.github.io-src

Исходники сайта [alterfo.github.io](https://alterfo.github.io) — портфолио + блог.

**Стек:** VitePress 1.6.x · Vue 3 · vanilla JS · WebGPU particles в шапке

## Структура

```
.vitepress/
  config.mts          конфиг VitePress (nav, srcExclude, redirect-хуки)
  theme/
    index.mts          тема: extends DefaultTheme + кастомный Layout
    Layout.vue         шапка с WebGPU/Canvas particles, слот #layout-top
    Portfolio.vue      главная страница — сетка проектов
    components/
      IDEF0Editor.vue  редактор функциональных диаграмм (Vue 3, canvas)
      CountDown.vue    обратный отсчёт
      WebGPUParticles.js  particle-система (WebGPU → Canvas 2D fallback)
posts/                 35 постов в формате YYYY-MM-DD-slug.md
public/particles/      WebGL шейдеры (legacy, шапка блога)
ar-engine/             AudioReactiveVideo (WebGPU AR движок)
deploy.sh              локальный деплой
.github/workflows/     CI деплой
```

## Разработка

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # .vitepress/dist/
```

> **Важно:** VitePress ищет Vue в `node_modules/vitepress/node_modules/vue`.
> `npm install` создаёт нужный симлинк через `postinstall` в package.json.

## Деплой

Деплой пушит собранный `.vitepress/dist/` force-push в репо `alterfo/alterfo.github.io`.

**Настройка SSH deploy key (один раз):**
```sh
ssh-keygen -t ed25519 -C "deploy" -f deploy_key -N ""
# deploy_key.pub → alterfo.github.io → Settings → Deploy keys (allow write)
# deploy_key     → alterfo.github.io-src → Settings → Secrets → DEPLOY_KEY
```

**GitHub Actions** использует секрет `DEPLOY_KEY`.  
**Локально:** `sh deploy.sh` (нужен SSH-агент с ключом).

