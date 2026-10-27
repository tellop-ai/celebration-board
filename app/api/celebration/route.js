import { randomUUID } from 'node:crypto';
import { listBoardsFor, listPostsFor, readPostFor, saveBoardFor, savePostFor, setBoardStatusFor, setPostVisibilityFor, movePostFor, removePostFor, savePreferencesFor } from '../../../lib/data/index.js';
import { OWNER, object, fail } from '../../../lib/celebration/rules.js';
import { json, problem, readJson } from '../../../lib/celebration/http.js';
import { draftMessageFor } from '../../../lib/celebration/draft.js';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams;
    if (q.get('draft') === '1') return json({ id: randomUUID() });
    if (!q.has('board')) return json(await listBoardsFor(OWNER, { query: q.get('q') ?? '', archived: q.get('archived') === '1', after: q.get('after') }));
    if (q.has('post')) {
      const post = await readPostFor(OWNER, q.get('board'), q.get('post')); if (!post) fail('cb.notFound'); return json({ post });
    }
    return json(await listPostsFor(OWNER, q.get('board'), { after: q.get('after'), visibleOnly: q.get('visible') === '1' }));
  } catch (error) { return problem(error); }
}
export async function POST(request) {
  try {
    const input = object(await readJson(request)); let result;
    switch (input.action) {
      case 'create-board': result = await saveBoardFor(OWNER, input, true); break;
      case 'edit-board': result = await saveBoardFor(OWNER, input); break;
      case 'board-status': result = await setBoardStatusFor(OWNER, input.boardId, input.status, input.updatedAt); break;
      case 'create-post': result = await savePostFor(OWNER, input.boardId, input, true); break;
      case 'edit-post': result = await savePostFor(OWNER, input.boardId, input); break;
      case 'post-status': result = await setPostVisibilityFor(OWNER, input.boardId, input.id, input.status, input.updatedAt); break;
      case 'move-post': result = await movePostFor(OWNER, input.boardId, input.id, input.direction, input.updatedAt); break;
      case 'remove-post': result = await removePostFor(OWNER, input.boardId, input.id, input.updatedAt); break;
      case 'preferences': result = await savePreferencesFor(OWNER, input); break;
      case 'draft-message': result = await draftMessageFor(OWNER, input); break;
      default: fail();
    }
    return json({ ok: true, result });
  } catch (error) { return problem(error); }
}
