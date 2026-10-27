import { DataError } from '../data/refusal.js';
export function json(value, status = 200) { return Response.json(value, { status, headers: { 'cache-control': 'no-store' } }); }
export function problem(error) {
  const key = error?.wordsKey ?? error?.messageKey ?? (error?.code === 'P2025' ? 'cb.changed' : error?.code === 'P2002' ? 'cb.alreadySaved' : 'error.saveFailed');
  return json({ ok: false, problem: key }, key === 'cb.notFound' ? 404 : 400);
}
export async function readJson(request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new DataError('cb.invalid');
  const reader = request.body?.getReader(); if (!reader) throw new DataError('cb.invalid');
  let length = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 65536) { await reader.cancel(); throw new DataError('cb.invalid'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) { if (error instanceof DataError) throw error; throw new DataError('cb.invalid'); }
  finally { reader.releaseLock(); }
}
