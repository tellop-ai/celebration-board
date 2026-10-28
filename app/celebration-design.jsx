'use client';
import { Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { PALETTES } from '../lib/celebration/appearance.js';
import { t } from '../lib/i18n/index.js';

export function PalettePicker({ value, onChange, locale, disabled = false }) {
  return <fieldset className="cb-palette-panel" disabled={disabled}>
    <legend className="cb-palette-title">{t('cb.paletteTitle', locale)}</legend>
    <p className="cb-help">{t('cb.paletteHelp', locale)}</p>
    <div className="cb-palette-options">
      {PALETTES.map(palette => <Button key={palette} type="button" variant="outline" className="cb-palette-choice" data-palette-choice={palette} data-selected={value === palette ? 'true' : undefined} aria-pressed={value === palette} onClick={() => onChange(palette)}>
        <span className="cb-palette-strip" data-cb-swatch={palette} aria-hidden="true"><span /><span /><span /><span /></span>
        <span className="cb-palette-caption">{t(`cb.palette_${palette}`, locale)}{value === palette && <Check aria-hidden="true" />}</span>
      </Button>)}
    </div>
  </fieldset>;
}
