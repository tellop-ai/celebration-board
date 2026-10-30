'use client';
import { useEffect, useRef, useState } from 'react';
import { enUS, tr } from 'date-fns/locale';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select';
import { PictureField } from '../components/ui/picture-field';
import { FileUpload } from '../components/ui/file-upload';
import { Calendar } from '../components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { t } from '../lib/i18n/index.js';
import { formatDate } from '../lib/format.js';
import { appendPicture, sendFile } from '../lib/send-file.js';
import { pictureAddress } from '../lib/pictures.js';
import { OCCASIONS, TONES } from '../lib/celebration/rules.js';
import { DEFAULT_PALETTE, occasionPalette, promptKey } from '../lib/celebration/appearance.js';
import { PalettePicker } from './celebration-design';
import { request, boardUrl, coverUrl, mediaUrl } from '../lib/celebration/client.js';

export function Choices({ value, onChange, options, locale, label, disabled }) {
  return <label className="cb-field"><span>{label}</span><NativeSelect value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>{options.map(key => <NativeSelectOption key={key} value={key}>{t(`cb.${key}`, locale)}</NativeSelectOption>)}</NativeSelect></label>;
}
export function Problem({ error, locale, boardId }) {
  if (!error) return null;
  return <div role="alert" className="cb-problem"><p>{t(error, locale)}</p>{['error.saveUnconfirmed', 'cb.alreadySaved', 'cb.changed'].includes(error) && boardId ? <p><a href={boardUrl(boardId)}>{t('cb.checkSaved', locale)}</a> · {t('cb.checkNotice', locale)}</p> : null}</div>;
}
export function FormWindow({ title, description, children, onClose, busy = false, wide = false }) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className={`flex max-h-[calc(100dvh-2rem)] flex-col ${wide ? "sm:max-w-4xl" : "sm:max-w-xl"}`}><DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>{children}</DialogContent></Dialog>;
}
async function pictureValues(value, name) {
  const form = new FormData();
  const gif = value?.file?.type === 'image/gif';
  try { await appendPicture(form, name, value, gif ? {} : { displayCopy: `${name}Display` }); }
  catch (error) {
    if (error.messageKey !== 'error.pictureUnreadable' || !form.has(name)) throw error;
    // A browser unable to draw a small copy still keeps and serves the original through the kit.
  }
  const output = {};
  if (form.has(name)) output.original = form.get(name) === 'remove' ? null : form.get(name);
  if (form.has(`${name}Display`)) output.display = form.get(`${name}Display`) === 'remove' ? null : form.get(`${name}Display`);
  return output;
}
export function BoardForm({ board, draftId, locale, onClose, onSaved, initialOccasion = 'birthday' }) {
  const [draft, setDraft] = useState(() => ({ title: board?.title ?? '', recipient: board?.recipient ?? '', occasion: board?.occasion ?? initialOccasion, occasionDate: board?.occasionDate ?? null, introduction: board?.introduction ?? '', layout: board?.layout ?? 'gallery', palette: board?.palette ?? occasionPalette(initialOccasion) ?? DEFAULT_PALETTE, coverAlt: board?.coverAlt ?? '' }));
  const [paletteChosen, setPaletteChosen] = useState(Boolean(board));
  const [picture, setPicture] = useState(board?.coverFile ? { saved: pictureAddress(coverUrl(board.id), board.coverDisplayFile ?? board.coverFile) } : null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      const files = await pictureValues(picture, 'cover');
      const result = await request({ action: board ? 'edit-board' : 'create-board', id: board?.id ?? draftId, updatedAt: board?.updatedAt, ...draft, ...(files.original !== undefined ? { coverFile: files.original, coverDisplayFile: files.display ?? null } : {}) });
      setPicture(null); onSaved(result);
    } catch (e) { setError(e.messageKey ?? 'error.saveFailed'); } finally { setBusy(false); }
  }
  const picked = draft.occasionDate ? new Date(`${draft.occasionDate}T12:00:00`) : undefined;
  return <FormWindow title={t(board ? 'cb.editBoard' : 'cb.newBoard', locale)} description={board?.title} onClose={onClose} busy={busy}>
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto px-1"><fieldset disabled={busy} className="cb-form-fields">
        <label className="cb-field">{t('cb.title', locale)}<Input autoFocus required maxLength={120} value={draft.title} onChange={e => set('title', e.target.value)} /></label>
        <label className="cb-field">{t('cb.recipient', locale)}<Input required maxLength={80} value={draft.recipient} onChange={e => set('recipient', e.target.value)} /></label>
        <Choices value={draft.occasion} onChange={v => setDraft(d => ({ ...d, occasion: v, ...(!paletteChosen ? { palette: occasionPalette(v) } : {}) }))} options={OCCASIONS} locale={locale} label={t('cb.occasion', locale)} />
        <details><summary>{t('cb.occasionDate', locale)} · {draft.occasionDate ? formatDate(draft.occasionDate, locale) : t('cb.noDate', locale)}</summary><Calendar mode="single" selected={picked} locale={locale === 'tr' ? tr : enUS} onSelect={date => set('occasionDate', date ? `${date.getFullYear().toString().padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : null)} /><Button type="button" variant="ghost" onClick={() => set('occasionDate', null)}>{t('cb.clearDate', locale)}</Button></details>
        <label className="cb-field">{t('cb.introduction', locale)}<Textarea maxLength={1000} rows={3} value={draft.introduction} onChange={e => set('introduction', e.target.value)} /></label>
        <Choices value={draft.layout} onChange={v => set('layout', v)} options={['gallery', 'reading']} locale={locale} label={t('cb.layout', locale)} />
        <PalettePicker value={draft.palette} onChange={palette => { setPaletteChosen(true); set('palette', palette); }} locale={locale} disabled={busy} />
        <div className="cb-field"><span>{t('cb.cover', locale)}</span><PictureField locale={locale} value={picture} onChange={setPicture} disabled={busy} alt={draft.coverAlt} /></div>
        <label className="cb-field">{t('cb.description', locale)}<Input maxLength={300} value={draft.coverAlt} onChange={e => set('coverAlt', e.target.value)} /></label>
        <p className="cb-help">{t('cb.keepOriginal', locale)}</p>
      </fieldset></div>
      <Problem error={error} locale={locale} boardId={board?.id ?? draftId} />
      <DialogFooter className="cb-form-footer"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('cb.cancel', locale)}</Button><Button type="submit" disabled={busy}>{t(busy ? 'cb.saving' : 'cb.save', locale)}</Button></DialogFooter>
    </form>
  </FormWindow>;
}
export function PostForm({ board, post, draftId, locale, onClose, onSaved }) {
  const [name, setName] = useState(post?.authorName ?? ''); const [body, setBody] = useState(post?.body ?? '');
  const [attachments, setAttachments] = useState(() => (post?.media ?? []).map(m => ({ ...m, slot: m.id, value: m.kind !== 'video' ? { saved: pictureAddress(mediaUrl(board.id, m), m.displayFile ?? m.originalFile) } : null, files: [] })));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const [tone, setTone] = useState('warm'); const [proposal, setProposal] = useState(''); const [aiBusy, setAiBusy] = useState(false); const [aiError, setAiError] = useState(null);
  const draftCall = useRef(null);
  useEffect(() => () => { draftCall.current?.abort(); draftCall.current = null; }, []);
  function cancelDraft() { const call = draftCall.current; draftCall.current = null; call?.abort(); setAiBusy(false); }
  function close() { cancelDraft(); onClose(); }
  function insertPrompt(kind) {
    setBody(current => `${current}${current ? '\n\n' : ''}${t(promptKey(board.occasion, kind), locale)}`.slice(0, 2000));
  }
  const patch = (slot, change) => setAttachments(current => current.map(a => a.slot === slot ? { ...a, ...change } : a));
  const active = attachments.filter(a => !a.removed && a.value?.removed !== true);
  const add = kind => setAttachments(current => [...current, { slot: crypto.randomUUID(), kind, value: null, files: [], description: '' }]);
  async function draft() {
    if (draftCall.current || busy) return;
    const call = new AbortController(); draftCall.current = call; setAiBusy(true); setAiError(null); setProposal('');
    try { const answer = await request({ action: 'draft-message', boardId: board.id, draft: body, tone, language: locale }, { signal: call.signal, timeoutMs: 60000 }); if (draftCall.current === call) setProposal(answer.text); }
    catch (e) { if (draftCall.current === call) setAiError(e.messageKey ?? 'ai.unavailable'); }
    finally { if (draftCall.current === call) { draftCall.current = null; setAiBusy(false); } }
  }
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    cancelDraft();
    try {
      const media = [];
      for (const a of active) {
        if (!a.id && !a.value?.file && !a.files.length) continue;
        const item = { ...(a.id ? { id: a.id } : {}), description: a.description };
        if (a.kind === 'video' && a.files.length) item.originalFile = (await sendFile(a.files[0])).file;
        if (a.kind !== 'video') {
          const values = await pictureValues(a.value, 'photo');
          if (values.original !== undefined) { item.originalFile = values.original; item.displayFile = values.display ?? null; }
        }
        media.push(item);
      }
      const saved = await request({ action: post ? 'edit-post' : 'create-post', boardId: board.id, id: post?.id ?? draftId, updatedAt: post?.updatedAt, authorName: name, body, media });
      setAttachments([]); onSaved(saved);
    } catch (e) { setError(e.messageKey ?? 'error.saveFailed'); } finally { setBusy(false); }
  }
  return <FormWindow title={t(post ? 'cb.editMessage' : 'cb.messageFor', locale, { name: board.recipient })} description={board.title} onClose={close} busy={busy} wide>
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="cb-editor-scroll min-h-0 flex-1 overflow-y-auto px-1"><fieldset disabled={busy} className="cb-editor-fields"><div className="cb-form-fields">
        <label className="cb-field">{t('cb.signedBy', locale)}<Input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <p className="cb-help">{t('cb.onBehalf', locale)}</p>
        <label className="cb-field"><span className="cb-field-heading"><span>{t('cb.message', locale)}</span><span className="cb-help">{t('cb.characterCount', locale, { count: String(body.length) })}</span></span><Textarea rows={6} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} /></label>
        <div className="cb-writing-prompts" aria-label={t('cb.writingPrompts', locale)}><Button type="button" variant="outline" size="sm" onClick={() => insertPrompt('memory')}>{t('cb.memoryPrompt', locale)}</Button><Button type="button" variant="outline" size="sm" onClick={() => insertPrompt('admire')}>{t('cb.admirePrompt', locale)}</Button><Button type="button" variant="outline" size="sm" onClick={() => insertPrompt('wish')}>{t('cb.wishPrompt', locale)}</Button></div>
        <details className="cb-ai"><summary>{t('cb.helpWrite', locale)}</summary><p className="cb-help">{t('cb.aiNotice', locale)}</p><Choices label={t('cb.tone', locale)} value={tone} onChange={setTone} options={TONES} locale={locale} /><Button type="button" variant="outline" onClick={draft} disabled={aiBusy || busy}>{t(aiBusy ? 'cb.thinking' : 'cb.helpWrite', locale)}</Button>{aiBusy && <Button type="button" variant="ghost" onClick={cancelDraft}>{t('cb.continueWithoutAI', locale)}</Button>}<Problem error={aiError} locale={locale} />{proposal && <div className="cb-proposal"><h3>{t('cb.proposal', locale)}</h3><p>{proposal}</p><div className="cb-actions"><Button type="button" onClick={() => { setBody(proposal); setProposal(''); }}>{t('cb.useDraft', locale)}</Button><Button type="button" variant="ghost" onClick={() => setProposal('')}>{t('cb.keepMine', locale)}</Button></div></div>}</details>
        {active.map(a => <section key={a.slot} className="cb-attachment"><div className="cb-actions"><strong>{t(a.kind === 'video' ? 'cb.video' : 'cb.addPhoto', locale)}</strong><Button type="button" size="sm" variant="ghost" onClick={() => patch(a.slot, { removed: true })}>{t('cb.removeMedia', locale)}</Button></div>{a.kind === 'video' ? <><FileUpload accept="video/*,.mov,.mkv" files={a.files} onFiles={files => patch(a.slot, { files })} label={t('cb.chooseVideo', locale)} hint={t('cb.videoHint', locale)} chooseLabel={t('cb.chooseFile', locale)} removeLabel={t('cb.remove', locale)} rejectedLabel={t('cb.wrongKind', locale)} tooManyLabel={t('cb.videoLimit', locale)} />{a.originalFile && !a.files.length && <a href={mediaUrl(board.id, a, true)}>{t('cb.download', locale)}</a>}</> : <PictureField locale={locale} value={a.value} onChange={value => patch(a.slot, { value })} disabled={busy} alt={a.description} />}<label className="cb-field">{t('cb.mediaDescription', locale)}<Input value={a.description} maxLength={300} onChange={e => patch(a.slot, { description: e.target.value })} /></label></section>)}
        <div className="cb-actions"><Button type="button" variant="outline" onClick={() => add('image')} disabled={active.length >= 4}>{t('cb.addPhoto', locale)}</Button><Button type="button" variant="outline" onClick={() => add('video')} disabled={active.length >= 4 || active.some(a => a.kind === 'video')}>{t('cb.addVideo', locale)}</Button></div>
        <p className="cb-help">{t('cb.keepOriginal', locale)}</p>
      </div><aside className="cb-editor-preview" aria-label={t('cb.previewLabel', locale)}><p className="cb-preview-label">{t('cb.previewLabel', locale)}</p><div className="cb-preview-card"><p className="cb-message">{body || t('cb.previewPlaceholder', locale)}</p><footer className="cb-signature"><span className="cb-initial" aria-hidden="true">{(name || t('cb.previewSignature', locale)).slice(0, 1)}</span><span>{name || t('cb.previewSignature', locale)}</span></footer></div><p className="cb-help">{t('cb.previewNote', locale)}</p></aside></fieldset></div>
      <Problem error={error} locale={locale} boardId={board.id} />
      <DialogFooter className="cb-form-footer"><Button type="button" variant="outline" onClick={close} disabled={busy}>{t('cb.cancel', locale)}</Button><Button type="submit" disabled={busy}>{t(busy ? 'cb.saving' : 'cb.save', locale)}</Button></DialogFooter>
    </form>
  </FormWindow>;
}
