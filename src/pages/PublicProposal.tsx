import { useEffect, useState } from 'react';
import { supabaseUrl } from '@/lib/supabase';
import { downloadProposalHTML } from '@/utils/proposalPage';

export default function PublicProposal() {
  const [file, setFile] = useState<{ html: string; name: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) {
      setFailed(true);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(supabaseUrl + '/functions/v1/proposal-share', {
          method: 'POST',
          body: JSON.stringify({ token }),
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Proposta indisponível');
        const result = await response.json();
        if (typeof result.html !== 'string' || typeof result.name !== 'string') throw new Error('Proposta indisponível');
        setFile(result);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, []);

  if (!file) return <main className="grid min-h-dvh place-items-center p-6 text-center" role="status">
    {failed ? 'Esta proposta está indisponível ou o link venceu.' : 'Carregando proposta…'}
  </main>;

  return <main className="flex h-dvh flex-col bg-white">
    <div className="flex justify-end border-b px-4 py-2">
      <button type="button" className="rounded px-3 py-1 text-sm text-green-900 underline"
        onClick={() => downloadProposalHTML(new File([file.html], file.name, { type: 'text/html;charset=utf-8' }))}>
        Baixar HTML
      </button>
    </div>
    <iframe title="Proposta comercial de energia solar" srcDoc={file.html}
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 border-0" />
  </main>;
}
