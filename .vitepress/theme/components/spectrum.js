// Single source for the spectrum palette (mirror of CSS --ds-* spectrum tokens
// in ../styles/vars.css). CSS cannot be imported as JS values, so the hex values
// are duplicated here — keep both in sync when changing a color.

// 9 semantic spectrum colors = «сферы круга жизни» = project colors.
// Холодный графит + благородные акценты (заменили тёплую «осеннюю» землю
// terracotta/ochre/olive 2026-07-12 — читалась как палая листва, не элитно).
// graphite/«графит» (#9098a8) is the 8th sphere — музыка (/music).
// indigo/«индиго» (#4a3868) is the 9th sphere — финансы (/finance).
// With 9 spheres the wheel now uses the full CANVAS_PALETTE — no extra colors.
export const SPECTRUM = ['#7a3348', '#a8874a', '#3f5946', '#8a5568', '#4a6178', '#6b5a48', '#2d5654', '#9098a8', '#4a3868']

// Particle palette = the 9 spectrum colors exactly (wheel and canvas now fully aligned).
// rgba() prefixes — the alpha + ')' is appended at draw time.
export const CANVAS_PALETTE = [
  'rgba(122,51,72,', 'rgba(168,135,74,', 'rgba(63,89,70,',
  'rgba(138,85,104,', 'rgba(74,97,120,', 'rgba(107,90,72,',
  'rgba(45,86,84,', 'rgba(144,152,168,', 'rgba(74,56,104,',
]

// Проект → цвет-сфера
export const PROJECT_COLORS = {
  ar: '#7a3348', blog: '#a8874a', idef0: '#3f5946',
  journal: '#8a5568', piano: '#4a6178', github: '#6b5a48',
  decisions: '#2d5654', music: '#9098a8', finance: '#4a3868',
}
