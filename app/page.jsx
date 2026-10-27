import { getLocale } from '../lib/i18n/index.js';
import { preferencesFor, listBoardsFor, listPostsFor } from '../lib/data/index.js';
import { OWNER } from '../lib/celebration/rules.js';
import { CelebrationApp } from './celebration-client';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }) {
  const query = await searchParams; let locale = getLocale(); let appearance = 'light'; let initial = {};
  const view = ['preferences', 'present', 'print'].includes(query?.view) ? query.view : '';
  try {
    const preferences = await preferencesFor(OWNER); locale = preferences?.language ?? locale; appearance = preferences?.appearance ?? appearance;
    if (view !== 'preferences') initial = query?.board ? await listPostsFor(OWNER, query.board, { visibleOnly: view === 'present' || view === 'print' }) : { ...await listBoardsFor(OWNER, { archived: query?.archived === '1', query: query?.q ?? '' }), archived: query?.archived === '1', query: query?.q ?? '' };
  } catch (error) { initial = { problem: error.messageKey ?? 'error.storageUnreadable' }; }
  // The contained records channel returns dictionaries without prototypes.
  // This page selects JSON scalars only; React's server/client boundary needs ordinary objects.
  return <CelebrationApp initial={JSON.parse(JSON.stringify(initial))} locale={locale} appearance={appearance} view={view} />;
}
