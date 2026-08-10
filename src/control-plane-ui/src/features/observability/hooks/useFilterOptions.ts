import { useQuery } from '@tanstack/react-query';
import { observabilityService } from '../application/ObservabilityService';

const FILTER_OPTIONS_STALE_TIME_MS = 60 * 1000;

export function useFilterOptions() {
  const query = useQuery({
    queryKey: ['observability', 'filter-options'],
    queryFn: async () => {
      const result = await observabilityService.getFilterOptions();
      if (result.isError()) throw new Error(result.getError().message);
      return result.getValue();
    },
    staleTime: FILTER_OPTIONS_STALE_TIME_MS,
  });

  return {
    options: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
