import { Radar } from 'lucide-react';
import { KpiDashboard, EventTimeline } from '@/features/observability';

function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/40 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <Radar className="h-5 w-5 text-neutral-400" aria-hidden="true" />
          <div>
            <h1 className="text-base font-semibold text-neutral-100">Control Plane</h1>
            <p className="text-xs text-neutral-500">Observabilité de la boucle agentique — localhost:4317</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <KpiDashboard />
        <EventTimeline />
      </main>
    </div>
  );
}

export default App;
