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

import { SECTORS, BUSINESS_UNITS } from "@/features/climate-lookup/constants";
import SearchPanel     from "@/features/climate-lookup/components/SearchPanel";
import AnalysisLoading from "@/features/climate-lookup/components/AnalysisLoading";

import { useClimateAnalysisV2 } from "@/features/climate-lookup-v2/hooks/useClimateAnalysisV2";
import RiskSummaryV2        from "@/features/climate-lookup-v2/components/RiskSummaryV2";
import PhenomenaGridV2      from "@/features/climate-lookup-v2/components/PhenomenaGridV2";
import RecommendationsListV2 from "@/features/climate-lookup-v2/components/RecommendationsListV2";
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
 * sistema actual. El pipeline v2 aún no modela horizontes temporales,
 * escenarios ni acciones de adaptación — por eso no hay tabs de período ni
 * panel de adaptación: esa ausencia es en sí misma parte de la comparación.
 */
export default function ClimateRiskLookupV2() {
  const [lat,          setLat]          = useState("");
  const [lng,          setLng]          = useState("");
  const [sector,       setSector]       = useState("retail");
  const [businessUnit, setBusinessUnit] = useState("none");
  const [tileLayer,    setTileLayer]    = useState("osm");
  const [markerPos,    setMarkerPos]    = useState(null);
  const [flyTarget,    setFlyTarget]    = useState(null);

  const {
    loading, error, hasResults, view, response,
    trace, traceLoading, traceError,
    analyze, switchView, fetchTrace, reset,
  } = useClimateAnalysisV2();

  const handleBusinessUnitChange = useCallback((value) => {
    setBusinessUnit(value);
    if (value === "none") return;
    const found = BUSINESS_UNITS.find(bu => bu.id === value);
    if (found && found.sectorSugerido) {
      setSector(found.sectorSugerido);
    }
  }, []);

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
    await analyze({ lat: latNum, lon: lngNum, sector, view: "executive" });
  }, [lat, lng, sector, analyze]);

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

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Unidad de negocio <span className="text-[10px] text-muted-foreground/60">(opcional — solo ajusta el sector sugerido)</span>
                </Label>
                <Select value={businessUnit} onValueChange={handleBusinessUnitChange}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Ninguna (sector genérico)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguna (sector genérico)</SelectItem>
                    {BUSINESS_UNITS.map(bu => (
                      <SelectItem key={bu.id} value={bu.id}>
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{bu.plataforma}</span>
                          <span>{bu.label}</span>
                        </span>
                      </SelectItem>
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
              <PhenomenaGridV2 phenomena={response?.phenomena} />
              <RecommendationsListV2 recommendations={response?.recommendations} />

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
