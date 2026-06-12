/**
 * useClimateAnalysis — Sprint 15.
 *
 * Single hook that owns all climate analysis logic:
 *   - API fetch lifecycle (loading / error)
 *   - normalizeRisks() — deduplication layer (Sprint 14)
 *   - buildNarrativeReport() — structured NarrativeReport model
 *   - Projection context extraction (Layer9)
 *   - Context data (territorial, document)
 *
 * ClimateRiskLookup.jsx should only hold UI state (lat, lng, sector,
 * tileLayer, markerPos, flyTarget).  All data derivations live here.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { analyzeClimateRisk, fetchDocumentContext, fetchTerritorialContext } from '@/lib/api';
import { normalizeRisks, groupByRiskType } from '@/domain/normalizeRisks';
import { buildNarrativeReport } from '@/domain/buildNarrativeReport';
import { SECTORS } from '@/features/climate-lookup/constants';

/**
 * @param {string} sector         - Current sector slug (e.g. 'retail')
 * @param {string} businessUnitId - Business unit ID (e.g. 'spsa', 'interbank')
 * @returns {object}              - Hook payload (see return statement for full shape)
 */
export function useClimateAnalysis(sector, businessUnitId = '') {
  const [rawResponse,   setRawResponse]   = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [territorialCtx, setTerritorialCtx] = useState(null);
  const [docContext,    setDocContext]    = useState(null);

  // ── Context data fetched once on mount ──────────────────────────────────────
  useEffect(() => {
    Promise.allSettled([fetchTerritorialContext(), fetchDocumentContext()]).then(
      ([terrResult, docResult]) => {
        if (terrResult.status === 'fulfilled' && terrResult.value)
          setTerritorialCtx(terrResult.value);
        if (docResult.status === 'fulfilled' && docResult.value?.total > 0)
          setDocContext(docResult.value);
      }
    );
  }, []);

  // ── Normalization pipeline ───────────────────────────────────────────────────
  // Each memo re-runs only when its direct dependency changes.
  // Order: raw → consolidated → summary/report.

  const consolidatedRisks = useMemo(() => {
    if (!rawResponse) return [];
    try {
      return normalizeRisks(rawResponse);
    } catch (err) {
      if (import.meta.env.DEV)
        console.error('[useClimateAnalysis] normalizeRisks failed:', err);
      return [];
    }
  }, [rawResponse]);

  const _locationLabel = useMemo(() => {
    const loc = rawResponse?.location;
    if (!loc) return 'la ubicación seleccionada';
    return loc.city
      ? `${loc.city}${loc.country ? ', ' + loc.country : ''}`
      : 'la ubicación seleccionada';
  }, [rawResponse]);

  const _sectorLabel = useMemo(() => {
    const found = SECTORS.find(s => s.value === sector);
    return found?.label ?? sector;
  }, [sector]);

  // Timeline-grouped view — drives RiskTimeline component (Sprint 22)
  const timelineRisks = useMemo(
    () => groupByRiskType(consolidatedRisks),
    [consolidatedRisks]
  );

  const narrativeReport = useMemo(() => {
    if (!consolidatedRisks.length) return null;
    try {
      return buildNarrativeReport(
        consolidatedRisks,
        _locationLabel,
        _sectorLabel,
        rawResponse
      );
    } catch (err) {
      if (import.meta.env.DEV)
        console.error('[useClimateAnalysis] buildNarrativeReport failed:', err);
      return null;
    }
  }, [consolidatedRisks, _locationLabel, _sectorLabel, rawResponse]);

  // Layer9 projection context — comes directly from API since Sprint 15
  const projections = useMemo(() => rawResponse?.projections ?? null, [rawResponse]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const analyze = useCallback(
    async ({ lat, lon }) => {
      setLoading(true);
      setRawResponse(null);
      setError(null);

      try {
        const result = await analyzeClimateRisk({ lat, lon, sector, asset_type: undefined, scenario: undefined, business_unit_id: businessUnitId || undefined });
        if (result) {
          setRawResponse(result);
        } else {
          setError('No se pudo obtener el análisis. Verifica la conexión con el backend.');
        }
      } catch (err) {
        setError(err.message || 'Error al ejecutar el análisis climático.');
      } finally {
        setLoading(false);
      }
    },
    [sector]
  );

  const reset = useCallback(() => {
    setRawResponse(null);
    setError(null);
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────────
  return {
    // ── Lifecycle ──────────────────────────────────────────────────────────────
    loading,
    error,
    hasResults: !!rawResponse,

    // ── Normalized data (Sprint 14+) ───────────────────────────────────────────
    consolidatedRisks,
    timelineRisks,      // ConsolidatedRiskTimeline[] — grouped by riskType (Sprint 22)
    narrativeReport,    // NarrativeReport: includes executiveSummary, periodNarratives, risks
    projections,        // Layer9: { scenarios, time_windows, projections, narratives, uncertainty }

    // ── Raw fields used by active panels ──────────────────────────────────────
    rawResponse,
    adaptations: rawResponse?.adaptations ?? null,
    metadata:    rawResponse?.metadata    ?? null,

    // ── Context (fetched once on mount) ───────────────────────────────────────
    territorialCtx,
    docContext,

    // ── Actions ────────────────────────────────────────────────────────────────
    analyze,
    reset,
  };
}
