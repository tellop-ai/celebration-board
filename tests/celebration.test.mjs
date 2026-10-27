import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..'); const cwd = process.cwd(); process.chdir(root);
const scratch = await mkdtemp(path.join(os.tmpdir(), 'celebration-check-')); const oldFile = process.env.APP_DATA_FILE; process.env.APP_DATA_FILE = path.join(scratch, 'app.db');
const data = await import('../lib/data/index.js');
const { keepFile } = await import('../lib/data/files.js');
const { boardInput, postInput, day } = await import('../lib/celebration/rules.js');
const { draftMessageFor } = await import('../lib/celebration/draft.js');
const { GET, POST } = await import('../app/api/celebration/route.js');
const { GET: mediaGet } = await import('../app/api/celebration/media/route.js');
const { measured, bounded } = await import('./records-bounds.mjs');
after(async () => { await data.closeStorage(); process.chdir(cwd); if (oldFile === undefined) delete process.env.APP_DATA_FILE; else process.env.APP_DATA_FILE = oldFile; await rm(scratch, { recursive:true, force:true }); });
const boardDraft = (extra = {}) => ({ id:randomUUID(),title:'A good day',recipient:'Sample person',occasion:'birthday',layout:'gallery', ...extra });
const postDraft = (extra = {}) => ({ id:randomUUID(),authorName:'Sample signer',body:'A thoughtful message',media:[], ...extra });
const rejects = (call,key) => assert.rejects(call, e => e.messageKey === key);
const postRequest = value => POST(new Request('http://app.invalid/api/celebration',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)}));
async function board(owner='owner-one',extra={}) {return await data.saveBoardFor(owner,boardDraft(extra),true);}
async function post(owner,b,input=postDraft()) {await data.savePostFor(owner,b.id,input,true);return await data.readPostFor(owner,b.id,input.id);}

