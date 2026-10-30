// Who may press and read what online (AGENTS.md rule 1): the rule in lib/celebration/roles.js for each role, and the
// board's own addresses for each role. Writes go through a stand-in host that refuses as Tellop's online host does:
// every write by a Viewer, and a Member's change or removal of a row the Member did not add. Reads need only the
// person the host names, so they run on the local store.
import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const originalCwd = process.cwd();
process.chdir(root);
const scratch = await mkdtemp(path.join(os.tmpdir(), 'celebration-roles-'));
const previousFile = process.env.APP_DATA_FILE;
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');
const data = await import('../lib/data/index.js');
const { keepFile } = await import('../lib/data/files.js');
const { canAdd, canChange, abilities, boardStatusesFor, takesMessages, NO_ABILITIES } = await import('../lib/celebration/roles.js');
const { OWNER } = await import('../lib/celebration/rules.js');
const { GET, POST } = await import('../app/api/celebration/route.js');
const { GET: mediaGet } = await import('../app/api/celebration/media/route.js');
const { t } = await import('../lib/i18n/index.js');

const PERSON = Symbol.for('tellop.person');
const ACTION = Symbol.for('tellop.internalRecordsAction');
const priorFlag = process.env.TELLOP_INTERNAL_RECORDS;
const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const ONE_ROW = new Set(['update', 'upsert', 'delete']);
const DOOR_ID = 'p_abcdefghijklmnopqrstuv';
const ROLES = ['owner', 'helper', 'member', 'viewer'];

afterEach(() => {
  delete globalThis[PERSON]; delete globalThis[ACTION];
  if (priorFlag === undefined) delete process.env.TELLOP_INTERNAL_RECORDS; else process.env.TELLOP_INTERNAL_RECORDS = priorFlag;
});
after(async () => {
  await data.closeStorage(); process.chdir(originalCwd);
  if (previousFile === undefined) delete process.env.APP_DATA_FILE; else process.env.APP_DATA_FILE = previousFile;
  await rm(scratch, { recursive: true, force: true });
});

// The person the host names; on its own it leaves every records call on the local store.
function person(role) {
  const named = role === 'owner' ? { id: 'owner', name: null, role } : { id: DOOR_ID, name: null, role };
  globalThis[PERSON] = async () => named;
}
// The host, simplified to the rows these checks touch: it keeps who added each row and runs a batch on the local
// store, all of it or none of it. A Member's update, upsert or removal of one row they did not add is refused.
function host(role, added = new Set()) {
  person(role);
  globalThis[ACTION] = async steps => {
    if (role === 'viewer' && steps.some(step => WRITES.has(step.action))) throw new Error('records-forbidden');
    if (role === 'member' && steps.some(step => ONE_ROW.has(step.action) && !added.has(`${step.model}:${step.args.where?.id ?? step.args.where?.ownerId}`))) throw new Error('records-forbidden');
    delete process.env.TELLOP_INTERNAL_RECORDS;
    try { return await data.modelBatch(steps); }
    finally {
      process.env.TELLOP_INTERNAL_RECORDS = '1';
      for (const step of steps) if (step.action === 'create') added.add(`${step.model}:${step.args.data.id ?? step.args.data.ownerId}`);
    }
  };
  process.env.TELLOP_INTERNAL_RECORDS = '1';
}
function local() { delete process.env.TELLOP_INTERNAL_RECORDS; delete globalThis[ACTION]; delete globalThis[PERSON]; }
const send = async body => {
  const answer = await POST(new Request('http://app.invalid/api/celebration', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: answer.status, ...(await answer.json()) };
};
const read = async query => {
  const answer = await GET(new Request(`http://app.invalid/api/celebration?${new URLSearchParams(query)}`));
  return { status: answer.status, ...(await answer.json()) };
};
const picture = async query => (await mediaGet(new Request(`http://app.invalid/api/celebration/media?${new URLSearchParams(query)}`))).status;
const boardInput = () => ({ id: randomUUID(), title: 'A board for roles', recipient: 'Example person', occasion: 'thanks', layout: 'gallery' });
const postInput = (body = 'A kind word', media = []) => ({ id: randomUUID(), authorName: 'Sample signer', body, media });
const gif = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,255,255,255,0,0,0,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);
const kept = async () => (await keepFile(new Request('http://app.invalid/api/files', { method: 'POST', body: gif }))).file;

