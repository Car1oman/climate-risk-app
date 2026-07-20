import { useState, useCallback, lazy, Suspense } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FlaskConical, Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

import { SECTORS_V2, SCENARIOS_V2 } from "@/features/climate-lookup-v2/constants";
import SearchPanel     from "@/features/climate-lookup/components/SearchPanel";
import AnalysisLoading from "@/features/climate-lookup/components/AnalysisLoading";

import { useClimateAnalysisV2 } from "@/features/climate-lookup-v2/hooks/useClimateAnalysisV2";
import RiskSummaryV2        from "@/features/climate-lookup-v2/components/RiskSummaryV2";
import PhenomenaGridV2      from "@/features/climate-lookup-v2/components/PhenomenaGridV2";
import RecommendationsListV2 from "@/features/climate-lookup-v2/components/RecommendationsListV2";
import AIRecommendationsPanelV2 from "@/features/climate-lookup-v2/components/AIRecommendationsPanelV2";
import TracePanelV2         from "@/features/climate-lookup-v2/components/TracePanelV2";

const MapView = lazy(() => import("@/features/climate-lookup/components/MapView"));

function EmptyInitial() {
  return (
    <div className="text-center py-12 space-y-2">
      <MapPin className="w-8 h-8 mx-auto text-muted-foreground/30" aria-hidden="true" />
      <p className="text-sm font-semibold text-muted-foreground">Selecciona un punto en el mapa</p>
      <p className="text-xs text-muted-foreground">
        o ingresa coordenadas para analizar los riesgos climáticos con el pipeline v2
      </p>
    </div>
  );
}

/**
 * ClimateRiskLookupV2 — mismo flujo de búsqueda que ClimateRiskLookup.jsx,
 * pero consumiendo el pipeline nuevo (/api/v2/climate-risk) en vez del
 * sistema actual.
 *
 * Escenario y periodos: el backend distingue escenario (ssp245/ssp585) y
 * horizonte (corto/mediano) SOLO para las señales que provienen de
 * supabase_climate_cells (temperatura máxima y precipitación proyectadas —
 * ver 03-normalization/index.js) — las proyecciones de openmeteo_cmip6 no
 * tienen dimensión de escenario en su fuente y siguen sin ella aquí (no se
 * fabrica). Por eso alternar el toggle cambia resultados reales para
 * ola_de_calor/ola_de_frio/sequia/inundacion, pero no para fenómenos cuya
 * única evidencia disponible en esta ejecución venga de openmeteo_cmip6 —
 * esa limitación se declara en la tarjeta correspondiente, no se oculta.
 */
export default function ClimateRiskLookupV2() {
  const [lat,          setLat]          = useState("");
  const [lng,          setLng]          = useState("");
  const [sector,       setSector]       = useState("retail");
  const [scenario,     setScenario]     = useState("ssp245");
  const [tileLayer,    setTileLayer]    = useState("osm");
  const [markerPos,    setMarkerPos]    = useState(null);
  const [flyTarget,    setFlyTarget]    = useState(null);

  const {
    loading, error, hasResults, view, response,
    trace, traceLoading, traceError,
    analyze, switchView, fetchTrace, reset,
  } = useClimateAnalysisV2();

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

  const runAnalysis = useCallback(async (overrides = {}) => {
    const latNum = parseFloat(overrides.lat ?? lat);
    const lngNum = parseFloat(overrides.lng ?? lng);
    if (isNaN(latNum) || latNum < -90  || latNum > 90)  { toast.error("Latitud inválida");  return; }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) { toast.error("Longitud inválida"); return; }
    await analyze({
      lat: latNum,
      lon: lngNum,
      sector: overrides.sector ?? sector,
      scenario: overrides.scenario ?? scenario,
      view: "executive",
    });
  }, [lat, lng, sector, scenario, analyze]);

  const handleSearch = useCallback(async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || latNum < -90  || latNum > 90)  { toast.error("Latitud inválida");  return; }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) { toast.error("Longitud inválida"); return; }
    setMarkerPos([latNum, lngNum]);
    setFlyTarget({ pos: [latNum, lngNum], zoom: 14 });
    await runAnalysis();
  }, [lat, lng, runAnalysis]);

  // Cambiar el escenario debe actualizar realmente los datos mostrados, no
  // solo una etiqueta — se re-ejecuta la consulta completa contra el
  // backend (mismo lat/lon/sector, nuevo scenario) en vez de transformar la
  // respuesta anterior en el cliente. Solo si ya hay una ubicación
  // consultada — cambiar el toggle antes de buscar no dispara nada.
  const handleScenarioChange = useCallback((nextScenario) => {
    setScenario(nextScenario);
    if (hasResults && lat && lng) {
      runAnalysis({ scenario: nextScenario });
    }
  }, [hasResults, lat, lng, runAnalysis]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Análisis de Riesgo Climático</h1>
            <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
              <FlaskConical className="w-3 h-3" aria-hidden="true" />
              Pipeline v2 (beta)
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Misma búsqueda que "Consulta de Riesgos", consumiendo /api/v2/climate-risk — 7 etapas desacopladas y trazables.
          </p>
        </div>
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
          <Card>
            <CardContent className="pt-4 space-y-4">
              <SearchPanel onLocationSelect={handleLocationSelect} />

              <div className="border-t border-border/50" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lat-v2" className="text-xs text-muted-foreground">Latitud</Label>
                  <Input
                    id="lat-v2" type="number" step="any" placeholder="-12.0464" value={lat}
                    onChange={e => setLat(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lng-v2" className="text-xs text-muted-foreground">Longitud</Label>
                  <Input
                    id="lng-v2" type="number" step="any" placeholder="-77.0428" value={lng}
                    onChange={e => setLng(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Sector operacional <span className="text-[10px] text-muted-foreground/60">(determina medidas de adaptación y sensibilidad)</span>
                </Label>
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Seleccionar sector..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTORS_V2.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Escenario climático</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {SCENARIOS_V2.map(s => (
                    <Button
                      key={s.value}
                      type="button"
                      size="sm"
                      variant={scenario === s.value ? "default" : "outline"}
                      className="h-9 text-xs"
                      onClick={() => handleScenarioChange(s.value)}
                      disabled={loading}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleSearch}
                disabled={loading || (!lat && !lng)}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Analizando...</>
                  : <><Search  className="w-4 h-4" />Analizar riesgos (v2)</>}
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
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  size="sm"
                  variant={view === "executive" ? "default" : "outline"}
                  onClick={() => switchView("executive")}
                  className="h-7 text-xs"
                >
                  Ejecutivo
                </Button>
                <Button
                  size="sm"
                  variant={view === "analyst" ? "default" : "outline"}
                  onClick={() => switchView("analyst")}
                  className="h-7 text-xs"
                >
                  Analista
                </Button>
              </div>

              <RiskSummaryV2 response={response} />
              <PhenomenaGridV2 phenomena={response?.phenomena} phenomenaNotDetected={response?.phenomena_not_detected} />
              <RecommendationsListV2 recommendations={response?.recommendations} />
              <AIRecommendationsPanelV2 response={response} sector={sector} />

              <TracePanelV2
                traceId={response?.trace_id}
                trace={trace}
                traceLoading={traceLoading}
                traceError={traceError}
                onFetchTrace={fetchTrace}
              />
            </div>
          )}

          {!hasResults && !loading && !error && <EmptyInitial />}
        </div>
      </div>
    </div>
  );
}
