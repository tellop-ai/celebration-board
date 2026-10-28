// Only these preset names may select a stylesheet. Saved colors never become CSS.
export const PALETTES = Object.freeze(['claret', 'sage', 'linen', 'navy', 'rose', 'violet']);
export const LAYOUTS = Object.freeze(['gallery', 'reading']);
export const DEFAULT_PALETTE = 'rose';

// Unknown saved values are never allowed to select a stylesheet.
export function readAppearance(layout, palette = DEFAULT_PALETTE) {
  const chosen = palette == null ? DEFAULT_PALETTE : palette;
  return LAYOUTS.includes(layout) && PALETTES.includes(chosen) ? { layout, palette: chosen } : null;
}
export function writeAppearance(layout, palette) {
  return readAppearance(layout, palette);
}
export function occasionPalette(occasion) {
  return occasion === 'farewell' ? 'navy' : DEFAULT_PALETTE;
}
export function promptKey(occasion, kind) {
  if (kind === 'wish') return occasion === 'wedding' ? 'cb.promptTogether' : occasion === 'farewell' ? 'cb.promptNext' : 'cb.promptWish';
  return kind === 'memory' ? 'cb.promptMemory' : 'cb.promptAdmire';
}
