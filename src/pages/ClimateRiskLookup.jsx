// @ts-nocheck
import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, MapPin, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { SECTORS }              from "@/features/climate-lookup/constants";
import { useClimateAnalysis }   from "@/features/climate-lookup/hooks/useClimateAnalysis";
import SearchPanel              from "@/features/climate-lookup/components/SearchPanel";
import AnalysisLoading          from "@/features/climate-lookup/components/AnalysisLoading";
import ExecutiveSummaryCard     from "@/features/climate-lookup/components/ExecutiveSummaryCard";
import RiskTimeline             from "@/features/climate-lookup/components/RiskTimeline";
import RiskPeriodTabs           from "@/features/climate-lookup/components/RiskPeriodTabs";

// Lazy-loaded heavy/deferred chunks — Vite splits these into separate bundles
const MapView          = lazy(() => import("@/features/climate-lookup/components/MapView"));
const AdaptationPanel  = lazy(() => import("@/features/climate-lookup/components/AdaptationPanel"));
const ScientificFooter = lazy(() => import("@/features/climate-lookup/components/ScientificFooter"));

// ─── Empty states ──────────────────────────────────────────────────────────────

function EmptyNoRisks() {
  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-5 py-8 text-center space-y-2">
      <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500" aria-hidden="true" />
      <p className="text-sm font-semibold text-foreground">Zona de bajo riesgo climático</p>
      <p className="text-xs text-muted-foreground max-w-xs mx-auto">
        No se identificaron fenómenos climáticos relevantes para esta ubicación y sector.
      </p>
    </div>
  );
}

