<template>
  <div class="pro">
    <header class="pro-nav">
      <a class="pro-mark" href="#top" aria-label="Олег Сидоркин, наверх">
        <span class="pro-mark-box">ОС</span>
        <span class="pro-mark-name">oleg-sidorkin.ru</span>
      </a>
      <nav class="pro-nav-links" aria-label="Разделы">
        <a href="#experience">Опыт</a>
        <a href="#projects">Проекты</a>
        <a href="#nets">Сети</a>
        <a href="#tools">Инструменты</a>
        <a href="#teams">Команды</a>
      </nav>
      <div class="pro-nav-tail">
        <a class="pro-nav-audit" href="/audit/" target="_self">Аудит</a>
        <a href="/cv">CV</a>
        <a class="pro-nav-cta" href="mailto:osidorkin85@gmail.com">Написать</a>
      </div>
    </header>

    <section id="top" class="pro-hero">
      <GpuField @stats="onStats" />
      <div class="pro-hero-grid" aria-hidden="true"></div>

      <div class="pro-hero-inner">
        <div class="pro-hero-top">
          <p class="pro-eyebrow">
            <span class="pro-dot" aria-hidden="true"></span>
            Олег Сидоркин · инженер · Казань
          </p>

          <dl class="pro-hud">
            <div><dt>api</dt><dd>{{ hud.api }}</dd></div>
            <div><dt>устройство</dt><dd>{{ hud.device }}</dd></div>
            <div><dt>точек</dt><dd>{{ hud.particles }}</dd></div>
            <div><dt>вызовов</dt><dd>{{ hud.workgroups }}</dd></div>
            <div><dt>кадр</dt><dd>{{ hud.frame }}</dd></div>
            <div><dt>кадров/с</dt><dd>{{ hud.fps }}</dd></div>
          </dl>
        </div>

        <div class="pro-hero-bottom">
          <h1 class="pro-name">Олег<br /><span>Сидоркин</span></h1>
          <p class="pro-claim">
            21 год в ИТ: 13 лет в разработке, 8 из них руководство. Ниже опыт, проекты и четыре
            прибора: GPU-поле, обучение сети, компилятор WGSL, модель команды. Текст здесь
            единственное, что не считается.
          </p>
        </div>

      </div>
    </section>

    <section class="pro-facts" aria-label="Коротко">
      <div v-for="fact in facts" :key="fact.label" class="pro-fact">
        <b>{{ fact.value }}</b>
        <span>{{ fact.label }}</span>
      </div>
    </section>

    <div class="pro-wrap">
      <a class="pro-audit" href="/audit/" target="_self">
        <span class="pro-audit-tag">Аудит платформы · две недели</span>
        <span class="pro-audit-text">
          Шесть доменов PDMM, метрики и сумма денег под риском.
          На выходе дорожная карта, а не отчёт на полку.
        </span>
        <span class="pro-audit-go" aria-hidden="true">→</span>
      </a>
    </div>

    <section id="experience" class="pro-section">
      <div class="pro-wrap">
        <div class="pro-head">
          <span class="pro-index">01</span>
          <div>
            <h2 class="pro-h2">Опыт</h2>
            <p class="pro-lead">
              Работал там, где ошибка стоит денег. Ниже места и то, что там удалось измерить.
            </p>
          </div>
        </div>

        <div class="pro-jobs">
          <div v-for="job in jobs" :key="job.company" class="pro-job">
            <span class="pro-job-years">{{ job.years }}</span>
            <span class="pro-job-name">
              {{ job.company }}
              <em>{{ job.role }}</em>
            </span>
            <span class="pro-job-metric">{{ job.metric }}</span>
          </div>
        </div>

        <p class="pro-proof-line">
          Альфа-Онлайн: внедрённая PWA экономит миллиарды в год. Playwright: e2e за 20 минут
          вместо полутора часов. CODEOWNERS: пул-реквесты закрываются за месяц вместо 6–9.
        </p>
      </div>
    </section>

    <section id="projects" class="pro-section">
      <div class="pro-wrap">
        <div class="pro-head">
          <span class="pro-index">02</span>
          <div>
            <h2 class="pro-h2">Проекты</h2>
            <p class="pro-lead">
              Личные проекты и исследования. Не продаю и не выдаю за внедрения: это лаборатория,
              где я проверяю гипотезы и меряю результат.
            </p>
          </div>
        </div>

        <div class="pro-cases">
          <a v-for="(item, i) in cases" :key="item.name" class="pro-case" :href="item.href">
            <span class="pro-case-i">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="pro-case-name">
              {{ item.name }}
              <em>{{ item.kind }}</em>
            </span>
            <span class="pro-case-metric">{{ item.metric }}</span>
            <span class="pro-case-arrow" aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>

    <section id="nets" class="pro-section">
      <div class="pro-wrap pro-split">
        <div class="pro-copy">
          <div class="pro-head pro-head-sm pro-head-stack">
            <span class="pro-index">03</span>
            <h2 class="pro-h2">Сети</h2>
          </div>
          <p class="pro-body">
            Сеть учится в вашей вкладке: 2×16×16×2, tanh, Adam, 360 точек. Ни одного запроса наружу.
          </p>
          <p class="pro-body">
            В проде LightGBM и XGBoost, порог 0.60/0.40, ньюс-вето.
            Модель, которая не умеет молчать, стоит дороже, чем её отсутствие.
          </p>
          <a class="pro-link" href="/work/approximate">Кейс Approximate&nbsp;→</a>
        </div>
        <div class="pro-lab"><NeuralLab /></div>
      </div>
    </section>

    <section id="tools" class="pro-section">
      <div class="pro-wrap pro-split">
        <div class="pro-copy">
          <div class="pro-head pro-head-sm pro-head-stack">
            <span class="pro-index">04</span>
            <h2 class="pro-h2">Инструменты</h2>
          </div>
          <p class="pro-body">
            Редактор компилирует WGSL здесь же и показывает ошибки с номерами строк.
            Сломать его нельзя: битый шейдер не заменит рабочий.
          </p>
          <p class="pro-body">
            Восемь инструментов живут без сервера, от IDEF0 до финансов.
            Каждый закрывает боль, под которую не было готового инструмента.
          </p>
          <ul class="pro-tool-links">
            <li><a href="/idef0">IDEF0-редактор</a></li>
            <li><a href="/journal">Дневник</a></li>
            <li><a href="/finance">Финансы</a></li>
            <li><a href="/planner">Планировщик</a></li>
            <li><a href="/decision-journal">Журнал решений</a></li>
            <li><a href="https://alterfo.ru/piano">Пианино&nbsp;↗</a></li>
            <li><a href="https://alterfo.ru/openpose">OpenPose&nbsp;↗</a></li>
            <li><a href="https://alterfo.ru/casual-games">Пазлы&nbsp;↗</a></li>
          </ul>
        </div>
        <div class="pro-lab"><ShaderLab /></div>
      </div>
    </section>

    <section id="teams" class="pro-section">
      <div class="pro-wrap pro-split">
        <div class="pro-copy">
          <div class="pro-head pro-head-sm pro-head-stack">
            <span class="pro-index">05</span>
            <h2 class="pro-h2">Команды</h2>
          </div>
          <p class="pro-body">
            Восемь лет руководил. Главное решение не «нанять сильнее», а изменить форму команды.
          </p>
          <p class="pro-body">
            Каналов связи n(n−1)/2. 24 человека дают 276, три группы по восемь: 87.
          </p>
          <p class="pro-body pro-body-stark">
            Рост команды&nbsp;— это рост числа связей, а не числа рук.
          </p>
        </div>
        <div class="pro-lab"><TopologyLab /></div>
      </div>
    </section>

    <section class="pro-close">
      <div class="pro-wrap">
        <p class="pro-close-kicker">Что дальше</p>
        <h2 class="pro-close-title">Нужен инженер, который отвечает за результат, а не за процесс?</h2>
        <div class="pro-actions">
          <a class="pro-btn pro-btn-primary" href="mailto:osidorkin85@gmail.com">Написать</a>
          <a class="pro-btn" href="/cv">CV</a>
          <a class="pro-btn" href="/audit/" target="_self">Аудит платформы</a>
          <a class="pro-btn" href="https://github.com/alterfo" target="_blank" rel="noreferrer">GitHub</a>
        </div>
        <p class="pro-contacts">
          osidorkin85@gmail.com · Telegram <a href="https://t.me/jfyi_ps" target="_blank" rel="noreferrer">@jfyi_ps</a>
        </p>
      </div>
    </section>

    <footer class="pro-footer">
      <span>© 2026 Олег Сидоркин</span>
      <span class="pro-footer-note">Статический сайт. Поле, сеть и компилятор считаются на клиенте.</span>
      <a href="#top">наверх ↑</a>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import GpuField from './pro/GpuField.vue'
