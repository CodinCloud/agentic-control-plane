import { Link, Outlet, createRootRoute } from '@tanstack/react-router';
import { Radar } from 'lucide-react';
import { cn } from '@/core';

const NAV = [
  { to: '/', label: 'Tour de contrôle' },
  { to: '/sessions', label: 'Sessions' },
] as const;

/**
 * Coquille commune aux deux écrans. Pleine largeur, jamais une colonne centrée :
 * la largeur du Gantt *est* du temps, l'écraser détruit l'information. Voir
 * CONTEXT.md §"Doctrine de layout".
 */
function RootLayout() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/40 px-6 py-3">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-neutral-400" aria-hidden="true" />
            <div>
              <h1 className="text-base font-semibold text-neutral-100">Control Plane</h1>
              <p className="text-sm text-neutral-500">Observabilité de la boucle agentique — localhost:4317</p>
            </div>
          </div>

          <nav className="flex items-center gap-1" aria-label="Navigation principale">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                // `exact` sur l'accueil, sans quoi « / » resterait actif sur /sessions.
                activeOptions={{ exact: item.to === '/' }}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-neutral-200"
                activeProps={{ className: cn('bg-neutral-800 text-neutral-100') }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex flex-col gap-6 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export const Route = createRootRoute({ component: RootLayout });
