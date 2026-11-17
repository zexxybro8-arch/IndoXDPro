import React, { useEffect, useState } from 'react';
import { ActiveRoute, Header } from './components/Header';
import { AdminPanel } from './components/AdminPanel';
import { ToastContainer } from './components/ToastContainer';
import { VpnPortal } from './components/VpnPortal';
import { VpnProvider } from './context/VpnContext';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const raw = error instanceof Error ? error.message : String(error);
    let friendly = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        friendly = `${parsed.error}${parsed.path ? ` (${parsed.operationType ?? 'op'} on ${parsed.path})` : ''}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: friendly };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#050409] p-6 text-slate-100">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#0A0812] p-6 text-center">
            <h1 className="font-display text-lg font-bold text-white">
              Unable to complete Firebase operation
            </h1>
            <p className="mt-2 break-words text-xs text-rose-300">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-purple-glow mt-5 inline-flex min-h-[40px] items-center justify-center rounded-xl px-5 text-xs font-semibold text-white"
            >
              Reload IndoXDPro
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function resolveRouteFromLocation(): ActiveRoute {
  if (typeof window === 'undefined') return 'portal';
  return window.location.pathname.startsWith('/admin') ? 'admin' : 'portal';
}

function AppShell() {
  const [route, setRoute] = useState<ActiveRoute>(resolveRouteFromLocation);

  useEffect(() => {
    const onPopState = () => {
      setRoute(resolveRouteFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleNavigate = (next: ActiveRoute) => {
    const targetPath = next === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
    setRoute(next);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#050409] text-slate-100">
      <Header route={route} onNavigate={handleNavigate} />

      <div className="flex-1">
        {route === 'admin' ? (
          <AdminPanel onBackToDashboard={() => handleNavigate('portal')} />
        ) : (
          <VpnPortal />
        )}
      </div>

      <footer className="py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 text-xs text-slate-600 sm:px-6 lg:px-8">
          <span>IndoXDPro</span>
        </div>
      </footer>

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <VpnProvider>
        <AppShell />
      </VpnProvider>
    </AppErrorBoundary>
  );
}
