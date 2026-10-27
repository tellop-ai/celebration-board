'use client';
import { useState } from 'react';
import { t } from '../lib/i18n/index.js';
import { pictureAddress } from '../lib/pictures.js';
import { mediaUrl, coverUrl, videoShowsPicture } from '../lib/celebration/client.js';
export function MediaView({ boardId, media, locale, visibleOnly = false, printing = false }) {
  const [failed, setFailed] = useState(false);
  const url = mediaUrl(boardId, media, false, visibleOnly);
  return <figure className="cb-media-view">
    {printing && media.kind === 'video' ? <p className="cb-help">{t('cb.videoPrintNote', locale)}</p> : !failed && media.kind === 'video' ? <video key={url} controls preload="metadata" src={pictureAddress(url, media.originalFile)} onError={() => setFailed(true)} onLoadedMetadata={e => { if (!videoShowsPicture(e.currentTarget)) setFailed(true); }} aria-label={media.description || t('cb.video', locale)} /> : !failed ? <img loading={printing ? "eager" : "lazy"} src={pictureAddress(url, media.displayFile ?? media.originalFile)} alt={media.description} onError={() => setFailed(true)} /> : <p data-media-problem className="cb-help">{t('cb.mediaUnavailable', locale)}</p>}
    {media.description && <figcaption>{media.description}</figcaption>}
    {media.kind === 'video' && !printing && <p className="cb-print-video">{t('cb.video', locale)}</p>}
    <a data-print-hidden className="cb-download" href={mediaUrl(boardId, media, true, visibleOnly)}>{t('cb.download', locale)}</a>
  </figure>;
}
export function Cover({ board, locale }) {
  const [failed, setFailed] = useState(false);
  if (!board.coverFile) return null;
  return <figure className="cb-cover">{!failed ? <img src={pictureAddress(coverUrl(board.id), board.coverDisplayFile ?? board.coverFile)} alt={board.coverAlt} onError={() => setFailed(true)} /> : <p data-media-problem>{t('cb.mediaUnavailable', locale)}</p>}{failed && <a data-print-hidden href={coverUrl(board.id, true)}>{t('cb.download', locale)}</a>}</figure>;
}