// A board of the owner's with one shown, one hidden and one waiting message, each with a picture, then set to `status`.
async function ownersBoard(status = 'draft') {
  local();
  const file = await kept();
  let board = await data.saveBoardFor(OWNER, { ...boardInput(), coverFile: file }, true);
  const shown = postInput('Shown to everyone', [{ originalFile: file }]);
  await data.savePostFor(OWNER, board.id, shown, true);
  const hidden = postInput('Hidden by the owner', [{ originalFile: file }]);
  await data.savePostFor(OWNER, board.id, hidden, true);
  const saved = await data.readPostFor(OWNER, board.id, hidden.id);
  await data.setPostVisibilityFor(OWNER, board.id, hidden.id, 'hidden', saved.updatedAt);
  const waiting = postInput('Waiting for review', [{ originalFile: file }]);
  await data.savePostFor(OWNER, board.id, waiting, true, { guest: DOOR_ID });
  board = await data.readBoardFor(OWNER, board.id);
  if (status !== 'draft') board = await data.setBoardStatusFor(OWNER, board.id, status, board.updatedAt);
  const posts = {};
  for (const [name, input] of Object.entries({ shown, hidden, waiting })) posts[name] = await data.readPostFor(OWNER, board.id, input.id);
  return { board, posts };
}

test('each role may add, change and read what the rule says, and an unknown role nothing', () => {
  assert.deepEqual(abilities('owner'), { canAdd: true, canChange: true });
  assert.deepEqual(abilities('helper'), { canAdd: true, canChange: true });
  assert.deepEqual(abilities('member'), { canAdd: true, canChange: false });
  assert.deepEqual(abilities('viewer'), { canAdd: false, canChange: false });
  assert.equal(boardStatusesFor('owner'), null);
  assert.equal(boardStatusesFor('helper'), null);
  assert.deepEqual(boardStatusesFor('member'), ['draft', 'collecting', 'ready']);
  assert.deepEqual(boardStatusesFor('viewer'), ['ready']);
  for (const unknown of [undefined, null, '', 'Owner', 'guest']) {
    assert.equal(canAdd(unknown), false); assert.equal(canChange(unknown), false); assert.deepEqual(boardStatusesFor(unknown), []);
  }
  assert.deepEqual(NO_ABILITIES, { canAdd: false, canChange: false });
  assert.deepEqual(['draft', 'collecting', 'ready', 'archived'].filter(takesMessages), ['draft', 'collecting']);
});

test('a new message from each role: the owner and a Helper put it on the board, a Member\'s waits for review, a Viewer adds none', async () => {
  for (const role of ROLES) {
    const { board } = await ownersBoard();
    host(role);
    const input = postInput(`From the ${role}`);
    const answer = await send({ action: 'create-post', boardId: board.id, ...input, status: 'visible', origin: 'owner', createdBy: OWNER, reviewedBy: OWNER });
    local();
    const stored = await data.modelAction('Post', 'findUnique', { where: { id: input.id }, select: { status: true, origin: true, createdBy: true, reviewedBy: true, reviewedAt: true } });
    const now = await data.readBoardFor(OWNER, board.id);
    if (role === 'viewer') {
      assert.equal(answer.problem, 'error.cannotChange', role); assert.equal(stored, null, role);
    } else if (role === 'member') {
      assert.equal(answer.status, 200, role); assert.equal(answer.result.status, 'pending', role);
      assert.deepEqual({ ...stored }, { status: 'pending', origin: 'guest', createdBy: DOOR_ID, reviewedBy: null, reviewedAt: null }, role);
      assert.equal(now.updatedAt, board.updatedAt, `${role}: the board's own record is left as it was`);
    } else {
      assert.equal(answer.status, 200, role); assert.equal(answer.result.status, 'visible', role);
      assert.equal(stored.status, 'visible', role); assert.equal(stored.origin, 'owner', role); assert.equal(stored.createdBy, OWNER, role); assert.ok(stored.reviewedAt, role);
      assert.notEqual(now.updatedAt, board.updatedAt, `${role}: open pages see the change`);
    }
  }
  assert.equal(t('cb.sentForReview', 'en'), 'Saved. Your message shows on the board after it is reviewed.');
});

