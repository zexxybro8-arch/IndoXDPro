import { ArrowLeft, Shield } from 'lucide-react';

export type ActiveRoute = 'portal' | 'admin';

interface HeaderProps {
  route: ActiveRoute;
  onNavigate: (route: ActiveRoute) => void;
}

export function Header({ route, onNavigate }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#050409]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Invisible transparent hit area on portal, visible brand on admin */}
        {route === 'portal' ? (
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            aria-label="Admin Access"
            className="flex h-9 w-40 shrink-0 cursor-default opacity-0 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('portal')}
            className="group flex shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg py-0.5 pr-1 font-display text-base font-bold tracking-wider text-white transition-colors hover:text-violet-200 focus-visible:outline-2 focus-visible:outline-violet-500"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/35 bg-violet-600/15 text-violet-400 transition-colors group-hover:border-violet-400/60 group-hover:bg-violet-600/25">
              <Shield className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>IndoXDPro Admin</span>
          </button>
        )}

        {/* Show Portal return button only when inside /admin */}
        {route === 'admin' && (
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('portal')}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Portal</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
