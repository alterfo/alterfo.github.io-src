---
title: Journal
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#2c2c2c;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1a1a1a;border-bottom:1px solid #444;flex-shrink:0;">
    <a href="/" style="color:#8888cc;text-decoration:none;font-size:13px;">← Главная</a>
    <strong style="font-size:14px;color:#ddd;">Дневник</strong>
    <span style="font-size:11px;color:#666;margin-left:auto;">Приватно · Зашифровано · Локально</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <Journal />
    </ClientOnly>
  </div>
</div>
