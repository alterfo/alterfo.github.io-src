---
title: Piano Teacher
description: "Интерактивный MIDI-тренажёр фортепиано: ноты VexFlow, Web MIDI, метроном, импорт MusicXML/ABC/MIDI. Учит играть в браузере, прогресс хранится локально."
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#1a1a2e;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#12122a;border-bottom:1px solid #333;flex-shrink:0;">
    <a href="/" style="color:#8888cc;text-decoration:none;font-size:13px;">← Главная</a>
    <strong style="font-size:14px;color:#ddd;">Piano Teacher</strong>
    <span style="font-size:11px;color:#555;margin-left:auto;">MIDI · Web API · Локально</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <Piano />
    </ClientOnly>
  </div>
</div>
