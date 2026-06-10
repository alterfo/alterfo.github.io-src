---
title: Planner
description: "Браузерный планировщик проектов и задач: канбан, список, приоритеты, теги, дедлайны. Шифрование AES-GCM, мост к файлу tasks.json для агентов. Локально, без облака."
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#f3f4f6;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1e293b;color:#fff;flex-shrink:0;">
    <a href="/" style="color:#7fb3d3;text-decoration:none;font-size:13px;">← Главная</a>
    <strong style="font-size:14px;">Planner</strong>
    <span style="font-size:12px;color:#94a3b8;margin-left:auto;">Encrypted project &amp; task planner</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <PlannerEditor />
    </ClientOnly>
  </div>
</div>
