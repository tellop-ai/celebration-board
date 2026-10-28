import { PALETTES, LAYOUTS } from './appearance.js';
import { DataError } from '../data/refusal.js';
export const OWNER = 'local-owner';
export const OCCASIONS = ['birthday', 'wedding', 'farewell', 'thanks', 'congratulations', 'welcome', 'anniversary', 'other'];
export const STATUSES = ['draft', 'collecting', 'ready', 'archived'];
export const TONES = ['warm', 'funny', 'simple'];
export const PAGE_SIZE = 12;
export const BOARD_PAGE_SIZE = 24;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function fail(key = 'cb.invalid') { throw new DataError(key); }
export function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(); return value; }
export function id(value) { if (typeof value !== 'string' || !UUID.test(value)) fail(); return value; }
export function owner(value) { if (typeof value !== 'string' || !value.trim()) fail('error.ownerMissing'); return value; }
export function text(value, max, min = 0) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail();
  const clean = value.trim(); if (clean.length < min || clean.length > max) fail(); return clean;
}
export function choice(value, choices) { if (!choices.includes(value)) fail(); return value; }
export function day(value) {
  if (value === '' || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) fail();
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value || value < '0001-01-01') fail();
  return value;
}
export function boardInput(value) {
  const v = object(value);
  return { title: text(v.title, 120, 1), recipient: text(v.recipient, 80, 1), occasion: choice(v.occasion, OCCASIONS),
    occasionDate: day(v.occasionDate ?? null), introduction: text(v.introduction ?? '', 1000),
    layout: choice(v.layout, LAYOUTS), ...(v.palette === undefined ? {} : { palette: choice(v.palette, PALETTES) }), coverAlt: text(v.coverAlt ?? '', 300) };
}
export function postInput(value) {
  const v = object(value);
  return { authorName: text(v.authorName, 80, 1), body: text(v.body ?? '', 2000) };
}
export function stamp(previous) { return new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString(); }
export function cursor(value) {
  if (value == null || value === '') return null;
  let v; try { v = typeof value === 'string' ? JSON.parse(value) : value; } catch { fail(); }
  object(v); id(v.id); if (!Number.isFinite(v.position)) fail(); return { id: v.id, position: v.position };
}
export function afterPosition(value, direction = 'asc') {
  const op = direction === 'asc' ? 'gt' : 'lt';
  return { OR: [{ position: { [op]: value.position } }, { position: value.position, id: { [op]: value.id } }] };
}
export function draftInput(value) {
  const v = object(value);
  return { boardId: id(v.boardId), draft: text(v.draft ?? '', 2000), tone: choice(v.tone, TONES), language: choice(v.language, ['en', 'tr']) };
}
