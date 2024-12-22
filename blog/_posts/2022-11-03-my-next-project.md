---
title: Выбор стека технологий (введение и кейсы)
date: 2022-11-03
permalink: /stack-1
---

Речь пойдет о выборе и использовании fullstack-инструментария после 10 лет занятия разработкой на проектах, из которых с нуля я начинал только 2.

Стек технологий очень важен, он выбирается один раз на всю жизнь проекта, а некоторые проекты вдруг обнаруживают что заменить mongodb на postgresql когда база данных уже весит несколько гигабайт и активно используется очень дорого, а найти разработчиков со знанием graphql очень сложно.

Поэтому при выборе очень часто принято отталкиваться от рынка. Ведь правда - чем больше хайпа вокруг фреймворка, тем проще на нем разрабатывать и искать исполнителей.

Я люблю Ruby on Rails, но выбрать его для нового проекта я бы не хотел, потому что замена разработчика будет стоить очень дорого.

Как бы мне не был отвратителен React и как бы у меня не болели глаза от миллионов строк кода, которые я увидел, выбирать Vue и Angular тоже довольно рискованно ввиду ригидности этих технологий.

Стек технологий обычно содержит
- хранилище данных - это база данных и файловое хранилище
  - базы данных
    - Postgres
    - MS SQL
    - Elasticsearch
    - MongoDB
    - memcached,
    - Redis
    - etc...
  - хранилища
    - minio
    - S3
    - RAS
- бэкенд-фреймворк - его выбор зависит от ландшафта и требований, обычно содержит ORM - синтаксический сахар над SQL-запросами.
  - Django (Python)
  - Ruby on Rails
  - ExpressJS (Nest, Next, Nuxt, Meteor)
  - Lavarel (PHP)
  - .Net core
  - Spring (Java)
  - Jamstack - Headless CMS (Strapi, Contentful, Gatsby) - пользовательский интерфейс для создания и изменения структур контента
- фронтенд-фреймворк - его выбор зависит от набора компонентов пользовательского интерфейса и количества и динамичности данных которые будут обрабатываться на фронтенде.
  - React
  - Angular
  - Vue
  - Ember
  - Svelte
  - Tooling - typescript, eslint, prettier, webpack, turbopack, etc...
  - кроме прочего, нужно выбрать библиотеку компонент и css-framework (tailwind, bootstrap, foundation)
- системы виртуализации-контейнеризации
  - Docker (kubernetes)
  - VMWare
- API (внутренний или внешний программный интерфейс для интеграции), например:
  - Graphql
  - Kafka
  - Twilio
  - Auth0

Также, в зависимости от требований проекта, необходимо заранее задуматься об инфраструктуре и процессе деплоя приложения
- CI/CD
- мониторинг (prometheus, graphana)
- парсер логов (kibana)
и выписать конкретные показатели которые необходимо отслеживать и ранжировать по критичности.

Итак, для того чтобы выбрать стек, нужно определить проблему. Затем нужно определить ландшафт и данные, которые мы будем хранить и обрабатывать.

Возьмем для примера несколько кейсов из PropTech, EdTech, FinTech и HR-Tech. 

Кейс 1. EdTech
-

Необходимо создать систему тестирования учащихся (без уточнения - школ, вузов, онлайн-курсов) с возможностью проведения нескольких видов тестов:
- тест на выбор правильного ответа
- тест со свободным полем ввода
- тест-паззл
- загрузка документа с ответом

И SLA:
- загрузка страницы должна быть меньше 1 секунды
- система должна выдерживать одновременную нагрузку 10000 учеников.


Кейс 2. FinTech
-

Необходимо создать консоль управления SaaS-инфраструктурой для облачного сервиса и интеграцией с AD заказчика.
Пользователь будет только один - генеральный директор компании, то есть продукт должен быть законченным и не содержать багов.


Кейс 3. PropTech
-

Необходимо создать облачное решение для планирования и технического надзора проектного строительства.
Требования:
- Автономная работа без интернета
- Умение работать с BIM (стандартизированный формат файлов для описания архитектуры здания)
- Безопасность данных
Задача - выстроить соответствия между конструкциями здания (водопровод, вентиляция, отделка, перекрытия) и конкретными подрядчиками, выполняющими данный вид работ.

Кейс 4. HR-Tech
-

Необходимо создать продукт полного цикла для "стаффинга" - поиск и найм кандидатов, ведение личных дел, ознакомление с регламентами компании, фидбеки, интервью, распределение между проектами компании, API для получение информации из других систем и увольнение.

Кейс 5. Личный блог разработчика
-

Полушуточный кейс - необходимо создать бесплатную среду для записи и публикации мыслей в которую будет удобно писать и обслуживание хостинга не должно занимать много времени.

***
Чтобы не перегружать статью, мой субъективный выбор архитектуры для каждого кейса будет подробно расписан в следующих статьях.