test('empty preferences and lists never manufacture records',async()=>{
 assert.equal(await data.preferencesFor('empty-owner'),null);
 assert.deepEqual(await data.listBoardsFor('empty-owner'),{boards:[],next:null});
 assert.equal(await data.modelAction('BoardPreference','count',{}),0);
 assert.equal(await data.modelAction('Board','count',{}),0);
});
test('validation covers exact length boundaries and real civil dates',()=>{
 for(const size of [119,120]) assert.equal(boardInput(boardDraft({title:'x'.repeat(size)})).title.length,size);
 assert.throws(()=>boardInput(boardDraft({title:'x'.repeat(121)})));
 assert.throws(()=>boardInput(boardDraft({title:' '})));
 for(const size of [1999,2000]) assert.equal(postInput(postDraft({body:'x'.repeat(size)})).body.length,size);
 assert.throws(()=>postInput(postDraft({body:'x'.repeat(2001)})));
 for(const size of [79,80]) assert.equal(postInput(postDraft({authorName:'x'.repeat(size)})).authorName.length,size);
 assert.throws(()=>postInput(postDraft({authorName:'x'.repeat(81)})));
 assert.equal(day('2028-02-29'),'2028-02-29'); assert.throws(()=>day('2026-02-29'));assert.throws(()=>day('2026-13-01'));assert.throws(()=>day('0000-01-01'));assert.equal(day(null),null);
 assert.throws(()=>boardInput(boardDraft({layout:'anything'})));assert.throws(()=>postInput(postDraft({body:'\u0000'})));
});
test('boards save, edit, archive and restore with owner and stale-write protection',async()=>{
 const b=await board(); assert.equal((await data.readBoardFor('owner-one',b.id)).title,b.title);
 assert.equal(await data.readBoardFor('owner-two',b.id),null);
 await rejects(()=>data.saveBoardFor('owner-two',{...b,title:'Stolen'}),'cb.notFound');
 const edited=await data.saveBoardFor('owner-one',{...b,title:'Changed'});assert.equal(edited.title,'Changed');
 await rejects(()=>data.saveBoardFor('owner-one',{...b,title:'Stale'}),'cb.changed');
 const archived=await data.setBoardStatusFor('owner-one',b.id,'archived',edited.updatedAt);
 await rejects(()=>data.savePostFor('owner-one',b.id,postDraft(),true),'cb.archived');
 assert.ok((await data.listBoardsFor('owner-one',{archived:true})).boards.some(row=>row.id===b.id));
 await data.setBoardStatusFor('owner-one',b.id,'draft',archived.updatedAt);
 assert.ok((await data.listBoardsFor('owner-one')).boards.some(row=>row.id===b.id));
});
test('one post can be edited, moved, hidden, shown and removed',async()=>{
 const who='flow-owner',b=await board(who);const a=await post(who,b),c=await post(who,b,postDraft({body:'Second'}));
 await data.movePostFor(who,b.id,c.id,'earlier',c.updatedAt);
 let page=await data.listPostsFor(who,b.id);assert.deepEqual(page.posts.map(p=>p.id),[c.id,a.id]);
 const moved=page.posts[0];await data.setPostVisibilityFor(who,b.id,c.id,'hidden',moved.updatedAt);
 assert.deepEqual((await data.listPostsFor(who,b.id,{visibleOnly:true})).posts.map(p=>p.id),[a.id]);
 const hidden=await data.readPostFor(who,b.id,c.id);await data.setPostVisibilityFor(who,b.id,c.id,'visible',hidden.updatedAt);
 const current=await data.readPostFor(who,b.id,c.id);await data.savePostFor(who,b.id,{...current,body:'Revised',media:[]});
 const revised=await data.readPostFor(who,b.id,c.id);assert.equal(revised.body,'Revised');
 await rejects(()=>data.savePostFor(who,b.id,{...current,body:'Outdated',media:[]}),'cb.changed');
 await data.removePostFor(who,b.id,c.id,revised.updatedAt);assert.equal(await data.readPostFor(who,b.id,c.id),null);
});
test('wrong owner and wrong board refuse every message write and leave parents unchanged',async()=>{
 const who='scope-owner',b=await board(who),other=await board(who),p=await post(who,b);
 assert.equal(await data.readPostFor('outsider',b.id,p.id),null); assert.equal(await data.readPostFor(who,other.id,p.id),null);
 for(const [actor,target] of [['outsider',b.id],[who,other.id]]){
  for(const call of [()=>data.savePostFor(actor,target,{...p,body:'No'}),()=>data.setPostVisibilityFor(actor,target,p.id,'hidden',p.updatedAt),()=>data.movePostFor(actor,target,p.id,'earlier',p.updatedAt),()=>data.removePostFor(actor,target,p.id,p.updatedAt)]) await assert.rejects(call);
 }
 assert.equal((await data.readBoardFor(who,other.id)).updatedAt,other.updatedAt);
 assert.equal((await data.readPostFor(who,b.id,p.id)).body,p.body);
});
test('lost-reply resubmission cannot create duplicate messages',async()=>{
 const who='repeat-owner',b=await board(who),input=postDraft();await data.savePostFor(who,b.id,input,true);
 await rejects(()=>data.savePostFor(who,b.id,input,true),'cb.alreadySaved');assert.equal((await data.listPostsFor(who,b.id)).posts.length,1);
});
const gif = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,255,255,255,0,0,0,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);
async function kept(bytes=gif){return await keepFile(new Request('http://app.invalid/api/files',{method:'POST',body:bytes}));}
test('media is sniffed, kept by digest and isolated by owner, board and post',async()=>{
 const who='media-owner',b=await board(who),other=await board(who),file=await kept();
 const p=await post(who,b,postDraft({body:'',media:[{originalFile:file.file,description:'A tiny sample animation'}]}));
 assert.equal(p.media[0].kind,'gif');assert.equal(p.media[0].displayFile,null);
 const m=p.media[0];assert.ok(await data.readMediaFor(who,b.id,m.id,{postId:p.id}));
 assert.equal(await data.readMediaFor('outsider',b.id,m.id,{postId:p.id}),null);
 assert.equal(await data.readMediaFor(who,other.id,m.id,{postId:p.id}),null);
 await data.setPostVisibilityFor(who,b.id,p.id,'hidden',p.updatedAt);
 assert.equal(await data.readMediaFor(who,b.id,m.id,{postId:p.id,visibleOnly:true}),null);
 const updated=await data.readPostFor(who,b.id,p.id);
 await data.savePostFor(who,b.id,{...updated,body:'Now with text'});
 assert.equal((await data.readPostFor(who,b.id,p.id)).media[0].originalFile,file.file);
 const fresh=await data.readPostFor(who,b.id,p.id);
 await data.savePostFor(who,b.id,{...fresh,media:[]});assert.equal((await data.readPostFor(who,b.id,p.id)).media.length,0);
 const html=await kept(new TextEncoder().encode('<html>Not a picture</html>'));
 await rejects(()=>data.savePostFor(who,b.id,postDraft({media:[{originalFile:html.file}]}),true),'error.fileKind');
 for(const count of [3,4]) await data.savePostFor(who,b.id,postDraft({media:Array.from({length:count},()=>({originalFile:file.file}))}),true);
 await rejects(()=>data.savePostFor(who,b.id,postDraft({media:Array.from({length:5},()=>({originalFile:file.file}))}),true),'cb.mediaLimit');
 await rejects(()=>data.savePostFor(who,b.id,postDraft({body:''}),true),'cb.emptyMessage');
});
test('cover keep/change/remove preserves an untouched original',async()=>{
 const who='cover-owner',file=await kept(),b=await board(who,{coverFile:file.file});
 assert.equal(b.coverFile,file.file);
 const changed=await data.saveBoardFor(who,{...b,title:'Another title'});assert.equal(changed.coverFile,file.file);
 const removed=await data.saveBoardFor(who,{...changed,coverFile:null});assert.equal(removed.coverFile,null);assert.equal(removed.coverDisplayFile,null);
});
test('partial batches roll back their earlier changes',async()=>{
 const who='atomic-owner',b=await board(who),input=postDraft();
 await assert.rejects(()=>data.modelBatch([
  {model:'Post',action:'create',args:{data:{id:input.id,ownerId:who,boardId:b.id,authorName:'Sample',body:'Temporary',createdBy:who,createdAt:'now',updatedAt:'now'}}},
  {model:'Media',action:'create',args:{data:{id:randomUUID(),ownerId:'another-owner',boardId:b.id,postId:input.id,kind:'image',createdBy:who,createdAt:'now',updatedAt:'now'}}}
 ]));
 assert.equal(await data.readPostFor(who,b.id,input.id),null);
});
test('pagination never loses messages at the 12-message boundary and stays within real bounds',async()=>{
 const who='large-owner',b=await board(who),file=await kept();
 for(let i=0;i<13;i++) await data.savePostFor(who,b.id,postDraft({body:'界'.repeat(2000),media:Array.from({length:4},()=>({originalFile:file.file,description:'界'.repeat(300)}))}),true);
 const measurement=await measured(()=>data.listPostsFor(who,b.id));bounded(measurement);
 assert.equal(measurement.value.posts.length,12);assert.ok(measurement.value.next);
 const second=await measured(()=>data.listPostsFor(who,b.id,{after:measurement.value.next}));bounded(second);assert.equal(second.value.posts.length,1);assert.equal(second.value.next,null);
 assert.equal(new Set([...measurement.value.posts,...second.value.posts].map(p=>p.id)).size,13);
 const edit=measurement.value.posts[0];
 // Mirror the file channel using facts from the file actually kept above.
 globalThis[Symbol.for('tellop.internalFiles')]={put:()=>{throw new Error('Unexpected upload');},ref:async digest=>digest===file.file?file:null};
 try {const saved=await measured(()=>data.savePostFor(who,b.id,{...edit,body:'A change',media:edit.media.map(m=>({id:m.id,description:m.description}))}));bounded(saved,'edit with four attachments');}
 finally {delete globalThis[Symbol.for('tellop.internalFiles')];}
 assert.equal((await data.readPostFor(who,b.id,edit.id)).media[0].createdAt,edit.media[0].createdAt);
});
test('AI sees only the selected form fields, never saves, and failure leaves the app usable',async()=>{
 const who='ai-owner',b=await board(who),p=await post(who,b,postDraft({body:'Private other message'}));let sent;
 const result=await draftMessageFor(who,{boardId:b.id,draft:'A starting thought',tone:'warm',language:'tr'},async input=>{sent=input;return {text:'A proposed greeting'};});
 assert.equal(result.text,'A proposed greeting');assert.equal(sent.level,'quick');assert.equal(sent.messages[1].content.includes(p.body),false);
 assert.deepEqual(Object.keys(JSON.parse(sent.messages[1].content)).sort(),['draft','language','occasion','recipient','tone']);
 await assert.rejects(()=>draftMessageFor(who,{boardId:b.id,draft:'',tone:'simple',language:'en'},async()=>{throw new Error('Unavailable');}));
 assert.equal((await data.listPostsFor(who,b.id)).posts.length,1);await post(who,b);
 assert.equal((await data.listPostsFor(who,b.id)).posts.length,2);
});
test('API ignores client authority and answers media only through scoped records',async()=>{
 const input=boardDraft();let r=await postRequest({action:'create-board',ownerId:'forged-owner',...input});assert.equal(r.status,200);
 const b=(await r.json()).result;assert.ok(await data.readBoardFor('local-owner',b.id));assert.equal(await data.readBoardFor('forged-owner',b.id),null);
 const file=await kept();const p=await post('local-owner',b,postDraft({media:[{originalFile:file.file}]}));
 const address=`http://app.invalid/api/celebration/media?board=${b.id}&post=${p.id}&id=${p.media[0].id}`;
 r=await mediaGet(new Request(address));assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),gif);
 r=await mediaGet(new Request(address.replace(b.id,randomUUID())));assert.equal(r.status,404);
 r=await GET(new Request(`http://app.invalid/api/celebration?board=${b.id}`));assert.equal(r.status,200);
 r=await postRequest({action:'invite',boardId:b.id});assert.equal(r.status,400);
 r=await postRequest({action:'create-board',...boardDraft(),introduction:'x'.repeat(66000)});assert.equal(r.status,400);
});
test('board and post page bounds include the edge and both neighbors',async()=>{
 const who='boundary-owner';let b;
 for(let count=1;count<=25;count++) {
  b=await board(who);
  if(count>=23){const result=await measured(()=>data.listBoardsFor(who));bounded(result,'board page');assert.equal(result.value.boards.length,Math.min(count,24));assert.equal(Boolean(result.value.next),count>24);}
 }
 for(let count=1;count<=13;count++) {
  await post(who,b);
  if(count>=11){const result=await measured(()=>data.listPostsFor(who,b.id));bounded(result,'post page');assert.equal(result.value.posts.length,Math.min(count,12));assert.equal(Boolean(result.value.next),count>12);}
 }
});
test('video bounds are sniffed from bytes and missing attachments refuse the whole save',async()=>{
 const who='video-owner',b=await board(who);
 const bytes=Buffer.alloc(24);bytes.writeUInt32BE(24);bytes.write('ftyp',4);bytes.write('isom',8);bytes.write('mp42',16);bytes.write('isom',20);
 const video=await kept(bytes);assert.equal(video.kind,'mp4');
 for(const count of [0,1]){const p=await post(who,b,postDraft({media:Array.from({length:count},()=>({originalFile:video.file}))}));assert.equal(p.media.length,count);}
 await rejects(()=>data.savePostFor(who,b.id,postDraft({media:Array.from({length:2},()=>({originalFile:video.file}))}),true),'cb.videoLimit');
 const input=postDraft({media:[{originalFile:'a'.repeat(64)}]});await rejects(()=>data.savePostFor(who,b.id,input,true),'error.fileMissing');assert.equal(await data.readPostFor(who,b.id,input.id),null);
});
test('simultaneous message saves cannot silently overwrite each other',async()=>{
 const who='concurrent-owner',b=await board(who),p=await post(who,b);
 const result=await Promise.allSettled([data.savePostFor(who,b.id,{...p,body:'First change'}),data.savePostFor(who,b.id,{...p,body:'Second change'})]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
 assert.ok(['First change','Second change'].includes((await data.readPostFor(who,b.id,p.id)).body));
});
test('print preparation includes every visible page and refuses incomplete or changing results',async()=>{
 const {completeBoard}=await import('../lib/celebration/print.js');
 const b=await board('print-owner');for(let i=0;i<13;i++)await post('print-owner',b);
 const hidden=await post('print-owner',b,postDraft({body:'Owner-only note'}));await data.setPostVisibilityFor('print-owner',b.id,hidden.id,'hidden',hidden.updatedAt);
 let calls=0;
 const read=async address=>{calls++;const q=new URL(address,'http://app.invalid').searchParams;return await data.listPostsFor('print-owner',q.get('board'),{after:q.get('after'),visibleOnly:q.get('visible')==='1'});};
 const full=await completeBoard(b.id,read);assert.equal(full.posts.length,13);assert.equal(full.next,null);assert.equal(calls,3);assert.equal(full.posts.some(p=>p.id===hidden.id),false);
 let page=0;await assert.rejects(()=>completeBoard(b.id,async address=>{if(++page===2)throw new Error('Page unavailable');return await read(address);}));
 page=0;await assert.rejects(()=>completeBoard(b.id,async address=>{const value=await read(address);if(++page===3)value.board.updatedAt='changed';return value;}),e=>e.messageKey==='cb.viewChanged');
 assert.equal(await completeBoard(b.id,read,()=>false),null);
});
test('archived board details refuse writes until restored',async()=>{
 const who='archive-detail-owner',b=await board(who);
 const archived=await data.setBoardStatusFor(who,b.id,'archived',b.updatedAt);
 await rejects(()=>data.saveBoardFor(who,{...archived,title:'Unexpected edit'}),'cb.archived');
 assert.equal((await data.readBoardFor(who,b.id)).title,b.title);
});
test('record requests accept only the JSON media type and reject cross-site writes',async()=>{
 const value={action:'create-board',...boardDraft()};
 for(const headers of [{'content-type':'application/jsonp'},{'content-type':'application/json','sec-fetch-site':'cross-site'}]){
  const r=await POST(new Request('http://app.invalid/api/celebration',{method:'POST',headers,body:JSON.stringify(value)}));
  assert.equal(r.status,400);assert.equal(await data.readBoardFor('local-owner',value.id),null);
 }
 const r=await POST(new Request('http://app.invalid/api/celebration',{method:'POST',headers:{'content-type':'Application/JSON; charset=utf-8','sec-fetch-site':'same-origin'},body:JSON.stringify(value)}));
 assert.equal(r.status,200);
});
test('JSON input bounds include exactly 64 KiB and both neighbors',async()=>{
 const {readJson}=await import('../lib/celebration/http.js');
 for(const size of [65535,65536,65537]){
  const body=JSON.stringify({text:'x'.repeat(size-11)});assert.equal(Buffer.byteLength(body),size);
  const req=new Request('http://app.invalid/check',{method:'POST',headers:{'content-type':'application/json'},body});
  if(size>65536)await rejects(()=>readJson(req),'cb.invalid');else assert.equal((await readJson(req)).text.length,size-11);
 }
});

test('forged audit fields, media membership and path-like files cannot change authority',async()=>{
 const who='audit-owner',b=await board(who),file=await kept();
 const a=await post(who,b,postDraft({media:[{originalFile:file.file}]}));
 const input=postDraft({createdBy:'outsider',origin:'guest',status:'pending',position:-1,reviewedBy:'outsider'});
 await data.savePostFor(who,b.id,input,true);
 const stored=await data.modelAction('Post','findUnique',{where:{id:input.id},select:{ownerId:true,createdBy:true,origin:true,status:true,position:true,reviewedBy:true}});
 assert.equal(stored.ownerId,who);assert.equal(stored.createdBy,who);assert.equal(stored.origin,'owner');assert.equal(stored.status,'visible');assert.equal(stored.reviewedBy,who);assert.ok(stored.position>0);
 const before=await data.readPostFor(who,b.id,input.id);
 await rejects(()=>data.savePostFor(who,b.id,{...before,media:[{id:a.media[0].id}]}),'cb.invalid');
 await assert.rejects(()=>data.savePostFor(who,b.id,{...before,media:[{originalFile:'../../private'}]}));
 assert.equal((await data.readPostFor(who,b.id,input.id)).updatedAt,before.updatedAt);
 assert.equal((await data.readPostFor(who,b.id,a.id)).media[0].originalFile,file.file);
});
