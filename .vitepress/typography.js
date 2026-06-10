// Pure typographic helpers (plain ESM, unit-tested with node --test — same
// convention as seo.js). Imported by config.mts.

// Русская типографика: перед длинным тире всегда неразрывный пробел, чтобы
// тире не отрывалось от слова при переносе строки: «слово — слово».
// Схлопывает один и более обычных пробелов/табов перед «—» в один U+00A0;
// уже стоящий nbsp не трогает (идемпотентно), тире в начале строки
// (прямая речь «— реплика») не затрагивает.
export function nbspBeforeDash(text) {
  return String(text).replace(/[ \t]+(?=—|&mdash;)/g, '\u00A0')
}

// То же правило на уровне inline-токенов markdown-it. Нужен отдельный проход,
// потому что «—», записанное сущностью &mdash;, парсится в свой text_special-токен,
// а пробел перед ним остаётся в хвосте предыдущего text-токена — строковая замена
// внутри одного токена этот случай не видит. Рекурсия покрывает вложенные children
// (alt-текст картинок). Токены — плоские объекты → функция тестируется без markdown-it.
export function applyNbspToInlineTokens(children) {
  for (let i = 0; i < children.length; i++) {
    const t = children[i]
    if (t.children && t.children.length) applyNbspToInlineTokens(t.children)
    if (t.type === 'text') {
      t.content = nbspBeforeDash(t.content)
    } else if (t.type === 'softbreak') {
      // Перенос строки прямо перед тире — ровно то, от чего правило защищает:
      // склеиваем перенос в неразрывный пробел (markdown-перенос мягкий, не <br>).
      const next = children[i + 1]
      if (next && next.type === 'text' && /^(—|&mdash;)/.test(next.content)) {
        t.type = 'text'
        t.content = '\u00A0'
      }
    } else if (t.type === 'text_special' && t.content === '—' && i > 0) {
      const prev = children[i - 1]
      if (prev.type === 'text' && /[ \t]$/.test(prev.content)) {
        prev.content = prev.content.replace(/[ \t]+$/, ' ')
      }
    }
  }
}
