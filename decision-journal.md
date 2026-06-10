---
title: Журнал решений
description: "Журнал решений с калибровкой: записываете выбор, уверенность в процентах и дату ревью — по наступлении даты отмечаете исход, приложение считает Brier score и калибровку по корзинам. Шифрование AES-GCM, локально, без облака."
layout: false
---

<div style="height:100vh;display:flex;flex-direction:column;background:#0f172a;">
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1e293b;color:#fff;border-bottom:1px solid rgba(51,255,204,.3);flex-shrink:0;">
    <HomeMark active="decisions" />
    <strong style="font-size:14px;color:#33ffcc;">Журнал решений</strong>
    <span style="font-size:12px;color:#94a3b8;margin-left:auto;">Калибровка решений · шифрование AES-GCM</span>
  </div>
  <div style="flex:1;min-height:0;overflow:hidden;">
    <ClientOnly>
      <DecisionJournal />
    </ClientOnly>
  </div>
</div>
