---
title: Piano Teacher
description: "Интерактивный MIDI-тренажёр фортепиано: ноты VexFlow, Web MIDI, метроном, импорт MusicXML/ABC/MIDI. Учит играть в браузере, прогресс хранится локально."
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#0f172a;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1e293b;border-bottom:1px solid rgba(255,170,34,.3);flex-shrink:0;">
    <HomeMark active="piano" />
    <strong style="font-size:14px;color:#ffaa22;">Piano Teacher</strong>
    <span style="font-size:12px;color:#94a3b8;margin-left:auto;">MIDI · Web API · Локально</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <Piano />
    </ClientOnly>
  </div>
</div>
