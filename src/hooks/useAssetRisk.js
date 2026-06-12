import { useQuery } from '@tanstack/react-query';
import { analyzeClimateRisk, batchAnalyzeClimateRisk } from '@/lib/api';

const RISK_LEVEL_ORDER = { critico: 0, alto: 1, medio: 2, bajo: 3, unknown: 9 };
const UNAVAILABLE_RISK = { risk_level: 'unknown', risk_score: null, financial_impact: null, signals: [], exposure: [], unavailable: true };

function normalizeV2Risk(assetId, v2Data) {
  if (!v2Data || v2Data.unavailable) return null;
  return {
    asset_id: assetId,
    risk_score: v2Data.overall_risk_score ?? null,
    risk_level: v2Data.overall_exposure ?? null,
    financial_impact: v2Data.financial_impact ?? null,
    signals: v2Data.signals?.signals ?? [],
    exposure: v2Data.risks ?? [],
    timestamp: v2Data.metadata?.generated_at ?? new Date().toISOString(),
    raw: v2Data,
    unavailable: false,
  };
}

function buildFallbackRisk(asset) {
  return {
    asset_id: asset?.id ?? null,
    risk_score: null,
    risk_level: 'unknown',
    financial_impact: null,
    signals: [],
    exposure: [],
    timestamp: null,
    raw: null,
    unavailable: true,
  };
}

export function useAssetRisk(asset) {
  const assetId = asset?.id;
  const lat = asset?.lat;
  const lng = asset?.lng;

  const { data: v2Data, isLoading, error } = useQuery({
    queryKey: ['asset-risk', assetId],
    queryFn: () => analyzeClimateRisk({
      lat,
      lon: lng,
      sector: 'retail',
      asset_type: asset?.type,
      scenario: undefined,
      business_unit_id: undefined,
    }),
    enabled: !!assetId && !!lat && !!lng,
    staleTime: 1000 * 60 * 10,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const v2Risk = normalizeV2Risk(assetId, v2Data);
  const computedRisk = v2Risk ?? buildFallbackRisk(asset);

  return {
    computedRisk,
    isLoading,
    error,
    isV2: !!v2Data,
    unavailable: computedRisk?.unavailable ?? false,
    stale: !isLoading && !v2Data && !!asset && !error,
  };
}

export function useBatchAssetRisks(assets) {
  const assetList = Array.isArray(assets) ? assets : [];

  const { data: batchResult, isLoading, error } = useQuery({
    queryKey: ['asset-risks-batch', assetList.map(a => a.id).sort().join(',')],
    queryFn: () => {
      const payload = assetList.map(a => ({
        id: a.id, lat: a.lat, lng: a.lng, type: a.type,
      }));
      return batchAnalyzeClimateRisk(payload);
    },
    enabled: assetList.length > 0,
    staleTime: 1000 * 60 * 10,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const computedRisks = {};
  let someUnavailable = false;

  if (batchResult?.results) {
    for (const asset of assetList) {
      const batchRisk = batchResult.results[asset.id];
      if (batchRisk) {
        if (batchRisk.unavailable) {
          computedRisks[asset.id] = { ...UNAVAILABLE_RISK, asset_id: asset.id };
          someUnavailable = true;
        } else {
          computedRisks[asset.id] = {
            asset_id: asset.id,
            risk_score: batchRisk.overall_risk_score ?? null,
            risk_level: batchRisk.overall_exposure ?? null,
            financial_impact: batchRisk.financial_impact ?? null,
            signals: [],
            exposure: [],
            timestamp: new Date().toISOString(),
            raw: batchRisk,
            unavailable: false,
          };
        }
      } else {
        computedRisks[asset.id] = buildFallbackRisk(asset);
        someUnavailable = true;
      }
    }
  } else {
    for (const asset of assetList) {
      computedRisks[asset.id] = buildFallbackRisk(asset);
    }
    if (assetList.length > 0) someUnavailable = true;
  }

  return {
    computedRisks,
    getRisk: (asset) => computedRisks[asset?.id] ?? buildFallbackRisk(asset),
    isLoading,
    error,
    isV2: !!batchResult?.results,
    unavailable: (!isLoading && !batchResult?.results && assetList.length > 0) || someUnavailable,
  };
}

export function sortByRiskLevel(assets, computedRisks = {}) {
  return [...assets].sort((a, b) => {
    const riskA = computedRisks[a.id]?.risk_level ?? a.risk_level ?? 'unknown';
    const riskB = computedRisks[b.id]?.risk_level ?? b.risk_level ?? 'unknown';
    return (RISK_LEVEL_ORDER[riskA] ?? 9) - (RISK_LEVEL_ORDER[riskB] ?? 9);
  });
}
