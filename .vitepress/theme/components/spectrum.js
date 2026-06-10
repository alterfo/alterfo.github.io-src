// Single source for the spectrum palette (mirror of CSS --ds-* spectrum tokens
// in ../styles/vars.css). CSS cannot be imported as JS values, so the hex values
// are duplicated here — keep both in sync when changing a color.

// 7 semantic spectrum colors = «сферы круга жизни» = project colors.
// teal (#33ffcc) is the 7th sphere — журнал решений (/decision-journal).
export const SPECTRUM = ['#b34dff', '#1accff', '#33ff4d', '#ff6688', '#ffaa22', '#ff9933', '#33ffcc']

// Extended palette for particle richness (adds yellow от старой шапки after the
// 7 spectrum colors — teal is now part of the spectrum, no longer just decorative).
// rgba() prefixes — the alpha + ')' is appended at draw time.
export const CANVAS_PALETTE = [
  'rgba(179,77,255,', 'rgba(26,204,255,', 'rgba(51,255,77,',
  'rgba(255,102,136,', 'rgba(255,170,34,', 'rgba(255,153,51,',
  'rgba(51,255,204,', 'rgba(255,230,51,',
]

// Проект → цвет-сфера
export const PROJECT_COLORS = {
  ar: '#b34dff', blog: '#1accff', idef0: '#33ff4d',
  journal: '#ff6688', piano: '#ffaa22', github: '#ff9933',
  decisions: '#33ffcc',
}
