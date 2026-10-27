import { getLocale, t } from '../lib/i18n/index.js';
import { preferencesFor } from '../lib/data/index.js';
import { OWNER } from '../lib/celebration/rules.js';
import './globals.css';
export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  let locale = getLocale(); try { locale = (await preferencesFor(OWNER))?.language ?? locale; } catch { /* The page shows the read failure. */ }
  return { title: t('cb.brand', locale) };
}
export default async function RootLayout({ children }) {
  let locale = getLocale(), appearance = 'light';
  try { const saved = await preferencesFor(OWNER); locale = saved?.language ?? locale; appearance = saved?.appearance ?? appearance; } catch { /* The page shows the read failure. */ }
  return <html lang={locale} className={appearance === 'dark' ? 'dark' : undefined}><body>{children}</body></html>;
}