test('a board that asks for no review shows a Member\'s message at once', async () => {
  const { board } = await ownersBoard();
  await data.modelAction('Board', 'update', { where: { id: board.id }, data: { reviewRequired: false } });
  host('member');
  const answer = await send({ action: 'create-post', boardId: board.id, ...postInput() });
  assert.equal(answer.result.status, 'visible');
});

test('a Member adds only to a board still taking messages, and a closed board says why', async () => {
  for (const [status, expected] of [['draft', 200], ['collecting', 200], ['ready', 'cb.closedToMessages'], ['archived', 'cb.notFound']]) {
    const { board } = await ownersBoard(status);
    host('member');
    const input = postInput();
    const answer = await send({ action: 'create-post', boardId: board.id, ...input });
    if (expected === 200) assert.equal(answer.status, 200, status); else assert.equal(answer.problem, expected, status);
    local();
    assert.equal(Boolean(await data.readPostFor(OWNER, board.id, input.id)), expected === 200, status);
  }
  assert.equal(t('cb.closedToMessages', 'en'), 'This board is no longer taking new messages.');
  assert.equal(t('cb.closedToMessages', 'tr'), 'Bu pano artık yeni mesaj almıyor.');
});

test('the owner and a Helper put a waiting message on the board with Show, or hide it; presenting shows only what is on the board', async () => {
  for (const role of ['owner', 'helper']) {
    const { board, posts } = await ownersBoard();
    host(role);
    assert.equal((await send({ action: 'post-status', boardId: board.id, id: posts.waiting.id, status: 'visible', updatedAt: posts.waiting.updatedAt })).status, 200, role);
    local();
    const shown = await data.modelAction('Post', 'findUnique', { where: { id: posts.waiting.id }, select: { status: true, reviewedBy: true, reviewedAt: true } });
    assert.equal(shown.status, 'visible', role); assert.ok(shown.reviewedBy, role); assert.ok(shown.reviewedAt, role);
    assert.deepEqual((await data.listPostsFor(OWNER, board.id, { visibleOnly: true })).posts.map(post => post.body).sort(), ['Shown to everyone', 'Waiting for review'], role);
    const other = await ownersBoard();
    host(role);
    assert.equal((await send({ action: 'post-status', boardId: other.board.id, id: other.posts.waiting.id, status: 'hidden', updatedAt: other.posts.waiting.updatedAt })).status, 200, role);
    local();
    assert.equal((await data.readPostFor(OWNER, other.board.id, other.posts.waiting.id)).status, 'hidden', role);
  }
});

