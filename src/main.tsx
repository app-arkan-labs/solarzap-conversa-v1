import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
		console.error('[APP_FATAL_RENDER]', error);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-6">
					<div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
						<h1 className="text-lg font-semibold text-slate-900">Erro inesperado na aplicação</h1>
						<p className="mt-2 text-sm text-slate-600">Recarregue a página. Se persistir, envie a mensagem abaixo.</p>
						<pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-100 p-3 text-xs text-slate-800">
							{this.state.error.message || 'Erro desconhecido'}
						</pre>
						<button
							type="button"
							className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
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
