---
site: pro
title: CV
description: "Олег Сидоркин — Engineering Manager и System Architect, Казань. 21 год в ИТ: 13 лет разработки, 8 лет руководства. AI-системы, Go, WebGPU, аудит архитектуры."
aside: false
outline: false
---

# Олег Сидоркин

**Engineering Manager · System Architect · Руководитель разработки**

Казань · удалённо, полная занятость · [osidorkin85@gmail.com](mailto:osidorkin85@gmail.com) ·
[github.com/alterfo](https://github.com/alterfo) · [@osidorkin85](https://t.me/osidorkin85)

21 год в ИТ: 13 лет коммерческой разработки, 8 из них руководство. Ищу узкое место в системе
и снимаю причину, а не симптом. Пишу код сам, поэтому совет не расходится с тем, что выполнимо
руками.

## Коротко

Начинал с эксплуатации: ITSM, мониторинг, SLA 99.999%, дежурства on-call. Дальше 13 лет
разработки, восемь из них техническое руководство: группы до 30 инженеров, ассессмент,
менторинг, стандарты, онбординг. Разбираю узкие места и в процессе, и в коде: тестовый стенд,
который лежал 80% времени, e2e-прогон на 20 минут вместо полутора часов, 80% медленных
запросов к базе. Продукты выводил в прод и вёл после релиза: логи, метрики, SLA, инциденты,
AppSec.

## Чем занимаюсь

- **AI-системы до продакшена.** RAG с графом знаний, верификация фактов, прогон через
  открытые бенчмарки, а не по ощущению «вроде работает».
- **Алго-трейдинг.** Данные, признаки, ансамбль моделей, риск-гейты, ньюс-вето.
- **Архитектура и производительность.** Разбор платформ по шести доменам, дорожная карта
  и цена бездействия — см. [аудит](/audit/).
- **Фронтенд и дизайн-системы.** Корпоративные компоненты, low-code, миграции без остановки
  продукта.

## Публичные проекты

| Проект | Что это | Доказательство |
|---|---|---|
| **kb** | RAG-движок: гибридный поиск, временной граф знаний, слой верификации. Первое место в русскоязычном RAG Leaderboard | [github.com/alterfo/kb](https://github.com/alterfo/kb) |
| **Approximate** | Алго-трейдер: Go, LightGBM + XGBoost, риск-гейты, ньюс-вето. Проверено 46 направлений на данных 2021–2026 | [moex-trader](https://github.com/alterfo/moex-trader), [исследование AlgoPack и MOEX](https://zenodo.org/records/24111519) |
| **FinContext MCP** | Финансовый контекст для AI-ассистента бизнеса, self-hosted в облаке клиента | [fincontext-mcp](https://github.com/alterfo/fincontext-mcp) |
| **IDEF0 Editor** | Редактор функциональных диаграмм по FIPS 183, валидация ICOM на лету | [/idef0](/idef0), [разбор](/projects/idef0-editor) |
| **Shelfprice** | Аудит ценников с локальной vision-моделью, экспорт в 1С | локальный проект |

## Навыки

**AI и LLM:** Advanced RAG, GraphRAG, logicRAG, MCP, Graph of Thoughts, LlamaIndex,
мультиагентная оркестрация, векторные базы данных, OpenSearch, оценка качества retrieval.

**ML и исследования:** TimesFM 3, Ridge-регрессия, временные ряды, новостные потоки,
Python, WebGPU, Wasm, on-device ML.

**Инженерия:** Go, TypeScript, JavaScript, Vue 3, React, Node.js, PostgreSQL, MongoDB,
SQLite, Redis, Kafka, Kubernetes, Docker, Terraform, Yandex Cloud (Functions, API Gateway,
YDB, Lockbox), CI/CD, Playwright, CODEOWNERS, монорепозитории, e2e-тесты, SAST/SCA,
Grafana, Sentry, RFC-процесс, code review, on-call, ITIL/ITSM.

**Руководство:** собеседования и оценка кандидатов, менторинг, онбординг, ИПР, обучение
интервьюеров, ассессмент, технические стандарты, фасилитация.

## Образование

- **ИЭУП (IEML)** — бакалавр, информационная безопасность телекоммуникационных систем.
- Project Management, Google.
- Startup Engineering, Stanford.

## Контакты

Почта: [osidorkin85@gmail.com](mailto:osidorkin85@gmail.com)
Telegram: [@osidorkin85](https://t.me/osidorkin85)
GitHub: [github.com/alterfo](https://github.com/alterfo)

Резюме в PDF и рекомендации — по запросу.

<style>
.vp-doc h1,
.vp-doc h2,
.vp-doc h3 {
  font-family: var(--ds-font-display);
  font-weight: 500;
  letter-spacing: -0.01em;
}
@media (min-width: 768px) {
  .site-header {
    height: 190px !important;
  }
}
.site-header .page-title {
  font-family: var(--ds-font-display);
  font-size: 2.6rem;
  letter-spacing: 0;
}
@media (max-width: 767px) {
  .site-header .animation-toggler {
    display: none;
  }
}
</style>
