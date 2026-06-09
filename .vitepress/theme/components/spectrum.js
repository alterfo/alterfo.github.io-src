// Single source for the spectrum palette (mirror of CSS --ds-* spectrum tokens
// in ../styles/vars.css). CSS cannot be imported as JS values, so the hex values
// are duplicated here — keep both in sync when changing a color.

// 6 semantic spectrum colors = «сферы круга жизни» = project colors.
export const SPECTRUM = ['#b34dff', '#1accff', '#33ff4d', '#ff6688', '#ffaa22', '#ff9933']

// Extended palette for particle richness (adds teal + yellow от старой шапки).
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
}