import NeuralLab from './pro/NeuralLab.vue'
import ShaderLab from './pro/ShaderLab.vue'
import TopologyLab from './pro/TopologyLab.vue'
import './pro/pro.css'

const facts = [
  { value: '21', label: 'год в ИТ' },
  { value: '13', label: 'лет в разработке' },
  { value: '8', label: 'лет руководства' },
  { value: '30', label: 'инженеров в пике' },
]

const jobs = [
  {
    years: '2023–2026',
    company: 'Альфа-Банк',
    role: 'Technical Lead / System Architect',
    metric: '30 инженеров, текучесть 0',
  },
  {
    years: '2022',
    company: 'ИТМС',
    role: 'руководитель разработки',
    metric: 'медленные запросы −80%, дефекты −50%',
  },
  {
    years: '2017–2021',
    company: 'EPAM',
    role: 'Key Software Engineer / Frontend Group Head',
    metric: '15+ разработчиков до Senior',
  },
  {
    years: '2011–2014',
    company: 'GDC Services',
    role: 'Systems Engineer',
    metric: 'SLA 99.999%, on-call',
  },
]

const cases = [
  { name: 'kb', kind: 'GraphRAG', metric: 'промахи 73% → 15%', href: '/work/kb' },
  { name: 'Approximate', kind: 'трейдинг', metric: 'займ акций 25% ≠ 17%', href: '/work/approximate' },
  { name: 'FinContext MCP', kind: 'финансы', metric: '0 токенов у подрядчика', href: '/work/fincontext' },
  { name: 'Shelfprice', kind: 'vision', metric: '4 тайла на кадр', href: '/work/shelfprice' },
  { name: 'watersort', kind: 'Go', metric: '8 режимов поиска', href: '/work/watersort' },
  { name: 'IDEF0 Editor', kind: 'FIPS 183', metric: 'валидация на лету', href: '/work/idef0' },
]

const stats = ref({ api: '', device: '', particles: 0, workgroups: 0, frameMs: 0, fps: 0 })
const nf = new Intl.NumberFormat('ru-RU')

function onStats(next) {
  stats.value = next
}

const hud = computed(() => {
  const s = stats.value
  const api = s.api === 'canvas2d' ? 'canvas 2d' : s.api || '…'
  return {
    api,
    device: s.device || '…',
    particles: s.particles ? nf.format(s.particles) : '…',
    workgroups: s.workgroups ? nf.format(s.workgroups) : '…',
    frame: s.frameMs ? `${s.frameMs.toFixed(1)} ms` : '…',
    fps: s.fps ? String(Math.round(s.fps)) : '…',
  }
})
</script>
