'use client';
import { useEffect, useRef, useState } from 'react';
import { Heart, Plus, Play, ArrowLeft, Printer, Ellipsis, SlidersHorizontal, Palette, Cake, HeartHandshake, Send } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu';
import { Card, CardContent } from '../components/ui/card';
import { PageFrame } from '../components/ui/page-frame';
import { CountsLine } from '../components/ui/counts-line';
import { AppMenu } from '../components/ui/app-menu';
import { DataTable } from '../components/ui/data-table';
import { DialogFooter } from '../components/ui/dialog';
import { t } from '../lib/i18n/index.js';
import { formatDate } from '../lib/format.js';
import { request, boardUrl } from '../lib/celebration/client.js';
import { completeBoard } from '../lib/celebration/print.js';
import { BoardForm, PostForm, Choices, FormWindow, Problem } from './celebration-forms';
import { MediaView, Cover } from './celebration-media';
import { PrintButton } from './print-button';
import { PalettePicker } from './celebration-design';
import { DEFAULT_PALETTE } from '../lib/celebration/appearance.js';

export function CelebrationApp({ initial, locale, appearance, view = '' }) {
  const [data, setData] = useState(initial); const [form, setForm] = useState(null);
  const [error, setError] = useState(initial.problem ?? null); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false); const [query, setQuery] = useState(initial.query ?? '');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [presentationLayout, setPresentationLayout] = useState('slideshow');
  const [slide, setSlide] = useState(0); const [playing, setPlaying] = useState(false);
  const [printReady, setPrintReady] = useState(false); const [printPreparing, setPrintPreparing] = useState(false);
  const [languageChoice, setLanguageChoice] = useState(locale); const [look, setLook] = useState(appearance);
  const preparing = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', appearance === 'dark'); }, [appearance]);
  const board = data.board; const posts = data.posts ?? [];
  const navigationBoards = [...(data.navigationBoards ?? [])];
  if (board && !navigationBoards.some(item => item.id === board.id)) navigationBoards.unshift(board);
  useEffect(() => {
    document.documentElement.dataset.cbPalette = board?.palette ?? DEFAULT_PALETTE;
    return () => { delete document.documentElement.dataset.cbPalette; };
  }, [board?.palette]);
  const present = view === 'present'; const printing = view === 'print'; const management = !present && !printing;
  const writable = board?.status !== 'archived';
  const title = view === 'preferences' ? t('cb.preferences', locale) : board?.title ?? t('cb.myBoards', locale);
  async function reload() {
    const next = await request(board ? `/api/celebration?${new URLSearchParams({ board: board.id, ...(!management ? { visible: '1' } : {}) })}` : `/api/celebration?${new URLSearchParams({ q: data.query ?? '', ...(data.archived ? { archived: '1' } : {}) })}`, { method: 'GET' });
    setData({ ...next, navigationBoards: data.navigationBoards, navigationMore: data.navigationMore, archived: data.archived, query: data.query ?? '' }); setSlide(0); setPrintReady(false); return next;
  }
  async function act(input, message = 'cb.changedSaved') {
    if (busy) return; setBusy(true); setError(null); setNotice(''); setPlaying(false);
    try { await request(input); setNotice(t(message, locale)); setForm(null); await reload(); }
    catch (e) { setError(e.messageKey ?? 'error.saveFailed'); } finally { setBusy(false); }
  }
  async function openForm(kind, post = null, occasion = null) {
    if (busy) return; setBusy(true); setError(null);
    try {
      const draft = post || kind === 'edit-board' ? {} : await request('/api/celebration?draft=1', { method: 'GET' });
      const fresh = post ? (await request(`/api/celebration?${new URLSearchParams({ board: board.id, post: post.id })}`, { method: 'GET' })).post : null;
      setForm({ kind, post: fresh, draftId: draft.id, occasion });
    } catch (e) { setError(e.messageKey ?? 'error.storageUnreadable'); } finally { setBusy(false); }
  }
  async function more() {
    if (busy || !data.next) return; setBusy(true); setError(null);
    try {
      const q = board ? { board: board.id, after: JSON.stringify(data.next), ...(!management ? { visible: '1' } : {}) } : { after: data.next, q: data.query ?? '', ...(data.archived ? { archived: '1' } : {}) };
      const next = await request(`/api/celebration?${new URLSearchParams(q)}`, { method: 'GET' });
      if (board && next.board.updatedAt !== board.updatedAt) { setPlaying(false); setPrintReady(false); throw { messageKey: 'cb.viewChanged' }; }
      setData(previous => ({ ...previous, ...(board ? { posts: [...previous.posts, ...next.posts] } : { boards: [...previous.boards, ...next.boards] }), next: next.next }));
    } catch (e) { setError(e.messageKey ?? 'error.storageUnreadable'); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!playing || !present || presentationLayout !== 'slideshow' || busy || printPreparing) return;
    const timer = setTimeout(() => {
      if (slide + 1 < posts.length) setSlide(n => n + 1);
      else { setPlaying(false); if (data.next) void more(); }
    }, 6000);
    return () => clearTimeout(timer);
  }, [playing, present, presentationLayout, slide, posts.length, data.next, busy, printPreparing]);
  async function preparePrint() {
    if (preparing.current) return; preparing.current = true; setPrintPreparing(true); setError(null); setPrintReady(false);
    try {
      const complete = await completeBoard(board.id, url => request(url, { method: 'GET' }), () => mounted.current);
      if (!complete || !mounted.current) return;
      setData(complete); setPrintReady(true);
    } catch (e) { if (mounted.current) setError(e.messageKey ?? 'error.storageUnreadable'); }
    finally { preparing.current = false; if (mounted.current) setPrintPreparing(false); }
  }
  const postAction = (post, action, extra = {}) => act({ action, boardId: board.id, id: post.id, updatedAt: post.updatedAt, ...extra });
  const boardStatus = status => act({ action: 'board-status', boardId: board.id, updatedAt: board.updatedAt, status });
  useEffect(() => {
    if (!present || presentationLayout !== 'slideshow') return;
    function move(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]')) return;
      event.preventDefault(); setPlaying(false);
      setSlide(current => Math.max(0, Math.min(posts.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1))));
    }
    window.addEventListener('keydown', move); return () => window.removeEventListener('keydown', move);
  }, [present, presentationLayout, posts.length]);
  const changeAppearance = change => act({ action: 'board-appearance', boardId: board.id, updatedAt: board.updatedAt, ...change });
  function card(post) {
    return <Card key={post.id} className="cb-note"><CardContent className="cb-note-content">
      {post.media.map(media => <MediaView key={`${media.id}:${media.originalFile}:${media.displayFile}`} boardId={board.id} media={media} locale={locale} visibleOnly={!management} printing={printing} />)}
      {present && presentationLayout === 'slideshow' && <span className="cb-quote" aria-hidden="true">“</span>}
      {post.body && <p className="cb-message">{post.body}</p>}
      <footer className="cb-signature"><span className="cb-initial" aria-hidden="true">{post.authorName.slice(0, 1)}</span><span>{post.authorName}</span>{management && post.status !== 'visible' && <span className="cb-state">{t(`cb.${post.status}`, locale)}</span>}
        {management && writable && <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" className="cb-note-menu" data-post-menu={post.id} disabled={busy} aria-label={t('cb.messageOptions', locale, { name: post.authorName })} />}><Ellipsis aria-hidden="true" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-44" data-print-hidden>
          <DropdownMenuItem onClick={() => openForm('post', post)}>{t('cb.edit', locale)}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => postAction(post, 'post-status', { status: post.status === 'visible' ? 'hidden' : 'visible' })}>{t(post.status === 'visible' ? 'cb.hide' : 'cb.show', locale)}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => postAction(post, 'move-post', { direction: 'earlier' })}>{t('cb.earlier', locale)}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => postAction(post, 'move-post', { direction: 'later' })}>{t('cb.later', locale)}</DropdownMenuItem>
          <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setForm({ kind: 'remove', post })}>{t('cb.delete', locale)}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>}
      </footer>
    </CardContent></Card>;
  }
  const columns = [
    { accessorKey: 'title', header: t('cb.title', locale), cell: ({ row }) => <a className="cb-title-link" href={boardUrl(row.original.id)}>{row.original.title}</a> },
    { accessorKey: 'recipient', header: t('cb.recipient', locale) },
    { accessorKey: 'occasion', header: t('cb.occasion', locale), cell: ({ row }) => t(`cb.${row.original.occasion}`, locale) },
    { accessorKey: 'occasionDate', header: t('cb.occasionDate', locale), cell: ({ row }) => row.original.occasionDate ? formatDate(row.original.occasionDate, locale) : t('cb.noDate', locale) },
    { accessorKey: 'status', header: t('cb.status', locale), cell: ({ row }) => t(`cb.${row.original.status === 'archived' ? 'archivedStatus' : row.original.status}`, locale) },
  ];
  return <div data-tellop-app-marker="ok" className="cb-app" data-cb-palette={board?.palette ?? DEFAULT_PALETTE} data-print-ready={printing && printReady ? 'true' : 'false'}>
    <p className="cb-print-warning">{t('cb.printFirst', locale)}</p>
    <header className="cb-header" data-print-hidden><a href="/" className="cb-brand"><span className="cb-brand-mark"><Heart aria-hidden="true" /></span>{t('cb.brand', locale)}</a>{board && !printing && navigationBoards.length > 1 && <NativeSelect className="cb-board-picker" value={board.id} aria-label={t('cb.boardPicker', locale)} onChange={e => location.assign(boardUrl(e.target.value, present ? 'present' : ''))}>{navigationBoards.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.title}</NativeSelectOption>)}</NativeSelect>}<AppMenu className="cb-app-menu" locale={locale} currentPath={view === 'preferences' ? '/?view=preferences' : '/'} /></header>
    <PageFrame title={title} locale={locale} className={board ? `cb-board-frame ${present ? 'cb-present' : ''}` : ''} actions={board ? <div className="cb-actions" data-print-hidden><a href={management ? '/' : boardUrl(board.id)} className="cb-text-link"><ArrowLeft aria-hidden="true" />{t(management ? 'cb.backBoards' : 'cb.backBoard', locale)}</a>{management && <>{writable && <Button variant="outline" data-action="palette" aria-expanded={paletteOpen} aria-controls="cb-board-palettes" onClick={() => setPaletteOpen(open => !open)}><Palette aria-hidden="true" />{t('cb.palette', locale)}</Button>}<Button variant="outline" onClick={() => location.assign(boardUrl(board.id, 'present'))}><Play aria-hidden="true" />{t('cb.present', locale)}</Button><Button variant="outline" onClick={() => location.assign(boardUrl(board.id, 'print'))}><Printer aria-hidden="true" />{t('cb.print', locale)}</Button>{writable && <Button disabled={busy} data-action="add-message" onClick={() => openForm('post')}><Plus aria-hidden="true" />{t('cb.addMessage', locale)}</Button>}</>}</div> : view !== 'preferences' ? <Button disabled={busy} data-action="create-board" onClick={() => openForm('new-board')}><Plus aria-hidden="true" />{t('cb.newBoard', locale)}</Button> : null}>
      <div data-print-hidden><Problem error={error} locale={locale} boardId={board?.id} />{error && <Button variant="outline" onClick={() => location.reload()}>{t('cb.retry', locale)}</Button>}<p role="status" className="cb-help">{notice}</p></div>
      {view === 'preferences' ? <form className="cb-preferences cb-form-fields" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(null); try { await request({ action: 'preferences', language: languageChoice, appearance: look }); location.reload(); } catch (error) { setError(error.messageKey); } finally { setBusy(false); } }}><Choices value={languageChoice === 'en' ? 'english' : 'turkish'} onChange={v => setLanguageChoice(v === 'english' ? 'en' : 'tr')} options={['english', 'turkish']} locale={locale} label={t('cb.language', locale)} disabled={busy} /><Choices value={look} onChange={setLook} options={['light', 'dark']} locale={locale} label={t('cb.appearance', locale)} disabled={busy} /><Button type="submit" disabled={busy}>{t(busy ? 'cb.saving' : 'cb.save', locale)}</Button></form> : board ? <>
        {management && writable && <div id="cb-board-palettes" hidden={!paletteOpen} data-print-hidden><PalettePicker value={board.palette} onChange={palette => { if (palette !== board.palette) void changeAppearance({ palette }); }} locale={locale} disabled={busy} /><Button type="button" variant="ghost" size="sm" onClick={() => setPaletteOpen(false)}>{t('cb.paletteDone', locale)}</Button></div>}
        {present && <div className="cb-actions" data-print-hidden><Button variant={presentationLayout === 'gallery' ? 'secondary' : 'ghost'} onClick={() => { setPlaying(false); setPresentationLayout('gallery'); }}>{t('cb.gallery', locale)}</Button><Button variant={presentationLayout === 'slideshow' ? 'secondary' : 'ghost'} onClick={() => { setPlaying(false); setPresentationLayout('slideshow'); }}>{t('cb.slideshow', locale)}</Button></div>}
        <section className={`print-page ${printing && !printReady ? 'cb-print-incomplete' : ''}`}>
          <div className="cb-hero"><Cover key={`${board.coverFile}:${board.coverDisplayFile}`} board={board} locale={locale} /><p className="cb-occasion">{t(`cb.${board.occasion}`, locale)}{board.occasionDate ? ` · ${formatDate(board.occasionDate, locale)}` : ''}</p><h2>{board.title}</h2><p className="cb-introduction">{board.introduction}</p><p className="cb-recipient">{board.recipient}</p><span className="cb-state" data-print-hidden>{t('cb.local', locale)}</span></div>
          {management && <div className="cb-subbar" data-print-hidden><div className="cb-actions"><CountsLine items={[{ label: t('cb.showingMessages', locale), value: posts.length }]} /><span className="cb-state">{t(`cb.${board.status === 'archived' ? 'archivedStatus' : board.status}`, locale)}</span></div><div className="cb-actions">{writable && <div className="cb-layout-switch"><Button type="button" variant={board.layout === 'gallery' ? 'secondary' : 'ghost'} size="sm" data-action="layout-gallery" aria-pressed={board.layout === 'gallery'} disabled={busy} onClick={() => { if (board.layout !== 'gallery') void changeAppearance({ layout: 'gallery' }); }}>{t('cb.gallery', locale)}</Button><Button type="button" variant={board.layout === 'reading' ? 'secondary' : 'ghost'} size="sm" data-action="layout-reading" aria-pressed={board.layout === 'reading'} disabled={busy} onClick={() => { if (board.layout !== 'reading') void changeAppearance({ layout: 'reading' }); }}>{t('cb.reading', locale)}</Button></div>}<DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" data-action="board-options" disabled={busy} aria-label={t('cb.boardOptions', locale)} />}><SlidersHorizontal aria-hidden="true" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-44">{writable ? <><DropdownMenuItem onClick={() => openForm('edit-board')}>{t('cb.editBoard', locale)}</DropdownMenuItem><DropdownMenuItem onClick={() => boardStatus(board.status === 'ready' ? 'collecting' : 'ready')}>{t(board.status === 'ready' ? 'cb.setCollecting' : 'cb.setReady', locale)}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={() => boardStatus('archived')}>{t('cb.archive', locale)}</DropdownMenuItem></> : <DropdownMenuItem onClick={() => boardStatus('draft')}>{t('cb.restore', locale)}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div></div>}
          {printing && <div className="cb-print-tools" data-print-hidden><p className="cb-help">{t('cb.printNote', locale)}</p>{!printReady ? <Button onClick={preparePrint} disabled={printPreparing}>{t(printPreparing ? 'cb.preparing' : 'cb.preparePrint', locale)}</Button> : <><p role="status">{t('cb.printReady', locale)}</p>{posts.length > 0 && <PrintButton locale={locale} />}</>}</div>}
          {posts.length === 0 && !error ? <div className="cb-empty"><h2>{t(management ? 'cb.emptyBoard' : 'cb.emptyPresentation', locale)}</h2><p>{t(management ? 'cb.emptyBoardDetail' : 'cb.emptyPresentationDetail', locale)}</p>{management && writable && <Button onClick={() => openForm('post')}>{t('cb.addMessage', locale)}</Button>}</div> : null}
          {present && presentationLayout === 'slideshow' && posts.length > 0 ? <div className="cb-slide"><div key={posts[slide]?.id}>{posts[slide] && card(posts[slide])}</div><div className="cb-slide-controls" data-print-hidden><Button variant="outline" disabled={slide === 0} onClick={() => { setPlaying(false); setSlide(s => s - 1); }}>{t('cb.previous', locale)}</Button><span>{t('cb.slideCount', locale, { current: String(slide + 1), total: String(posts.length) })}</span><Button variant="outline" disabled={slide >= posts.length - 1} onClick={() => { setPlaying(false); setSlide(s => s + 1); }}>{t('cb.next', locale)}</Button><Button onClick={() => setPlaying(p => !p)} disabled={busy}>{t(playing ? 'cb.pause' : 'cb.play', locale)}</Button></div><p className="cb-help cb-present-help" data-print-hidden>{t('cb.presentHelp', locale)}</p></div> : <div className={`cb-grid ${board.layout === 'reading' ? 'cb-reading' : ''}`}>{posts.map(card)}</div>}
        </section>
        {!printing && data.next && <div className="cb-more" data-print-hidden><Button variant="outline" onClick={more} disabled={busy}>{t(busy ? 'cb.loading' : 'cb.loadMore', locale)}</Button></div>}
        
      </> : !initial.problem ? <><section className="cb-starters" aria-label={t('cb.startWith', locale)}><p className="cb-start-label">{t('cb.startWith', locale)}</p><div className="cb-actions">{[['birthday', Cake], ['wedding', Heart], ['farewell', Send], ['thanks', HeartHandshake]].map(([occasion, Icon]) => <Button key={occasion} type="button" variant="outline" disabled={busy} onClick={() => openForm('new-board', null, occasion)}><Icon aria-hidden="true" />{t(`cb.${occasion}Start`, locale)}</Button>)}</div></section><div className="cb-board-tools"><form onSubmit={async e => { e.preventDefault(); if (busy) return; const submittedQuery = query; setBusy(true); setError(null); try { const rows = await request(`/api/celebration?${new URLSearchParams({ q: submittedQuery, ...(data.archived ? { archived: '1' } : {}) })}`, { method: 'GET' }); setData(d => ({ ...d, ...rows, query: submittedQuery })); } catch (e) { setError(e.messageKey); } finally { setBusy(false); } }} className="cb-search"><Input value={query} onChange={e => setQuery(e.target.value)} maxLength={120} placeholder={t('cb.searchPrefix', locale)} aria-label={t('cb.searchPrefix', locale)} /><Button variant="outline" disabled={busy} type="submit">{t('cb.search', locale)}</Button></form><a href={data.archived ? '/' : '/?archived=1'}>{t(data.archived ? 'cb.activeBoards' : 'cb.archivedBoards', locale)}</a></div>{data.boards?.length ? <><DataTable resetKey={data.query ?? ''} columns={columns} data={data.boards} locale={locale} searchPlaceholder={t('cb.searchPage', locale)} emptyTitle={t('cb.noRecords', locale)} emptyDescription="" noMatchTitle={t('cb.noMatch', locale)} noMatchDescription="" />{data.next && <div className="cb-more"><Button variant="outline" onClick={more} disabled={busy}>{t(busy ? 'cb.loading' : 'cb.loadMore', locale)}</Button></div>}</> : <div className="cb-empty"><Heart aria-hidden="true" /><h2>{t(query ? 'cb.noMatch' : data.archived ? 'cb.noRecords' : 'cb.emptyBoards', locale)}</h2>{!query && !data.archived && <p>{t('cb.emptyBoardsDetail', locale)}</p>}</div>}</> : null}
    </PageFrame>
    <footer className="cb-footer" data-print-hidden>{t('cb.sharingLater', locale)}</footer>
    {form?.kind === 'new-board' || form?.kind === 'edit-board' ? <BoardForm key={form.draftId ?? board.id} board={form.kind === 'edit-board' ? board : null} draftId={form.draftId} locale={locale} initialOccasion={form.occasion ?? 'birthday'} onClose={() => setForm(null)} onSaved={saved => { setForm(null); location.assign(boardUrl(saved.id)); }} /> : null}
    {form?.kind === 'post' && <PostForm key={form.post?.id ?? form.draftId} board={board} post={form.post} draftId={form.draftId} locale={locale} onClose={() => setForm(null)} onSaved={() => { setForm(null); setNotice(t('cb.saved', locale)); void reload().catch(e => setError(e.messageKey)); }} />}
    {form?.kind === 'remove' && <FormWindow title={t('cb.deleteTitle', locale)} description={t('cb.deleteDetail', locale, { name: form.post.authorName })} busy={busy} onClose={() => setForm(null)}><Problem error={error} locale={locale} boardId={board.id} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setForm(null)}>{t('cb.cancel', locale)}</Button><Button variant="destructive" disabled={busy} onClick={() => postAction(form.post, 'remove-post')}>{t('cb.delete', locale)}</Button></DialogFooter></FormWindow>}
  </div>;
}
