# alterfo.github.io-src

Исходники сайта [alterfo.github.io](https://alterfo.github.io) — портфолио + блог.

**Стек:** VitePress 1.6.x · Vue 3 · vanilla JS · WebGPU particles в шапке · дизайн-система «Spiral» (CSS-токены `--ds-*`)

## Дизайн-система «Spiral»

Единая визуальная идентичность оболочки-портфолио (Portfolio / Layout / BlogList / CountDown). Спектр из 6 цветов = «сферы круга жизни» (из блога), они же — цвета проектов. Источник правды: CSS-токены в `.vitepress/theme/styles/vars.css` + JS-зеркало `components/spectrum.js` (менять hex в обоих). Particle-фон — один модуль `components/ConnectingParticles.js` (шапка + портфолио); countdown «1000 дней роста» — `CountDown.vue` + чистая дата-математика `countdown.js`. Подробности — в `CLAUDE.md` → «## Design system «Spiral»».

## Структура

```
.vitepress/
  config.mts          конфиг VitePress (nav, srcExclude, redirect-хуки)
  theme/
    index.mts          тема: extends DefaultTheme + кастомный Layout
    Layout.vue         шапка с WebGPU/Canvas particles, слот #layout-top
    Portfolio.vue      главная страница — сетка проектов
    styles/vars.css    дизайн-токены --ds-* (палитра, текст, типографика)
    components/
      spectrum.js          JS-зеркало палитры (SPECTRUM/CANVAS_PALETTE/PROJECT_COLORS)
      ConnectingParticles.js  единый particle-модуль (createField + чистые хелперы)
      CountDown.vue / countdown.js  обратный отсчёт + чистая дата-математика
      BlogList.vue         индекс блога (токен-driven)
      IDEF0Editor.vue      редактор функциональных диаграмм (Vue 3, SVG)
      Journal.vue          приватный шифрованный дневник (WebCrypto)
      Piano.vue            MIDI-тренажёр (Web MIDI, VexFlow)
      OpenPoseEditor.vue   редактор поз (MediaPipe BlazePose, WASM)
      WebGPUParticles.js   particle-система шапки (WebGPU → Canvas 2D fallback)
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

