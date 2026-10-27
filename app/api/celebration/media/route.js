import { readBoardFor, readMediaFor } from '../../../../lib/data/index.js';
import { fileResponse } from '../../../../lib/data/files.js';
import { OWNER } from '../../../../lib/celebration/rules.js';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  try {
    const download = q.get('download') === '1'; let file = null;
    if (q.get('cover') === '1') {
      const board = await readBoardFor(OWNER, q.get('board'));
      file = download ? board?.coverFile : board?.coverDisplayFile ?? board?.coverFile;
    } else {
      const media = await readMediaFor(OWNER, q.get('board'), q.get('id'), { postId: q.get('post'), visibleOnly: q.get('visible') === '1' });
      file = download ? media?.originalFile : media?.displayFile ?? media?.originalFile;
    }
    return await fileResponse(file ?? null, request, download ? { use: 'download' } : {});
  } catch { return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } }); }
}
export const HEAD = GET;
