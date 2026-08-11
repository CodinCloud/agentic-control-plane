import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { FilterSelect } from '@/components/vloc/FilterSelect';
import { Button } from '@/components/ui/button';
import { useFilterOptions } from '../hooks/useFilterOptions';
import { ObservabilityDomain } from '../domain/ObservabilityDomain';
import type { EventFilters } from '../observabilityTypes';

function toValue(value: string | null): string {
  return value ?? '';
}

function toFilterValue(raw: string): string | null {
  return raw === '' ? null : raw;
}

export function EventFiltersBar() {
  const filters = useAppStore((state) => state.filters);
  const setFilter = useAppStore((state) => state.setFilter);
  const resetFilters = useAppStore((state) => state.resetFilters);
  const { options, isLoading } = useFilterOptions();

  const handleChange = (key: keyof EventFilters) => (raw: string) => {
    setFilter(key, toFilterValue(raw));
  };

  const hasActiveFilter = Object.values(filters).some((value) => value !== null);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card/40 p-3">
      <div className="mr-1 flex items-center gap-1 self-center text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="text-xs uppercase tracking-wide">Filtres</span>
      </div>

      <FilterSelect
        label="Session"
        value={toValue(filters.sessionId)}
        onChange={handleChange('sessionId')}
        disabled={isLoading}
        options={(options?.sessions ?? []).map((session) => ({
          value: session.id,
          label: `${session.project ?? session.id.slice(0, 8)} (${session.eventCount})`,
        }))}
      />

      <FilterSelect
        label="Projet"
        value={toValue(filters.project)}
        onChange={handleChange('project')}
        disabled={isLoading}
        options={(options?.projects ?? []).map((project) => ({ value: project, label: project }))}
      />

      <FilterSelect
        label="Événement"
        value={toValue(filters.eventName)}
        onChange={handleChange('eventName')}
        disabled={isLoading}
        options={(options?.eventNames ?? []).map((name) => ({ value: name, label: name }))}
      />

      <FilterSelect
        label="Agent"
        value={toValue(filters.agentType)}
        onChange={handleChange('agentType')}
        disabled={isLoading}
        options={[
          { value: ObservabilityDomain.MAIN_SESSION_FILTER, label: ObservabilityDomain.MAIN_SESSION_LABEL },
          ...(options?.agentTypes ?? []).map((type) => ({ value: type, label: type })),
        ]}
      />

      <FilterSelect
        label="Outil"
        value={toValue(filters.toolName)}
        onChange={handleChange('toolName')}
        disabled={isLoading}
        options={(options?.toolNames ?? []).map((tool) => ({ value: tool, label: tool }))}
      />

      <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasActiveFilter} className="ml-auto">
        <RotateCcw className="h-3.5 w-3.5" />
        Réinitialiser
      </Button>
    </div>
  );
}
