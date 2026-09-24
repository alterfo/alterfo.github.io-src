// Single source for the spectrum palette (mirror of CSS --ds-* spectrum tokens
// in ../styles/vars.css). CSS cannot be imported as JS values, so the hex values
// are duplicated here — keep both in sync when changing a color.

// 10 semantic spectrum colors = «сферы круга жизни» = project colors.
// «Paper & Ink» — тёплая бумага + благородные акценты, пересчитанные под
// светлый фон (заменили холодный графит «Spiral» 2026-09-24 — см.
// vars.css и .vitepress/CLAUDE.md для контраст-чисел).
// graphite/«графит» (#616b7f) is the 8th sphere — музыка (/music).
// indigo/«индиго» (#4a366a) is the 9th sphere — финансы (/finance).
// turquoise/«бирюза» (#34737e) is the 10th sphere — пазлы (/casual-games).
// With 10 spheres the wheel now uses the full CANVAS_PALETTE — no extra colors.
export const SPECTRUM = ['#7d3047', '#806634', '#3e5a46', '#8c5367', '#48617a', '#6c5a47', '#2b5855', '#616b7f', '#4a366a', '#34737e']

// Particle palette = the 10 spectrum colors exactly (wheel and canvas now fully aligned).
// rgba() prefixes — the alpha + ')' is appended at draw time.
export const CANVAS_PALETTE = [
  'rgba(125,48,71,', 'rgba(128,102,52,', 'rgba(62,90,70,',
  'rgba(140,83,103,', 'rgba(72,97,122,', 'rgba(108,90,71,',
  'rgba(43,88,85,', 'rgba(97,107,127,', 'rgba(74,54,106,', 'rgba(52,115,126,',
]

// Проект → цвет-сфера
export const PROJECT_COLORS = {
  ar: '#7d3047', blog: '#806634', idef0: '#3e5a46',
  journal: '#8c5367', piano: '#48617a', github: '#6c5a47',
  decisions: '#2b5855', music: '#616b7f', finance: '#4a366a', games: '#34737e',
}
