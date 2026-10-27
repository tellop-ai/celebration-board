'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '../lib/i18n/index.js';
import { waitForPrintPictures } from '../lib/celebration/print.js';

/** Print the actual page, including its local fonts. No separate PDF layout. */
export function PrintButton({ locale }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let restoreDark = false;
    const before = () => {
      restoreDark ||= document.documentElement.classList.contains('dark');
      document.documentElement.classList.remove('dark');
    };
    const after = () => {
      if (restoreDark) document.documentElement.classList.add('dark');
      restoreDark = false;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      mounted.current = false; after();
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  async function printPage() {
    if (busy) return; setBusy(true); setProblem(false);
    try {
      await waitForPrintPictures(document);
      if (mounted.current) window.print();
    } catch {
      if (mounted.current) setProblem(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return <span data-print-hidden>{problem && <p role="alert">{t('error.pictureUnreadable', locale)}</p>}<Button type="button" data-print-hidden disabled={busy} onClick={printPage}>{t('print.savePdf', locale)}</Button></span>;
}
