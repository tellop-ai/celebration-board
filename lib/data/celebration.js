import { readAppearance, occasionPalette, PALETTES, LAYOUTS } from '../celebration/appearance.js';
import { randomUUID } from 'node:crypto';
import { modelAction, modelBatch } from './index.js';
import { readFile } from './files.js';
import { owner, id, object, text, choice, boardInput, postInput, stamp, cursor, afterPosition, fail, STATUSES, PAGE_SIZE, BOARD_PAGE_SIZE } from '../celebration/rules.js';
import { boardStatusesFor, takesMessages } from '../celebration/roles.js';
const MEMBER_SEES = boardStatusesFor('member');

const fields = names => Object.fromEntries(names.split(' ').map(name => [name, true]));
const boardSelect = fields('id title recipient occasion occasionDate introduction coverFile coverDisplayFile coverAlt layout palette status reviewRequired createdAt updatedAt');
const postSelect = fields('id boardId authorName body status position origin createdAt updatedAt');
const mediaSelect = fields('id boardId postId originalFile displayFile kind description position createdBy createdAt');
function presentBoard(row) {
  if (!row) return row;
  const appearance = readAppearance(row.layout, row.palette);
  if (!appearance) fail('cb.invalidAppearance');
  return { ...row, ...appearance };
}
const step = (model, action, args) => ({ model, action, args });
// The board statuses a reader may see (lib/celebration/roles.js `boardStatusesFor`): `null` for all of them.
function allowedStatuses(statuses) {
  if (statuses === null || statuses === undefined) return null;
  if (!Array.isArray(statuses) || statuses.some(status => !STATUSES.includes(status))) fail();
  return statuses;
}
const touch = (ownerId, board) => step('Board', 'update', { where: { id: board.id, ownerId, updatedAt: board.updatedAt }, data: { updatedAt: stamp(board.updatedAt) }, select: { id: true } });

