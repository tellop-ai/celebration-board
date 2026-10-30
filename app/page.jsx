import { getLocale } from '../lib/i18n/index.js';
import { preferencesFor, listBoardsFor, listPostsFor } from '../lib/data/index.js';
import { currentPerson } from '../lib/data/person.js';
import { OWNER } from '../lib/celebration/rules.js';
import { abilities, boardStatusesFor, NO_ABILITIES } from '../lib/celebration/roles.js';
import { CelebrationApp } from './celebration-client';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }) {
  const query = await searchParams; let locale = getLocale(); let appearance = 'light'; let initial = {}; let rights = NO_ABILITIES;
  const view = ['preferences', 'present', 'print'].includes(query?.view) ? query.view : '';
  try {
    const { role } = await currentPerson(); rights = abilities(role); const statuses = boardStatusesFor(role);
    const preferences = await preferencesFor(OWNER); locale = preferences?.language ?? locale; appearance = preferences?.appearance ?? appearance;
    if (view !== 'preferences' && query?.board) {
      // Each role reads only the boards it may see; hidden and waiting messages are for the people who may show them.
      const board = await listPostsFor(OWNER, query.board, { visibleOnly: view === 'present' || view === 'print' || !rights.canChange, statuses });
      const navigation = view === 'print' ? null : await listBoardsFor(OWNER, { statuses });
      initial = { ...board, navigationBoards: navigation?.boards ?? [], navigationMore: Boolean(navigation?.next) };
    } else if (view !== 'preferences') {
      initial = { ...await listBoardsFor(OWNER, { archived: query?.archived === '1', query: query?.q ?? '', statuses }), archived: query?.archived === '1', query: query?.q ?? '' };
    }
  } catch (error) { initial = { problem: error.messageKey ?? 'error.storageUnreadable' }; }
  // The contained records channel returns dictionaries without prototypes.
  // This page selects JSON scalars only; React's server/client boundary needs ordinary objects.
  return <CelebrationApp initial={JSON.parse(JSON.stringify(initial))} locale={locale} appearance={appearance} view={view} canAdd={rights.canAdd} canChange={rights.canChange} />;
}
