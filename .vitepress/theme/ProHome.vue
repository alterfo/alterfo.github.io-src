<template>
  <main class="pro-home">
    <section class="pro-hero">
      <p class="pro-kicker">Инженер · архитектура · AI-системы</p>
      <h1>Олег Сидоркин</h1>
      <p class="pro-lead">
        Строю системы и проверяю их как систему. Алго-трейдинг, RAG с графом знаний,
        self-hosted финансы для бизнеса. Каждая цифра — из репозитория или бенчмарка.
      </p>
      <nav class="pro-actions">
        <a class="btn btn-primary" href="/cv">Открыть CV</a>
        <a class="btn" href="/audit/" target="_self">Аудит платформы</a>
        <a class="btn" href="/contact">Связаться</a>
      </nav>
    </section>

    <section class="pro-proof">
      <h2>Три доказательства</h2>
      <div class="pro-grid">
        <a class="pro-card" href="https://github.com/alterfo/kb" target="_blank" rel="noreferrer">
          <span class="pro-card-tag">RAG · Go</span>
          <h3>kb</h3>
          <p>База знаний на GraphRAG: гибридный поиск (dense + BM25 + RRF), временной граф, слой верификации с проверкой цитат. Прогнана через открытые бенчмарки.</p>
        </a>
        <a class="pro-card" href="https://github.com/alterfo/moex-trader" target="_blank" rel="noreferrer">
          <span class="pro-card-tag">Трейдинг · Go</span>
          <h3>Approximate</h3>
          <p>Алго-трейдер: сбор рыночных данных, ансамбль LightGBM и XGBoost, пороги, ньюс-вето, риск-гейты и kill switch. Публичное исследование AlgoPack и MOEX.</p>
        </a>
        <a class="pro-card" href="https://github.com/alterfo/fincontext-mcp" target="_blank" rel="noreferrer">
          <span class="pro-card-tag">MCP · Yandex Cloud</span>
          <h3>FinContext MCP</h3>
          <p>Финансовый контекст для AI-ассистента бизнеса. Разворачивается в облаке клиента, токены банков лежат в его Lockbox и разработчику не уходят.</p>
        </a>
      </div>
    </section>

    <section class="pro-apps">
      <h2>Инструменты</h2>
      <ul class="pro-links">
        <li><a href="/idef0">IDEF0-редактор</a></li>
        <li><a href="/journal">Дневник</a></li>
        <li><a href="/finance">Финансы</a></li>
        <li><a href="/planner">Планировщик</a></li>
        <li><a href="/decision-journal">Журнал решений</a></li>
        <li><a href="/projects/idef0-editor">Разбор IDEF0</a></li>
      </ul>
    </section>

    <section class="pro-cta">
      <h2>Аудит зрелости платформы</h2>
      <p>Две недели диагностики: шесть доменов PDMM, метрики и сумма денег под риском. На выходе — дорожная карта, а не отчёт на полку.</p>
      <a class="btn btn-primary" href="/audit/" target="_self">Что входит в аудит</a>
    </section>
  </main>
</template>

<style scoped>
.pro-home {
  max-width: 1080px;
  margin: 0 auto;
  padding: 96px 24px 64px;
  color: var(--ds-text);
  font-family: var(--ds-font-body);
}
.pro-hero h1 {
  font-family: var(--ds-font-display);
  font-size: clamp(2.4rem, 6vw, 4rem);
  line-height: 1.05;
  margin: 8px 0 20px;
  color: var(--ds-text-strong);
}
.pro-kicker {
  margin: 0;
  color: var(--ds-text-dim);
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.pro-lead {
  max-width: 62ch;
  font-size: 1.15rem;
  line-height: 1.6;
  color: var(--ds-text-muted);
}
.pro-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}
.btn {
  display: inline-block;
  padding: 11px 20px;
  border-radius: var(--ds-radius);
  border: 1px solid var(--ds-border-strong);
  color: var(--ds-text);
  text-decoration: none;
  font-size: 0.95rem;
}
.btn:hover {
  border-color: var(--ds-accent-light);
  color: var(--ds-text-strong);
}
.btn-primary {
  background: var(--ds-accent);
  border-color: var(--ds-accent);
  color: var(--ds-on-accent);
}
.btn-primary:hover {
  background: var(--ds-accent-hover);
  color: var(--ds-on-accent);
}
.pro-proof,
.pro-apps,
.pro-cta {
  margin-top: 72px;
}
h2 {
  font-family: var(--ds-font-display);
  font-size: 1.6rem;
  margin-bottom: 20px;
  color: var(--ds-text-strong);
}
.pro-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
.pro-card {
  display: block;
  padding: 20px;
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-surface);
  text-decoration: none;
  color: inherit;
}
.pro-card:hover {
  border-color: var(--ds-border-strong);
  background: var(--ds-surface-solid);
}
.pro-card h3 {
  margin: 8px 0 10px;
  font-size: 1.2rem;
  color: var(--ds-text-strong);
}
.pro-card p {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--ds-text-muted);
}
.pro-card-tag {
  font-size: 0.78rem;
  color: var(--ds-text-dim);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.pro-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 22px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.pro-links a {
  color: var(--ds-text-muted);
  text-decoration: none;
  border-bottom: 1px solid var(--ds-border);
}
.pro-links a:hover {
  color: var(--ds-text-strong);
  border-color: var(--ds-accent-light);
}
.pro-cta p {
  max-width: 60ch;
  color: var(--ds-text-muted);
  line-height: 1.6;
  margin-bottom: 20px;
}
</style>
