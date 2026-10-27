export async function request(input, { method = 'POST', signal, timeoutMs } = {}) {
  if (timeoutMs !== undefined) signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]);
  let answer, response;
  try {
    response = await fetch(method === 'GET' ? input : '/api/celebration', method === 'GET' ? { signal, cache: 'no-store' } : { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    answer = await response.json();
  } catch { const error = new Error('error.saveUnconfirmed'); error.messageKey = method === 'GET' ? 'error.storageUnreadable' : input?.action === 'draft-message' ? 'ai.unavailable' : 'error.saveUnconfirmed'; throw error; }
  if (!response.ok || answer.ok === false) { const error = new Error(answer.problem); error.messageKey = answer.problem ?? 'error.saveFailed'; throw error; }
  return method === 'GET' ? answer : answer.result;
}
export const boardUrl = (id, view = '') => '/?' + new URLSearchParams({ board: id, ...(view ? { view } : {}) });
export const mediaUrl = (boardId, media, download = false, visible = false) => '/api/celebration/media?' + new URLSearchParams({ board: boardId, post: media.postId, id: media.id, ...(download ? { download: '1' } : {}), ...(visible ? { visible: '1' } : {}) });
// A browser that plays a file's sound but cannot draw its picture reports no error, only a video with no size.
export const videoShowsPicture = (video) => video.videoWidth > 0 && video.videoHeight > 0;
export const coverUrl = (id, download = false) => '/api/celebration/media?' + new URLSearchParams({ board: id, cover: '1', ...(download ? { download: '1' } : {}) });
