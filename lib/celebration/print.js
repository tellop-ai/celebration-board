/** Load a complete, unchanged visible board through separate page requests. */
export async function completeBoard(boardId, read, active = () => true) {
  const address = after => `/api/celebration?${new URLSearchParams({ board: boardId, visible: '1', ...(after ? { after: JSON.stringify(after) } : {}) })}`;
  const snapshot = await read(address());
  const all = [...snapshot.posts]; const version = snapshot.board.updatedAt; const visited = new Set();
  let next = snapshot.next;
  while (next && active()) {
    const cursor = JSON.stringify(next);
    if (visited.has(cursor)) throw { messageKey: 'cb.viewChanged' };
    visited.add(cursor);
    const part = await read(address(next));
    if (part.board.updatedAt !== version) throw { messageKey: 'cb.viewChanged' };
    all.push(...part.posts); next = part.next;
  }
  if (!active()) return null;
  const checked = await read(address());
  if (checked.board.updatedAt !== version) throw { messageKey: 'cb.viewChanged' };
  return { ...snapshot, posts: all, next: null };
}

/** Bound the complete resource wait, including fonts, before opening the print dialog. */
export async function waitForPrintPictures(page, timeoutMs = 15000) {
  let timer;
  try {
    await Promise.race([
      (async () => {
        await page.fonts.ready;
        if (page.querySelector('.print-page [data-media-problem]')) throw new Error('pictures');
        await Promise.all([...page.querySelectorAll('.print-page img')].map(image => { image.loading = 'eager'; return image.decode(); }));
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('pictures')), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
