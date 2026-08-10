import { Radar } from 'lucide-react';
import { KpiDashboard, EventTimeline } from '@/features/observability';
import { GanttChart } from '@/features/timeline';

/**
 * Pleine largeur, jamais une colonne centrée : la largeur du Gantt *est* du
 * temps, l'écraser détruit l'information. La chronologie occupe la majeure
 * partie de la largeur, le coût par agent l'accompagne en colonne latérale,
 * le flux d'événements reste en dessous. Voir CONTEXT.md §"Doctrine de layout".
 */
function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/40 px-6 py-4">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-neutral-400" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold text-neutral-100">Control Plane</h1>
            <p className="text-sm text-neutral-500">Observabilité de la boucle agentique — localhost:4317</p>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-6 px-6 py-6">
        {/* 3/4 – 1/4 à partir de xl. En dessous, la colonne latérale repasse
            sous le Gantt plutôt que de le comprimer. */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
          <div className="xl:col-span-3">
            <GanttChart />
          </div>
          <div className="xl:col-span-1">
            <KpiDashboard />
          </div>
        </div>

        <EventTimeline />
      </main>
    </div>
  );
}

export default App;
