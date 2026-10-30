import { getLocale, t } from '../lib/i18n/index.js';
import { preferencesFor } from '../lib/data/index.js';
import { currentPerson, BACK_TO_OWNER } from '../lib/data/person.js';
import { OWNER } from '../lib/celebration/rules.js';
import { buttonVariants } from '../components/ui/button';
import './globals.css';
export const dynamic = 'force-dynamic';
export async function generateMetadata() {
  let locale = getLocale(); try { locale = (await preferencesFor(OWNER))?.language ?? locale; } catch { /* The page shows the read failure. */ }
  return { title: t('cb.brand', locale) };
}
export default async function RootLayout({ children }) {
  let locale = getLocale(), appearance = 'light', preview = false;
  try { const saved = await preferencesFor(OWNER); locale = saved?.language ?? locale; appearance = saved?.appearance ?? appearance; } catch { /* The page shows the read failure. */ }
  // The owner looking at the app as a Member or a Viewer gets a way back to their own view on every page.
  try { preview = (await currentPerson()).preview; } catch { /* The page shows the read failure. */ }
  return <html lang={locale} className={appearance === 'dark' ? 'dark' : undefined}><body>
    {preview && <div data-print-hidden className="flex justify-end px-4 pt-3"><a href={BACK_TO_OWNER} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t('cb.backToOwnView', locale)}</a></div>}
    {children}
  </body></html>;
}
