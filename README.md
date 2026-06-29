# alterfo.github.io-src

Исходники сайта [alterfo.github.io](https://alterfo.github.io) — портфолио + блог.

**Стек:** VitePress 1.6.x · Vue 3 · vanilla JS · WebGPU particles в шапке · дизайн-система «Spiral» (CSS-токены `--ds-*`)

## Дизайн-система «Spiral»

Единая визуальная идентичность оболочки-портфолио (Portfolio / Layout / BlogList / CountDown). Спектр из 8 цветов = «сферы круга жизни» (из блога), они же — цвета проектов. Источник правды: CSS-токены в `.vitepress/theme/styles/vars.css` + JS-зеркало `components/spectrum.js` (менять hex в обоих). Particle-фон — один модуль `components/ConnectingParticles.js` (шапка + портфолио); countdown «1000 дней роста» — `CountDown.vue` + чистая дата-математика `countdown.js`; колесо жизни «LifeCircle» (`LifeCircle.vue` + геометрия `lifecircle.js`) — 8 сфер-проектов, внешний радиус кодирует готовность (1–10), заменило сетку проектов на главной. Подробности — в `CLAUDE.md` → «## Design system «Spiral»».

## Структура

```
.vitepress/
  config.mts          конфиг VitePress (nav, srcExclude, SEO/meta + JSON-LD через transformPageData, sitemap + redirect-хуки в buildEnd)
  seo.js / seo.test.mjs  чистые SEO-хелперы (canonical-URL, JSON-LD, sitemap-priority) + юнит-тесты
  theme/
    index.mts          тема: extends DefaultTheme + кастомный Layout
    Layout.vue         шапка с WebGPU/Canvas particles, слот #layout-top
    Portfolio.vue      главная страница — колесо жизни (LifeCircle) + countdown
    styles/vars.css    дизайн-токены --ds-* (палитра, текст, типографика)
    components/
      spectrum.js          JS-зеркало палитры (SPECTRUM/CANVAS_PALETTE/PROJECT_COLORS)
      ConnectingParticles.js  единый particle-модуль (createField + чистые хелперы)
      CountDown.vue / countdown.js  обратный отсчёт + чистая дата-математика
      LifeCircle.vue / lifecircle.js  колесо жизни — 8 сфер-проектов, радиус = готовность (SVG + чистая геометрия)
      MusicAlbums.vue / music.js      страница /music — карточки альбомов, ленивый iframe-плеер (Яндекс.Музыка)
      BlogList.vue         индекс блога (токен-driven)
      IDEF0Editor.vue      редактор функциональных диаграмм (Vue 3, SVG)
      Journal.vue          приватный шифрованный дневник (WebCrypto)
      Piano.vue            MIDI-тренажёр (Web MIDI, VexFlow)
      OpenPoseEditor.vue   редактор поз (MediaPipe BlazePose, WASM)
      PlannerEditor.vue    шифрованный планировщик задач (WebCrypto, IndexedDB, .planner export/import)
      DecisionJournal.vue  шифрованный журнал решений с калибровкой (WebCrypto, Brier score)
      WebGPUParticles.js   particle-система шапки (WebGPU → Canvas 2D fallback)
posts/                 36 постов в формате YYYY-MM-DD-slug.md
projects/              лонгрид-разборы проектов (ar-engine.md, idef0-editor.md)
public/particles/      WebGL шейдеры (legacy, шапка блога)
public/og.png          Open Graph карточка (источник: public/og-source.svg)
public/robots.txt      robots + ссылка на sitemap.xml (генерится в buildEnd)
ar-engine/             Аудио-реактив (аудиовизуализатор на WebGPU)
vacuum-rogues/         git-сабмодуль приватной игры (alterfo/vacuum-rogues) → собирается в dist/vacuum-rogues/ при деплое; вход — кораблик в центре колеса, виден только когда игра реально задеплоена (HEAD-проба /vacuum-rogues/)
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

### Игра `/vacuum-rogues/` — ключ к приватному сабмодулю (один раз)

`vacuum-rogues/` — это приватный репо `alterfo/vacuum-rogues`, подключённый сабмодулем.
GitHub Actions не может читать чужой приватный репо стандартным `GITHUB_TOKEN`, поэтому нужен
отдельный **read-only SSH deploy key**:

```sh
ssh-keygen -t ed25519 -C "vacuum-rogues deploy" -f vr_deploy_key -N ""
```

Это даёт пару ключей. Кладутся они в **два разных** места (частая путаница):

| Файл | Куда | Где именно |
|------|------|------------|
| `vr_deploy_key.pub` (**публичный**) | в **приватный репо игры** `alterfo/vacuum-rogues` | Settings → Deploy keys → **Add deploy key** — **read-only** (НЕ ставить «Allow write access») |
| `vr_deploy_key` (**приватный**) | в **этот** репо (`alterfo/alterfo.github.io-src`), где лежит `deploy.yml` | Settings → Secrets and variables → Actions → **New repository secret** → имя `VACUUM_ROGUES_DEPLOY_KEY`, значение — весь приватный ключ |

```sh
rm vr_deploy_key vr_deploy_key.pub   # локальные копии после загрузки не нужны
```

**Важно:** приватный ключ-секрет идёт в исходный репо сайта, а НЕ в репо игры. В репо игры
кладётся только публичная половина (как Deploy key).

Когда секрет `VACUUM_ROGUES_DEPLOY_KEY` задан, CI фетчит сабмодуль и собирает игру с
`--base=/vacuum-rogues/` в `dist/vacuum-rogues/`. Когда пуст — сабмодуль не тянется, деплой не
падает (`submodules: false` + `continue-on-error`), `/vacuum-rogues/` отдаёт 404, а кораблик в
центре колеса прячется сам. **Перед боевым деплоем** в репо игры нужно ужать ассеты (сейчас
`dist/` ≈ 607 МБ; PNG-задники 22–26 МБ → WebP/AVIF, цель < ~80 МБ) — иначе слишком тяжело для
Pages.

### Авто-подхват изменений игры (мгновенный кросс-репо деплой)

Чтобы пуш в `master` репо игры **сам** пересобирал сайт (без ручного bump'а сабмодуля):

1. **Сторона alterfo уже готова:** `deploy.yml` слушает `repository_dispatch` (тип
   `vacuum-rogues-updated`) и при сборке игры подтягивает её **последний** `master`
   (`git submodule update --remote`; `.gitmodules` → `branch = master`), а не запиненный коммит.
2. **В репо игры** уже лежит workflow `.github/workflows/notify-alterfo.yml` — на пуш в `master`
   он шлёт `repository_dispatch` в этот репо. Закоммить его в `alterfo/vacuum-rogues`.
3. **Токен** в репо игры: создай PAT, который может слать dispatch на `alterfo/alterfo.github.io-src`
   — fine-grained PAT на этот репо с правом **Contents: Read and write** (или classic PAT со scope
   `repo`), и положи его в `alterfo/vacuum-rogues` → Settings → Secrets → Actions →
   `ALTERFO_DISPATCH_TOKEN`.

Итог: пуш в `master` игры → её workflow дёргает Deploy alterfo → собирается последний коммит игры
→ сайт обновляется. Включать имеет смысл **после** оптимизации ассетов — иначе каждый автодеплой
force-пушит сотни МБ в репо Pages.

