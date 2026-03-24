import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { isLikelyDynamicImportError } from '@/lib/lazyWithRetry';

type FatalState = {
	error: Error | null;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, FatalState> {
	constructor(props: React.PropsWithChildren) {
		super(props);
		this.state = { error: null };
	}

	static getDerivedStateFromError(error: Error): FatalState {
		return { error };
	}

	componentDidCatch(error: Error) {
		if (typeof window !== 'undefined' && isLikelyDynamicImportError(error)) {
			const retryKey = 'szap:fatal-lazy-import-retry';
			let hasRetried = false;
			try {
				hasRetried = window.sessionStorage.getItem(retryKey) === '1';
			} catch {
				hasRetried = false;
			}

			if (!hasRetried) {
				try {
					window.sessionStorage.setItem(retryKey, '1');
				} catch {
					// ignore storage errors
				}
				window.location.reload();
				return;
			}

			try {
				window.sessionStorage.removeItem(retryKey);
			} catch {
				// ignore storage errors
			}
		}
		console.error('[APP_FATAL_RENDER]', error);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="auth-shell min-h-screen w-full flex items-center justify-center p-6">
					<div className="w-full max-w-xl rounded-3xl border border-border/70 bg-card/90 p-6 shadow-[0_28px_90px_-42px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:shadow-[0_28px_90px_-42px_rgba(2,6,23,0.7)]">
						<h1 className="text-lg font-semibold text-foreground">Erro inesperado na aplicação</h1>
						<p className="mt-2 text-sm text-muted-foreground">Recarregue a página. Se persistir, envie a mensagem abaixo.</p>
						<pre className="mt-4 max-h-64 overflow-auto rounded-2xl border border-border bg-muted/50 p-3 text-xs text-foreground">
							{this.state.error.message || 'Erro desconhecido'}
						</pre>
						<button
							type="button"
							className="brand-gradient-button mt-4 rounded-xl px-4 py-2 text-sm font-medium text-white"
							onClick={() => window.location.reload()}
						>
							Recarregar
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

createRoot(document.getElementById('root')!).render(
	<AppErrorBoundary>
		<App />
	</AppErrorBoundary>,
);