function EmptyInitial() {
  return (
    <div className="text-center py-12 space-y-2">
      <MapPin className="w-8 h-8 mx-auto text-muted-foreground/30" aria-hidden="true" />
      <p className="text-sm font-semibold text-muted-foreground">Selecciona un punto en el mapa</p>
      <p className="text-xs text-muted-foreground">
        o ingresa coordenadas para analizar los riesgos climáticos
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClimateRiskLookup() {
  // ── UI state only ─────────────────────────────────────────────────────────
  const [lat,            setLat]            = useState("");
  const [lng,            setLng]            = useState("");
  const [sector,         setSector]         = useState("retail");
  const [tileLayer,      setTileLayer]      = useState("osm");
  const [markerPos,      setMarkerPos]      = useState(null);
  const [flyTarget,      setFlyTarget]      = useState(null);
  // Shared temporal period — null until RiskPeriodTabs resolves first available from data
  const [selectedPeriod,  setSelectedPeriod]  = useState(null);
  // Shared emission scenario — drives RiskTimeline + RiskPeriodTabs + ExecutiveSummaryCard
  const [activeScenario,  setActiveScenario]  = useState("emisiones_moderadas");

  // ── All data / async logic lives in the hook ──────────────────────────────
  const {
    loading,
    error,
    hasResults,
    consolidatedRisks,
    timelineRisks,
    narrativeReport,
    projections,
    rawResponse,
    metadata,
    territorialCtx,
    docContext,
    analyze,
    reset,
  } = useClimateAnalysis(sector);

  // ── Map event handlers ────────────────────────────────────────────────────
  const handleMapClick = useCallback((clickLat, clickLng) => {
    setLat(String(clickLat));
    setLng(String(clickLng));
    setMarkerPos([clickLat, clickLng]);
    reset();
  }, [reset]);

  const handleLocationSelect = useCallback((newLat, newLng) => {
    if (!isFinite(newLat) || !isFinite(newLng)) return;
    setLat(String(newLat));
    setLng(String(newLng));
    setMarkerPos([newLat, newLng]);
    setFlyTarget({ pos: [newLat, newLng], zoom: 16 });
    reset();
  }, [reset]);

  const handleSearch = useCallback(async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || latNum < -90  || latNum > 90)  { toast.error("Latitud inválida");  return; }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) { toast.error("Longitud inválida"); return; }
    setMarkerPos([latNum, lngNum]);
    setFlyTarget({ pos: [latNum, lngNum], zoom: 14 });
    setActiveScenario("emisiones_moderadas");
    await analyze({ lat: latNum, lon: lngNum });
  }, [lat, lng, analyze]);

  // ── Period-grouped risks (memoized) ───────────────────────────────────────
  const historicalRisks = useMemo(
    () => consolidatedRisks.filter(r => r.period === 'historico'),
    [consolidatedRisks]
  );
  const shortTermRisks = useMemo(
    () => consolidatedRisks.filter(r => r.period === 'corto_plazo'),
    [consolidatedRisks]
  );
  const midTermRisks = useMemo(
    () => consolidatedRisks.filter(r => r.period === 'mediano_plazo'),
    [consolidatedRisks]
  );
  const longTermRisks = useMemo(
    () => consolidatedRisks.filter(r => r.period === 'largo_plazo'),
    [consolidatedRisks]
  );

  const hasRisks = consolidatedRisks.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Análisis de Riesgo Climático</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecciona un punto en el mapa para analizar riesgos y proyecciones climáticas
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Suspense fallback={<div className="rounded-xl bg-secondary/30 animate-pulse" style={{ height: '420px' }} aria-hidden="true" />}>
          <MapView
            tileLayer={tileLayer}
            onTileLayerChange={setTileLayer}
            onMapClick={handleMapClick}
            markerPos={markerPos}
            flyTarget={flyTarget}
          />
        </Suspense>

        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
          {/* Search / coordinates form */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <SearchPanel onLocationSelect={handleLocationSelect} />

              <div className="border-t border-border/50" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lat" className="text-xs text-muted-foreground">Latitud</Label>
                  <Input
                    id="lat" type="number" step="any" placeholder="-12.0464" value={lat}
                    onChange={e => setLat(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lng" className="text-xs text-muted-foreground">Longitud</Label>
                  <Input
                    id="lng" type="number" step="any" placeholder="-77.0428" value={lng}
                    onChange={e => setLng(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Sector operacional</Label>
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Seleccionar sector..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTORS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleSearch}
                disabled={loading || (!lat && !lng)}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Analizando...</>
                  : <><Search  className="w-4 h-4" />Analizar riesgos</>}
              </Button>
            </CardContent>
          </Card>

          {loading && <AnalysisLoading />}

          {error && !loading && (
            <Alert className="border-destructive bg-destructive/10">
              <AlertTriangle className="w-4 h-4 text-destructive" aria-hidden="true" />
              <AlertDescription className="text-sm text-destructive">{error}</AlertDescription>
            </Alert>
          )}

          {hasResults && !loading && (
            <div className="space-y-5">
              {/* 1 — Executive briefing (hero — period + scenario aware) */}
              <ExecutiveSummaryCard
                narrativeReport={narrativeReport}
                consolidatedRisks={consolidatedRisks}
                selectedPeriod={selectedPeriod}
                activeScenario={activeScenario}
              />

              {hasRisks ? (
                <>
                  {/* 2 — Temporal evolution — driven by groupByRiskType() timeline model */}
                  <RiskTimeline
                    timelineRisks={timelineRisks}
                    activeScenario={activeScenario}
                  />

                  {/* 3 — Period detail — tabbed: Histórico | Corto | Mediano | Largo plazo */}
                  <RiskPeriodTabs
                    historicalRisks={historicalRisks}
                    shortTermRisks={shortTermRisks}
                    midTermRisks={midTermRisks}
                    longTermRisks={longTermRisks}
                    narrativeReport={narrativeReport}
                    projections={projections}
                    selectedPeriod={selectedPeriod}
                    onPeriodChange={setSelectedPeriod}
                    activeScenario={activeScenario}
                    onScenarioChange={setActiveScenario}
                  />

                  {/* 4 — Priority adaptation actions (period-aware) */}
                  <Suspense fallback={null}>
                    <AdaptationPanel
                      consolidatedRisks={consolidatedRisks}
                      selectedPeriod={selectedPeriod}
                    />
                  </Suspense>
                </>
              ) : (
                /* No risks identified */
                <EmptyNoRisks />
              )}

              {/* 5 — Scientific detail (collapsed by default) */}
              <Suspense fallback={null}>
                <ScientificFooter
                  metadata={metadata}
                  territorialCtx={territorialCtx}
                  rawResponse={rawResponse}
                  docContext={docContext}
                />
              </Suspense>
            </div>
          )}

          {!hasResults && !loading && !error && <EmptyInitial />}
        </div>
      </div>
    </div>
  );
}
