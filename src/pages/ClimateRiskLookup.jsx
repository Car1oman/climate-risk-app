// @ts-nocheck
import { useState, useCallback } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

import MethodologyPanel    from "@/components/climate/MethodologyPanel";
import ProjectionScenarioCard from "@/components/climate/ProjectionScenarioCard";

import { SECTORS }              from "@/features/climate-lookup/constants";
import { useClimateAnalysis }   from "@/features/climate-lookup/hooks/useClimateAnalysis";
import MapView                  from "@/features/climate-lookup/components/MapView";
import SearchPanel              from "@/features/climate-lookup/components/SearchPanel";
import NarrativePanel           from "@/features/climate-lookup/components/NarrativePanel";
import SignalsPanel             from "@/features/climate-lookup/components/SignalsPanel";
import RisksPanel               from "@/features/climate-lookup/components/RisksPanel";
import GRIThreatsPanel          from "@/features/climate-lookup/components/GRIThreatsPanel";
import AdaptationPanel          from "@/features/climate-lookup/components/AdaptationPanel";
import TerritorialContextPanel  from "@/features/climate-lookup/components/TerritorialContextPanel";
import AIPanel                  from "@/features/climate-lookup/components/AIPanel";
import AnalysisLoading          from "@/features/climate-lookup/components/AnalysisLoading";

export default function ClimateRiskLookup() {
  // ── UI state only ─────────────────────────────────────────────────────────
  const [lat,       setLat]       = useState("");
  const [lng,       setLng]       = useState("");
  const [sector,    setSector]    = useState("retail");
  const [tileLayer, setTileLayer] = useState("osm");
  const [markerPos, setMarkerPos] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);

  // ── All data / async logic lives in the hook ──────────────────────────────
  const {
    loading,
    error,
    hasResults,
    consolidatedRisks,
    executiveSummary,
    projections,
    rawResponse,
    signals,
    risks,
    griHazards,
    adaptations,
    narrative,
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

  // ── Search handler ────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || latNum < -90  || latNum > 90)  { toast.error("Latitud inválida");  return; }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) { toast.error("Longitud inválida"); return; }

    setMarkerPos([latNum, lngNum]);
    setFlyTarget({ pos: [latNum, lngNum], zoom: 14 });
    await analyze({ lat: latNum, lon: lngNum });
  }, [lat, lng, analyze]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Análisis de Riesgo Climático</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecciona un punto en el mapa para analizar riesgos y proyecciones climáticas de esa zona
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <MapView
          tileLayer={tileLayer}
          onTileLayerChange={setTileLayer}
          onMapClick={handleMapClick}
          markerPos={markerPos}
          flyTarget={flyTarget}
        />

        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
          <Card>
            <CardContent className="pt-4 space-y-4">
              <SearchPanel onLocationSelect={handleLocationSelect} />

              <div className="border-t border-border/50" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lat" className="text-xs text-muted-foreground">Latitud</Label>
                  <Input
                    id="lat" type="number" step="any" placeholder="-12.0464" value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lng" className="text-xs text-muted-foreground">Longitud</Label>
                  <Input
                    id="lng" type="number" step="any" placeholder="-77.0428" value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
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
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <AlertDescription className="text-sm text-destructive">{error}</AlertDescription>
            </Alert>
          )}

          {hasResults && !loading && (
            <>
              {/* Consolidated risk preview — Sprint 14 (non-destructive) */}
              {consolidatedRisks.length > 0 && executiveSummary && (
                <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                      Resumen normalizado · {consolidatedRisks.length} riesgo{consolidatedRisks.length !== 1 ? 's' : ''} consolidado{consolidatedRisks.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">{executiveSummary}</p>
                    <div className="flex flex-wrap gap-2">
                      {consolidatedRisks.map(r => (
                        <span
                          key={r.id}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-background text-foreground"
                        >
                          {r.displayName}
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{r.period.replace('_', ' ')}</span>
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Layer9 projections */}
              <ProjectionScenarioCard
                projectionContext={projections}
                traceability={metadata}
              />

              <NarrativePanel
                narrative={narrative}
                location={rawResponse?.location}
                metadata={metadata}
              />
              <SignalsPanel    signals={signals} />
              <RisksPanel      risks={risks} />
              <GRIThreatsPanel hazards={griHazards} />
              <AdaptationPanel adaptations={adaptations} />
            </>
          )}

          <MethodologyPanel metadata={metadata} />
          <TerritorialContextPanel data={territorialCtx} />

          {hasResults && !loading && (
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="pt-4 pb-4">
                <AIPanel analysis={rawResponse} docContext={docContext} />
              </CardContent>
            </Card>
          )}

          {!hasResults && !loading && !error && (
            <div className="text-center py-12">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm font-semibold text-muted-foreground">Selecciona un punto en el mapa</p>
              <p className="text-xs mt-1 text-muted-foreground">o ingresa coordenadas para analizar los riesgos climáticos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
