---
title: OpenPose Editor
description: "Браузерный редактор поз: детекция скелета MediaPipe BlazePose (WASM), drag-edit ключевых точек, экспорт PNG + OpenPose JSON для ControlNet. Локально, без сервера."
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#0f172a;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1e293b;border-bottom:1px solid rgba(26,204,255,.3);flex-shrink:0;">
    <HomeMark active="openpose" />
    <strong style="font-size:14px;color:#1accff;">OpenPose Editor</strong>
    <span style="font-size:12px;color:#94a3b8;margin-left:auto;">MediaPipe · WASM · Локально</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <OpenPoseEditor />
    </ClientOnly>
  </div>
</div>