export async function preferencesFor(ownerId) {
  return await modelAction('BoardPreference', 'findUnique', { where: { ownerId: owner(ownerId) }, select: { language: true, appearance: true } });
}
export async function savePreferencesFor(ownerId, input) {
  const data = { language: choice(input.language, ['en', 'tr']), appearance: choice(input.appearance, ['light', 'dark']) };
  return await modelAction('BoardPreference', 'upsert', { where: { ownerId: owner(ownerId) }, create: { ownerId, ...data }, update: data, select: { language: true, appearance: true } });
}
export async function listBoardsFor(ownerId, { after = null, archived = false, query = '', statuses = null } = {}) {
  owner(ownerId); if (after !== null) id(after); query = text(query, 120);
  const allowed = allowedStatuses(statuses)?.filter(status => (status === 'archived') === archived);
  if (allowed?.length === 0) return { boards: [], next: null };
  const rows = await modelAction('Board', 'findMany', { where: { ownerId, status: allowed ? { in: allowed } : archived ? 'archived' : { not: 'archived' }, ...(after ? { id: { gt: after } } : {}), ...(query ? { title: { startsWith: query } } : {}) }, orderBy: { id: 'asc' }, take: BOARD_PAGE_SIZE + 1, select: fields('id title recipient occasion occasionDate status') });
  return { boards: rows.slice(0, BOARD_PAGE_SIZE), next: rows.length > BOARD_PAGE_SIZE ? rows[BOARD_PAGE_SIZE - 1].id : null };
}
export async function readBoardFor(ownerId, boardId, { statuses = null } = {}) {
  const allowed = allowedStatuses(statuses);
  return presentBoard(await modelAction('Board', 'findFirst', { where: { ownerId: owner(ownerId), id: id(boardId), ...(allowed ? { status: { in: allowed } } : {}) }, select: boardSelect }));
}
async function requireBoard(ownerId, boardId, writable = false, statuses = null) {
  const board = await readBoardFor(ownerId, boardId, { statuses }); if (!board) fail('cb.notFound');
  if (writable && board.status === 'archived') fail('cb.archived'); return board;
}
async function pictureChange(value, prior, only = 'picture') {
  if (value === undefined) return prior ?? null;
  const form = new FormData(); form.set('file', value === null ? 'remove' : value);
  const checked = await readFile(form, 'file', { only }); if (checked.problem) fail(checked.problem);
  if (checked.change === 'remove') return null;
  return checked.change === 'replace' ? checked.file : prior ?? null;
}
export async function saveBoardFor(ownerId, input, create = false) {
  owner(ownerId); object(input); const boardId = id(input.id); const data = boardInput(input);
  const prior = await readBoardFor(ownerId, boardId);
  if (create && prior) fail('cb.alreadySaved'); if (!create && !prior) fail('cb.notFound');
  if (prior?.status === 'archived') fail('cb.archived');
  if (prior && input.updatedAt !== prior.updatedAt) fail('cb.changed');
  data.coverFile = await pictureChange(input.coverFile, prior?.coverFile);
  data.coverDisplayFile = await pictureChange(input.coverDisplayFile, prior?.coverDisplayFile);
  if (!data.coverFile) data.coverDisplayFile = null;
  if (input.coverFile !== undefined && input.coverDisplayFile === undefined) data.coverDisplayFile = null;
  data.palette = data.palette ?? prior?.palette ?? occasionPalette(data.occasion);
  const now = stamp(prior?.updatedAt);
  if (create) return presentBoard(await modelAction('Board', 'create', { data: { id: boardId, ownerId, ...data, createdAt: now, updatedAt: now }, select: boardSelect }));
  return presentBoard(await modelAction('Board', 'update', { where: { id: boardId, ownerId, updatedAt: input.updatedAt }, data: { ...data, updatedAt: now }, select: boardSelect }));
}
export async function setBoardStatusFor(ownerId, boardId, status, updatedAt) {
  choice(status, STATUSES); const board = await requireBoard(ownerId, boardId);
  if (updatedAt !== board.updatedAt) fail('cb.changed');
  return presentBoard(await modelAction('Board', 'update', { where: { id: board.id, ownerId, updatedAt }, data: { status, updatedAt: stamp(updatedAt) }, select: boardSelect }));
}
export async function setBoardAppearanceFor(ownerId, boardId, input) {
  object(input);
  if (input.layout === undefined && input.palette === undefined) fail();
  const board = await requireBoard(ownerId, boardId, true);
  if (input.updatedAt !== board.updatedAt) fail('cb.changed');
  const layout = input.layout === undefined ? board.layout : choice(input.layout, LAYOUTS);
  const palette = input.palette === undefined ? board.palette : choice(input.palette, PALETTES);
  return presentBoard(await modelAction('Board', 'update', {
    where: { id: board.id, ownerId, updatedAt: board.updatedAt },
    data: { layout, palette, updatedAt: stamp(board.updatedAt) }, select: boardSelect,
  }));
}
export async function readPostFor(ownerId, boardId, postId, { visibleOnly = false, statuses = null } = {}) {
  owner(ownerId); id(boardId); id(postId);
  if (allowedStatuses(statuses) && !await readBoardFor(ownerId, boardId, { statuses })) return null;
  const post = await modelAction('Post', 'findFirst', { where: { ownerId, boardId, id: postId, ...(visibleOnly ? { status: 'visible' } : {}) }, select: postSelect });
  if (!post) return null;
  const media = await modelAction('Media', 'findMany', { where: { ownerId, boardId, postId }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: 4, select: mediaSelect });
  return { ...post, media };
}
export async function listPostsFor(ownerId, boardId, { after = null, visibleOnly = false, statuses = null } = {}) {
  owner(ownerId); id(boardId); const past = cursor(after);
  const board = await requireBoard(ownerId, boardId, false, statuses);
  const rows = await modelAction('Post', 'findMany', { where: { ownerId, boardId, ...(visibleOnly ? { status: 'visible' } : {}), ...(past ? afterPosition(past) : {}) }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: PAGE_SIZE + 1, select: postSelect });
  const posts = rows.slice(0, PAGE_SIZE);
  const media = posts.length ? await modelAction('Media', 'findMany', { where: { ownerId, boardId, postId: { in: posts.map(p => p.id) } }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: PAGE_SIZE * 4, select: mediaSelect }) : [];
  return { board, posts: posts.map(p => ({ ...p, media: media.filter(m => m.postId === p.id) })), next: rows.length > PAGE_SIZE ? { id: posts.at(-1).id, position: posts.at(-1).position } : null };
}
async function mediaInput(value, prior, ownerId, boardId, postId, now, creator = ownerId) {
  if (value === undefined) return prior;
  if (!Array.isArray(value) || value.length > 4) fail('cb.mediaLimit');
  const result = []; const seen = new Set();
  for (const input of value) {
    object(input);
    const existing = input.id ? prior.find(m => m.id === input.id) : null;
    if (input.id && (!existing || seen.has(input.id))) fail(); if (input.id) seen.add(input.id);
    const digest = input.originalFile ?? existing?.originalFile;
    if (typeof digest !== 'string') fail('error.fileMissing');
    const form = new FormData(); form.set('file', digest);
    const file = await readFile(form, 'file'); if (file.problem) fail(file.problem);
    if (file.change !== 'replace' || !['picture', 'video'].includes(file.shows)) fail('error.fileKind');
    const kind = file.shows === 'video' ? 'video' : file.kind === 'gif' ? 'gif' : 'image';
    let displayFile = input.displayFile === undefined ? existing?.displayFile ?? null : input.displayFile;
    if (input.originalFile && input.displayFile === undefined) displayFile = null;
    if (kind !== 'image') displayFile = null;
    if (displayFile) displayFile = await pictureChange(displayFile, null);
    result.push({ id: existing?.id ?? randomUUID(), ownerId, boardId, postId, originalFile: file.file, displayFile, kind, description: text(input.description ?? existing?.description ?? '', 300), position: result.length, createdBy: existing?.createdBy ?? creator, createdAt: existing?.createdAt ?? now, updatedAt: now });
  }
  if (result.filter(m => m.kind === 'video').length > 1) fail('cb.videoLimit');
  return result;
}
// `guest`: the id of a person who cannot change this board (a Member online, lib/celebration/roles.js) adding a new
// message. It goes only to a board that still takes messages, waits for review when the board asks for it, names
// who added it, and leaves the board's own record untouched: the host refuses a Member's change to a board someone
// else added. The owner and Helpers save as before.
export async function savePostFor(ownerId, boardId, input, create = false, { guest = null } = {}) {
  object(input); const postId = id(input.id); const data = postInput(input);
  if (guest !== null && (!create || typeof guest !== 'string' || !guest)) fail();
  const board = guest === null ? await requireBoard(ownerId, boardId, true) : await requireBoard(ownerId, boardId, false, MEMBER_SEES);
  if (guest !== null && !takesMessages(board.status)) fail('cb.closedToMessages');
  const prior = await readPostFor(ownerId, boardId, postId);
  if (create && prior) fail('cb.alreadySaved'); if (!create && !prior) fail('cb.notFound');
  if (prior && prior.updatedAt !== input.updatedAt) fail('cb.changed');
  const now = stamp(prior?.updatedAt);
  const media = await mediaInput(input.media, prior?.media ?? [], ownerId, boardId, postId, now, guest ?? ownerId);
  if (!data.body && !media.length) fail('cb.emptyMessage');
  let position = prior?.position;
  if (create) {
    const last = await modelAction('Post', 'findMany', { where: { ownerId, boardId }, orderBy: [{ position: 'desc' }, { id: 'desc' }], take: 1, select: { position: true } });
    position = (last[0]?.position ?? 0) + 1024;
    if (!Number.isSafeInteger(position)) fail('cb.orderLimit');
  }
  const status = guest === null || board.reviewRequired === false ? 'visible' : 'pending';
  const added = guest === null ? { createdBy: ownerId, reviewedBy: ownerId, reviewedAt: now } : { createdBy: guest, origin: 'guest', status };
  const writes = guest === null ? [touch(ownerId, board)] : [];
  writes.push(create ? step('Post', 'create', { data: { id: postId, ownerId, boardId, ...data, position, ...added, createdAt: now, updatedAt: now }, select: { id: true } }) : step('Post', 'update', { where: { id: postId, ownerId, boardId, updatedAt: input.updatedAt }, data: { ...data, updatedAt: now }, select: { id: true } }));
  if (input.media !== undefined || create) {
    writes.push(step('Media', 'deleteMany', { where: { ownerId, boardId, postId } }));
    if (media.length) writes.push(step('Media', 'createMany', { data: media }));
  }
  await modelBatch(writes);
  return { id: postId, updatedAt: now, ...(create ? { status } : {}) };
}
export async function setPostVisibilityFor(ownerId, boardId, postId, status, updatedAt) {
  choice(status, ['visible', 'hidden']); id(postId); const board = await requireBoard(ownerId, boardId, true);
  await modelBatch([touch(ownerId, board), step('Post', 'update', { where: { id: postId, ownerId, boardId, updatedAt: text(updatedAt, 30, 20) }, data: { status, updatedAt: stamp(updatedAt), reviewedBy: ownerId, reviewedAt: stamp() }, select: { id: true } })]);
  return { id: postId };
}
export async function removePostFor(ownerId, boardId, postId, updatedAt) {
  id(postId); const board = await requireBoard(ownerId, boardId, true);
  await modelBatch([touch(ownerId, board), step('Post', 'delete', { where: { id: postId, ownerId, boardId, updatedAt: text(updatedAt, 30, 20) }, select: { id: true } })]);
  return { id: postId };
}
export async function movePostFor(ownerId, boardId, postId, direction, updatedAt) {
  choice(direction, ['earlier', 'later']); const board = await requireBoard(ownerId, boardId, true);
  const post = await readPostFor(ownerId, boardId, postId); if (!post) fail('cb.notFound');
  if (post.updatedAt !== updatedAt) fail('cb.changed');
  const order = direction === 'earlier' ? 'desc' : 'asc';
  const near = await modelAction('Post', 'findMany', { where: { ownerId, boardId, ...afterPosition(post, order) }, orderBy: [{ position: order }, { id: order }], take: 1, select: fields('id position updatedAt') });
  if (!near.length) return { id: postId, edge: true };
  const neighbor = near[0];
  await modelBatch([touch(ownerId, board), ...[[post, neighbor.position], [neighbor, post.position]].map(([p, position]) => step('Post', 'update', { where: { id: p.id, ownerId, boardId, updatedAt: p.updatedAt }, data: { position, updatedAt: stamp(p.updatedAt) }, select: { id: true } }))]);
  return { id: postId };
}
export async function readMediaFor(ownerId, boardId, mediaId, { postId, visibleOnly = false, statuses = null } = {}) {
  owner(ownerId); id(boardId); id(mediaId); id(postId);
  if (allowedStatuses(statuses) && !await readBoardFor(ownerId, boardId, { statuses })) return null;
  const post = await modelAction('Post', 'findFirst', { where: { ownerId, boardId, id: postId, ...(visibleOnly ? { status: 'visible' } : {}) }, select: { id: true } });
  if (!post) return null;
  return await modelAction('Media', 'findFirst', { where: { ownerId, boardId, postId, id: mediaId }, select: mediaSelect });
}
