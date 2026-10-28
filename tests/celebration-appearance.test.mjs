import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const originalCwd = process.cwd();
process.chdir(root);
const scratch = await mkdtemp(path.join(os.tmpdir(), 'celebration-appearance-'));
const previousFile = process.env.APP_DATA_FILE;
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');
const data = await import('../lib/data/index.js');
const { PALETTES, LAYOUTS, DEFAULT_PALETTE, readAppearance, writeAppearance, promptKey } = await import('../lib/celebration/appearance.js');
const { POST } = await import('../app/api/celebration/route.js');
after(async () => { await data.closeStorage(); process.chdir(originalCwd); if (previousFile === undefined) delete process.env.APP_DATA_FILE; else process.env.APP_DATA_FILE = previousFile; await rm(scratch, { recursive:true, force:true }); });
const request = body => POST(new Request('http://app.invalid/api/celebration', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) }));
const input = (id, overrides = {}) => ({ id, title:'A thoughtful board', recipient:'Example person', occasion:'wedding', layout:'gallery', ...overrides });
const refuses = (run, key) => assert.rejects(run, error => error.messageKey === key);

test('each approved palette and both layouts round-trip, while malformed and injected choices refuse', () => {
  for (const layout of LAYOUTS) for (const palette of PALETTES) assert.deepEqual(writeAppearance(layout, palette), { layout, palette });
  assert.deepEqual(readAppearance('gallery', DEFAULT_PALETTE), { layout:'gallery', palette:DEFAULT_PALETTE });
  assert.deepEqual(readAppearance('reading', DEFAULT_PALETTE), { layout:'reading', palette:DEFAULT_PALETTE });
  assert.deepEqual(readAppearance('gallery', null), { layout:'gallery', palette:DEFAULT_PALETTE });
  for (const bad of ['', 'unknown', 'rose] { color: red }']) assert.equal(readAppearance('gallery', bad), null);
  assert.equal(writeAppearance('gallery', 'rose] { color: red }'), null);
  assert.equal(writeAppearance('other', 'rose'), null);
  assert.equal(promptKey('wedding', 'wish'), 'cb.promptTogether');
  assert.equal(promptKey('farewell', 'wish'), 'cb.promptNext');
  assert.equal(promptKey('birthday', 'wish'), 'cb.promptWish');
});

test('a legacy board reads without a write and retains its palette through older edits', async () => {
  const owner='legacy-owner', id=randomUUID(), timestamp='2026-10-28T12:00:00.000Z';
  await data.modelAction('Board', 'create', { data:{ ownerId:owner, id, title:'Legacy', recipient:'Example', occasion:'birthday', layout:'reading', createdAt:timestamp, updatedAt:timestamp }, select:{ id:true } });
  const original=await data.readBoardFor(owner,id);
  assert.equal(original.layout,'reading'); assert.equal(original.palette,DEFAULT_PALETTE); assert.equal(original.updatedAt,timestamp);
  assert.equal((await data.modelAction('Board','findFirst',{where:{ownerId:owner,id},select:{layout:true}})).layout,'reading');
  const updated=await data.setBoardAppearanceFor(owner,id,{palette:'sage',updatedAt:original.updatedAt});
  assert.equal(updated.layout,'reading'); assert.equal(updated.palette,'sage');
  const oldClient={...updated,title:'Edited title'}; delete oldClient.palette;
  const edited=await data.saveBoardFor(owner,oldClient);
  assert.equal(edited.palette,'sage'); assert.equal(edited.layout,'reading');
  assert.equal((await data.readBoardFor(owner,id)).palette,'sage');
});

test('palettes stay with their own board and enforce owner, archive and stale-write checks', async () => {
  const owner='palette-owner';
  const first=await data.saveBoardFor(owner,input(randomUUID(),{palette:'rose'}),true);
  const second=await data.saveBoardFor(owner,input(randomUUID(),{palette:'navy'}),true);
  const changed=await data.setBoardAppearanceFor(owner,first.id,{palette:'linen',updatedAt:first.updatedAt});
  assert.equal(changed.palette,'linen'); assert.equal((await data.readBoardFor(owner,second.id)).palette,'navy');
  await refuses(()=>data.setBoardAppearanceFor(owner,first.id,{palette:'claret',updatedAt:first.updatedAt}),'cb.changed');
  await refuses(()=>data.setBoardAppearanceFor('other-owner',first.id,{palette:'claret',updatedAt:changed.updatedAt}),'cb.notFound');
  await refuses(()=>data.setBoardAppearanceFor(owner,first.id,{palette:'rose] { color: red }',updatedAt:changed.updatedAt}),'cb.invalid');
  const reflow=await data.setBoardAppearanceFor(owner,first.id,{layout:'reading',updatedAt:changed.updatedAt});
  assert.equal(reflow.layout,'reading'); assert.equal(reflow.palette,'linen');
  const archived=await data.setBoardStatusFor(owner,first.id,'archived',reflow.updatedAt);
  await refuses(()=>data.setBoardAppearanceFor(owner,first.id,{palette:'rose',updatedAt:archived.updatedAt}),'cb.archived');
  assert.equal((await data.readBoardFor(owner,first.id)).palette,'linen');
});

test('the address accepts only a named palette and does not trust a supplied owner', async () => {
  const id=randomUUID(); let response=await request({action:'create-board',...input(id)});
  assert.equal(response.status,200);const created=(await response.json()).result;
  response=await request({action:'board-appearance',boardId:id,updatedAt:created.updatedAt,palette:'violet',ownerId:'someone-else'});
  assert.equal(response.status,200);const updated=(await response.json()).result;
  assert.equal(updated.palette,'violet');assert.equal((await data.readBoardFor('local-owner',id)).palette,'violet');
  assert.equal(await data.readBoardFor('someone-else',id),null);
  response=await request({action:'board-appearance',boardId:id,updatedAt:updated.updatedAt,palette:'unknown'});
  assert.equal(response.status,400);assert.equal((await data.readBoardFor('local-owner',id)).palette,'violet');
});


test('a damaged palette on one board never prevents listing another board', async () => {
  const owner='damaged-palette-owner';
  const broken=await data.saveBoardFor(owner,input(randomUUID()),true);
  const healthy=await data.saveBoardFor(owner,input(randomUUID(),{title:'Still available'}),true);
  await data.modelAction('Board','update',{where:{id:broken.id,ownerId:owner},data:{palette:'not-an-approved-palette'},select:{id:true}});
  const listed=await data.listBoardsFor(owner);
  assert.ok(listed.boards.some(board=>board.id===healthy.id));
  await refuses(()=>data.readBoardFor(owner,broken.id),'cb.invalidAppearance');
  assert.equal((await data.readBoardFor(owner,healthy.id)).title,'Still available');
});
