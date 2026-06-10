---
title: IDEF0 Editor
description: "Браузерный редактор IDEF0-диаграмм по стандарту FIPS 183: SVG-блоки, ICOM-стрелки, декомпозиция, экспорт SVG/PNG/JSON. Локально, данные не уходят в облако."
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#f3f4f6;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1e293b;color:#fff;border-bottom:1px solid rgba(51,255,77,.3);flex-shrink:0;">
    <HomeMark active="idef0" />
    <strong style="font-size:14px;color:#33ff4d;">IDEF0 Editor</strong>
    <span style="font-size:12px;color:#94a3b8;margin-left:auto;">FIPS 183 Functional Diagram Editor</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <IDEF0Editor />
    </ClientOnly>
  </div>
</div>
