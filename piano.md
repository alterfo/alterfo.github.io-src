---
title: Piano Teacher
description: "Интерактивный нотный MIDI-тренажёр фортепиано: живые ноты на экране, Web MIDI, аккорды — трезвучия и двузвучия, метроном, импорт MusicXML/ABC/MIDI. Играть в браузере, прогресс — локально."
layout: false
---

<AppHeader sphere="piano" title="Piano Teacher">
  <Piano />
</AppHeader>

<div class="piano-seo">

## Нотный тренажёр фортепиано с живым MIDI-вводом

**Piano Teacher** — интерактивный MIDI-тренажёр для игры на фортепиано прямо в браузере (interactive MIDI piano trainer). Подключите MIDI-клавиатуру или контроллер по USB — тренажёр через Web MIDI API распознаёт каждую нажатую клавишу, показывает ноты на экране и ведёт вас по произведению нота за нотой или такт за тактом.

### Возможности

- **Живой ввод с MIDI-клавиатуры** — Web MIDI API, работает без установки драйверов
- **Ноты на экране** — нотный стан рендерится через VexFlow/OpenSheetMusicDisplay, подсвечивает текущую и следующую ноту
- **Аккорды: трезвучия и двузвучия** — тренажёр распознаёт двух- и трёхзвучные аккорды, подсвечивает все клавиши аккорда зелёным
- **Встроенные произведения** — гамма До мажор, «Twinkle Twinkle», Менуэт соль мажор (Петцольд/Бах), «Ода к радости» (Бетховен), Прелюдия Рахманинова, «Лунный свет» Дебюсси
- **Импорт своих нот** — MusicXML, MIDI-файлы и ABC-нотация
- **Метроном и регулировка темпа** — 50% / 75% / 100% от исходного
- **HD-звук** — сэмплы Salamander Grand Piano
- **Прогресс сохраняется локально** — в IndexedDB браузера, без регистрации и без облака

### Частые вопросы

**Нужна ли MIDI-клавиатура?** Да, любая MIDI-клавиатура или контроллер с USB/MIDI-выходом. Браузер должен поддерживать Web MIDI API — работает в Chrome и Edge, в Firefox через флаг `dom.webmidi.enabled`, в Safari не поддерживается.

**Это бесплатно?** Да, тренажёр открывается прямо в браузере, без регистрации и оплаты.

**Куда сохраняется прогресс?** Локально, в IndexedDB браузера — данные не отправляются на сервер.

**Можно ли тренировать аккорды, а не только отдельные ноты?** Да — тренажёр умеет и одиночные ноты, и двузвучия/трезвучия: подсказка на клавиатуре и подсветка на нотном стане показывают все ноты аккорда одновременно.

</div>

<style scoped>
.piano-seo {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 24px 64px;
  color: var(--ds-text);
  font-family: var(--ds-font-body);
  line-height: 1.6;
}
.piano-seo h2 {
  font-family: var(--ds-font-display);
  font-size: 26px;
  color: var(--ds-text-strong);
  margin: 0 0 16px;
}
.piano-seo h3 {
  font-family: var(--ds-font-body);
  font-size: 15px;
  font-weight: 600;
  color: var(--ds-text-strong);
  margin: 32px 0 12px;
}
.piano-seo p, .piano-seo li {
  color: var(--ds-text-muted);
}
.piano-seo strong {
  color: var(--ds-text);
}
.piano-seo ul {
  padding-left: 20px;
}
.piano-seo li {
  margin: 6px 0;
}
</style>
