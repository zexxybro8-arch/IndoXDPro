import { useEffect, useState } from 'react';
import { ActiveRoute, Header } from './components/Header';
import { AdminPanel } from './components/AdminPanel';
import { ToastContainer } from './components/ToastContainer';
import { VpnPortal } from './components/VpnPortal';
import { VpnProvider } from './context/VpnContext';

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
    <VpnProvider>
      <AppShell />
    </VpnProvider>
  );
}
