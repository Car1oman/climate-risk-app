import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAlerts, archiveAlert } from '@/lib/api';

export const useAlerts = ({ active = true } = {}) => {
  return useQuery({
    queryKey: ['alerts', { active }],
    queryFn: () => fetchAlerts({ active }),
    staleTime: 1000 * 60 * 2,
    retry: 1,
    refetchOnWindowFocus: false,
  });
};

export const useArchiveAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (/** @type {string} */ id) => archiveAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
};
