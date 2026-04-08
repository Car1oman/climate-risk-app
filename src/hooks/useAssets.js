import { useQuery } from '@tanstack/react-query';
import { fetchAssets } from '@/lib/api';

/** @returns {import('@tanstack/react-query').UseQueryResult<any[], Error>} */
export const useAssets = () => {
  return useQuery({
    queryKey: ['assets'],
    queryFn: fetchAssets,
    staleTime: 1000 * 60 * 5,
    retry: 1,
    refetchOnWindowFocus: false,
  });
};
