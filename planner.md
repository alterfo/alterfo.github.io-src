---
title: Planner
description: "Браузерный планировщик проектов и задач: канбан, список, приоритеты, теги, дедлайны. Шифрование AES-GCM, мост к файлу tasks.json для агентов. Локально, без облака."
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#0f172a;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1e293b;color:#fff;border-bottom:1px solid rgba(255,153,51,.3);flex-shrink:0;">
    <HomeMark active="planner" />
    <strong style="font-size:14px;color:#ff9933;">Planner</strong>
    <span style="font-size:12px;color:#94a3b8;margin-left:auto;">Encrypted project &amp; task planner</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <PlannerEditor />
    </ClientOnly>
  </div>
</div>