test('a Member adds a board, and the changes a Member cannot make show "You cannot change this."', async () => {
  const { board } = await ownersBoard();
  await data.savePreferencesFor(OWNER, { language: 'en', appearance: 'light' });
  host('member');
  const own = boardInput();
  assert.equal((await send({ action: 'create-board', ...own })).status, 200);
  for (const change of [
    { action: 'edit-board', ...board, coverFile: undefined, coverDisplayFile: undefined, title: 'Changed by a Member' },
    { action: 'board-appearance', boardId: board.id, updatedAt: board.updatedAt, palette: 'sage' },
    { action: 'board-status', boardId: board.id, updatedAt: board.updatedAt, status: 'archived' },
    { action: 'preferences', language: 'tr', appearance: 'dark' },
  ]) {
    const answer = await send(change);
    assert.equal(answer.problem, 'error.cannotChange', change.action);
    assert.notEqual(t(answer.problem, 'en'), t('error.saveFailed', 'en'));
  }
  local();
  assert.equal((await data.readBoardFor(OWNER, board.id)).title, board.title);
  assert.deepEqual({ ...await data.preferencesFor(OWNER) }, { language: 'en', appearance: 'light' });
  assert.ok(await data.readBoardFor(OWNER, own.id));
  host('viewer');
  assert.equal((await send({ action: 'create-board', ...boardInput() })).problem, 'error.cannotChange');
  assert.equal((await send({ action: 'draft-message', boardId: board.id, draft: '', tone: 'warm', language: 'en' })).problem, 'error.cannotChange');
});

test('hidden and waiting messages and their pictures reach only the owner and Helpers, with or without visible=1', async () => {
  const { board, posts } = await ownersBoard('ready');
  for (const role of ROLES) {
    person(role);
    const everything = role === 'owner' || role === 'helper';
    const page = await read({ board: board.id });
    assert.deepEqual(page.posts.map(post => post.body).sort(), everything ? ['Hidden by the owner', 'Shown to everyone', 'Waiting for review'] : ['Shown to everyone'], role);
    assert.equal((await read({ board: board.id, visible: '1' })).posts.length, 1, role);
    for (const name of ['shown', 'hidden', 'waiting']) {
      const post = posts[name]; const reaches = everything || name === 'shown';
      const one = await read({ board: board.id, post: post.id });
      assert.equal(one.status, reaches ? 200 : 404, `${role} reads the ${name} message`);
      if (reaches) assert.equal(one.post.id, post.id);
      const media = { board: board.id, post: post.id, id: post.media[0].id };
      assert.equal(await picture(media), reaches ? 200 : 404, `${role} opens the ${name} message's picture`);
      assert.equal(await picture({ ...media, download: '1' }), reaches ? 200 : 404, `${role} downloads the ${name} message's picture`);
      assert.equal(await picture({ ...media, visible: '1' }), name === 'shown' ? 200 : 404, `${role}, visible=1, ${name}`);
    }
  }
});

test('a Viewer sees only ready boards, a Member every board that is not archived, the owner and a Helper all of them', async () => {
  const boards = {};
  for (const status of ['draft', 'collecting', 'ready', 'archived']) boards[status] = await ownersBoard(status);
  const sees = { owner: ['draft', 'collecting', 'ready', 'archived'], helper: ['draft', 'collecting', 'ready', 'archived'], member: ['draft', 'collecting', 'ready'], viewer: ['ready'] };
  for (const role of ROLES) {
    person(role);
    const listed = new Set([...(await read({})).boards, ...(await read({ archived: '1' })).boards].map(board => board.id));
    for (const [status, { board, posts }] of Object.entries(boards)) {
      const allowed = sees[role].includes(status); const what = `${role} and a ${status} board`;
      assert.equal(listed.has(board.id), allowed, `${what}: the list`);
      assert.equal((await read({ board: board.id })).status, allowed ? 200 : 404, `${what}: its messages`);
      assert.equal((await read({ board: board.id, visible: '1' })).status, allowed ? 200 : 404, `${what}: its messages on the board`);
      assert.equal((await read({ board: board.id, post: posts.shown.id })).status, allowed ? 200 : 404, `${what}: one message`);
      assert.equal(await picture({ board: board.id, post: posts.shown.id, id: posts.shown.media[0].id, visible: '1' }), allowed ? 200 : 404, `${what}: a picture`);
      assert.equal(await picture({ board: board.id, cover: '1' }), allowed ? 200 : 404, `${what}: its cover`);
    }
  }
});
