---
title: Journal
description: "Приватный шифрованный дневник: 500 слов в день, счётчик серий, шифрование AES-GCM прямо в браузере. Данные не уходят в облако — только локально."
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#0f172a;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1e293b;border-bottom:1px solid rgba(255,102,136,.3);flex-shrink:0;">
    <HomeMark active="journal" />
    <strong style="font-size:14px;color:#ff6688;">Дневник</strong>
    <span style="font-size:12px;color:#94a3b8;margin-left:auto;">Приватно · Зашифровано · Локально</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <Journal />
    </ClientOnly>
  </div>
</div>
