import { useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/api";
import {
  Search,
  MapPin,
  Loader2,
  AlertTriangle,
  Info,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

// Fix leaflet default icon for Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ─── Constants ───────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  low:       { label: "Bajo",      color: "bg-green-100 text-green-800 border-green-200" },
  bajo:      { label: "Bajo",      color: "bg-green-100 text-green-800 border-green-200" },
  medium:    { label: "Medio",     color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  medio:     { label: "Medio",     color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  high:      { label: "Alto",      color: "bg-orange-100 text-orange-800 border-orange-200" },
  alto:      { label: "Alto",      color: "bg-orange-100 text-orange-800 border-orange-200" },
  very_high: { label: "Muy Alto",  color: "bg-red-100 text-red-800 border-red-200" },
  critical:  { label: "Crítico",   color: "bg-red-200 text-red-900 border-red-300" },
  critico:   { label: "Crítico",   color: "bg-red-200 text-red-900 border-red-300" },
};

const RISK_META = {
  flood:          { label: "Inundación",         emoji: "🌊", impacts: ["Daño estructural e interrupción de operaciones (7-45 días)", "Pérdida de inventario perecedero y equipos", "Corte de acceso vial para empleados y proveedores", "Costos de rehabilitación estimados en S/ 80-200/m²"] },
  inundacion:     { label: "Inundación",         emoji: "🌊", impacts: ["Daño estructural e interrupción de operaciones (7-45 días)", "Pérdida de inventario perecedero y equipos", "Corte de acceso vial para empleados y proveedores", "Costos de rehabilitación estimados en S/ 80-200/m²"] },
  drought:        { label: "Sequía",             emoji: "☀️", impacts: ["Escasez hídrica que afecta operaciones y limpieza", "Disrupciones en cadena de suministro agrícola", "Mayor presión sobre costos energéticos de refrigeración", "Reducción de tráfico de clientes por condiciones extremas"] },
  sequia:         { label: "Sequía",             emoji: "☀️", impacts: ["Escasez hídrica que afecta operaciones y limpieza", "Disrupciones en cadena de suministro agrícola", "Mayor presión sobre costos energéticos de refrigeración", "Reducción de tráfico de clientes por condiciones extremas"] },
  heat:           { label: "Calor Extremo",      emoji: "🌡️", impacts: ["Riesgo de salud para empleados y clientes", "Incremento del 20-35% en consumo eléctrico de HVAC", "Deterioro acelerado de perecederos sin refrigeración adecuada", "Posibles cortes energéticos en picos de demanda"] },
  heatwave:       { label: "Ola de Calor",       emoji: "🌡️", impacts: ["Riesgo de salud para empleados y clientes", "Incremento del 20-35% en consumo eléctrico de HVAC", "Deterioro acelerado de perecederos sin refrigeración adecuada", "Posibles cortes energéticos en picos de demanda"] },
  ola_calor:      { label: "Ola de Calor",       emoji: "🌡️", impacts: ["Riesgo de salud para empleados y clientes", "Incremento del 20-35% en consumo eléctrico de HVAC", "Deterioro acelerado de perecederos sin refrigeración adecuada", "Posibles cortes energéticos en picos de demanda"] },
  landslide:      { label: "Deslizamiento",      emoji: "🏔️", impacts: ["Bloqueo de acceso a instalaciones", "Daño a infraestructura de transporte logístico", "Evacuación de personal y cierre prolongado", "Costos de limpieza y habilitación de vías"] },
  deslizamiento:  { label: "Deslizamiento",      emoji: "🏔️", impacts: ["Bloqueo de acceso a instalaciones", "Daño a infraestructura de transporte logístico", "Evacuación de personal y cierre prolongado", "Costos de limpieza y habilitación de vías"] },
  cyclone:        { label: "Ciclón / Tormenta",  emoji: "🌀", impacts: ["Daño físico severo al techo y fachadas", "Interrupción de suministro eléctrico por varios días", "Corte de cadena de frío y pérdida de perecederos", "Posible inundación combinada (storm surge)"] },
  storm:          { label: "Tormenta",           emoji: "⛈️", impacts: ["Daño físico al edificio y equipos exteriores", "Interrupción eléctrica y de conectividad", "Riesgo para la seguridad de empleados", "Impacto en logística de última milla"] },
};

function getRiskMeta(riskType) {
  const key = (riskType || "").toLowerCase().replace(/[\s-]/g, "_");
  return (
    RISK_META[key] || {
      label: riskType,
      emoji: "⚠️",
      impacts: ["Posibles disrupciones operacionales", "Revisar plan de contingencia específico"],
    }
  );
}

function getHorizonLabel(horizon) {
  const year = parseInt(horizon);
  if (!isNaN(year)) {
    if (year <= 2040) return { label: "Corto plazo", sub: horizon, color: "text-blue-500" };
    if (year <= 2060) return { label: "Mediano plazo", sub: horizon, color: "text-amber-500" };
    return { label: "Largo plazo", sub: horizon, color: "text-red-500" };
  }
  return { label: horizon, sub: "", color: "text-muted-foreground" };
}

function getLevelConfig(level) {
  const key = (level || "").toLowerCase();
  return LEVEL_CONFIG[key] || { label: level, color: "bg-gray-100 text-gray-700 border-gray-200" };
}

// ─── Map subcomponents ────────────────────────────────────────────────────────

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(
        parseFloat(e.latlng.lat.toFixed(5)),
        parseFloat(e.latlng.lng.toFixed(5))
      );
    },
  });
  return null;
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function HorizonSection({ horizon, records }) {
  const [open, setOpen] = useState(true);
  const horizonInfo = getHorizonLabel(horizon);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${horizonInfo.color}`} />
          <span className="font-semibold text-sm">{horizonInfo.label}</span>
          {horizonInfo.sub && (
            <span className="text-xs text-muted-foreground">({horizonInfo.sub})</span>
          )}
          <Badge variant="secondary" className="text-xs ml-1">
            {records.length} riesgo{records.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="divide-y divide-border">
          {records.map((record, i) => {
            const meta = getRiskMeta(record.risk_type);
            const levelCfg = getLevelConfig(record.level);
            return (
              <div key={i} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">{meta.emoji}</span>
                    <span className="font-medium text-sm">{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.value != null && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {(record.value * 100).toFixed(0)}%
                      </span>
                    )}
                    <Badge className={`text-xs border ${levelCfg.color}`}>
                      {levelCfg.label}
                    </Badge>
                  </div>
                </div>

                {record.value != null && (
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-primary/70"
                      style={{ width: `${Math.min(100, record.value * 100)}%` }}
                    />
                  </div>
                )}

                <ul className="space-y-1 mt-2">
                  {meta.impacts.map((impact, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="mt-0.5 text-primary/60 flex-shrink-0">•</span>
                      {impact}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AIPanel({ results }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setText(null);
    try {
      const riskSummary = results.horizons
        .map((h) => {
          const hInfo = getHorizonLabel(h);
          const items = results.byHorizon[h]
            .map((r) => `  - ${getRiskMeta(r.risk_type).label}: nivel ${r.level}${r.value != null ? ` (${(r.value * 100).toFixed(0)}%)` : ""}`)
            .join("\n");
          return `${hInfo.label} (${h}):\n${items}`;
        })
        .join("\n\n");

      const prompt = `Eres un asesor experto en riesgos climáticos para Intercorp Retail (SPSA) en Perú.

Datos del Banco Mundial para la ubicación (lat: ${results.queried.lat}, lng: ${results.queried.lng}):
Punto de datos más cercano: (${results.nearestPoint.lat}, ${results.nearestPoint.lng}), a ${results.nearestPoint.distanceKm} km

Riesgos identificados:
${riskSummary}

Proporciona un análisis de 4 secciones, conciso y práctico para un gestor de riesgos de retail:

1. **Resumen del perfil de riesgo** (2-3 oraciones)
2. **Impactos operacionales prioritarios** (máx. 4 puntos con cifras estimadas)
3. **Acciones de adaptación inmediatas** (0-2 años, máx. 4 puntos accionables)
4. **Inversiones en resiliencia a mediano y largo plazo** (máx. 4 puntos)

Responde en español. Sé directo y específico para el sector retail en Perú.`;

      const res = await fetch(`${API_URL}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error("Error al generar recomendaciones");

      const data = await res.json();
      setText(typeof data === "string" ? data : data.response || JSON.stringify(data));
    } catch (err) {
      toast.error(err.message || "Error al generar recomendaciones");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Recomendaciones IA
        </CardTitle>
        <CardDescription>
          Análisis de impactos y estrategias de mitigación generadas por inteligencia artificial
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!text && (
          <Button
            className="w-full gap-2"
            onClick={handleGenerate}
            disabled={loading}
            variant="outline"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analizando riesgos...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generar recomendaciones con IA
              </>
            )}
          </Button>
        )}

        {text && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap border border-border text-foreground/85">
              {text}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setText(null); }}
              className="text-xs text-muted-foreground"
            >
              Regenerar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClimateRiskLookup() {
  const DEFAULT_LAT = -12.0464;
  const DEFAULT_LNG = -77.0428;

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [markerPos, setMarkerPos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [noData, setNoData] = useState(false);

  const handleMapClick = useCallback((clickLat, clickLng) => {
    setLat(String(clickLat));
    setLng(String(clickLng));
    setMarkerPos([clickLat, clickLng]);
    setResults(null);
    setNoData(false);
  }, []);

  const handleSearch = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      toast.error("Latitud inválida (debe ser entre -90 y 90)");
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      toast.error("Longitud inválida (debe ser entre -180 y 180)");
      return;
    }

    setLoading(true);
    setResults(null);
    setNoData(false);
    setMarkerPos([latNum, lngNum]);

    try {
      const res = await fetch(
        `${API_URL}/api/climate-risks/lookup?lat=${latNum}&lng=${lngNum}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al consultar riesgos");
      }
      const data = await res.json();

      if (!data.found) {
        setNoData(true);
        toast.warning("No se encontraron datos climáticos para esta zona");
      } else {
        setResults(data);
      }
    } catch (err) {
      toast.error(err.message || "Error al consultar riesgos");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consulta de Riesgos Climáticos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Ingresa coordenadas o selecciona un punto en el mapa para ver los riesgos según datos del Banco Mundial
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ── Map ─────────────────────────────────── */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Haz clic en el mapa para seleccionar una ubicación
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <MapContainer
              center={[DEFAULT_LAT, DEFAULT_LNG]}
              zoom={7}
              style={{ height: "480px", width: "100%" }}
              className="z-0"
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com">CARTO</a>'
              />
              <MapClickHandler onMapClick={handleMapClick} />
              {markerPos && <Marker position={markerPos} />}
              {results?.nearestPoint && (
                <Marker
                  position={[results.nearestPoint.lat, results.nearestPoint.lng]}
                  icon={L.icon({
                    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
                    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
                    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
                    iconSize: [20, 32],
                    iconAnchor: [10, 32],
                    className: "opacity-60",
                  })}
                />
              )}
            </MapContainer>
          </CardContent>
        </Card>

        {/* ── Form + Results ──────────────────────── */}
        <div className="space-y-4 overflow-y-auto max-h-[600px] pr-1">
          {/* Coordinate input */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="w-4 h-4" />
                Coordenadas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="lat" className="text-xs">Latitud</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    placeholder="-12.0464"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lng" className="text-xs">Longitud</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    placeholder="-77.0428"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="text-sm"
                  />
                </div>
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleSearch}
                disabled={loading || (!lat && !lng)}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Consultando...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Consultar riesgos
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* No data message */}
          {noData && (
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                No se encontraron datos climáticos para esta ubicación. Asegúrate de haber cargado
                un dataset del Banco Mundial en{" "}
                <a href="/climate-upload" className="underline text-primary">
                  Datos Climáticos
                </a>
                .
              </AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {results && (
            <>
              {/* Nearest point info */}
              <Alert className="border-primary/20 bg-primary/5">
                <Info className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Punto de datos más cercano:{" "}
                  <span className="font-mono">
                    {results.nearestPoint.lat}, {results.nearestPoint.lng}
                  </span>{" "}
                  — a{" "}
                  <span className="font-semibold">
                    {results.nearestPoint.distanceKm} km
                  </span>{" "}
                  de la ubicación consultada.{" "}
                  <span className="text-muted-foreground">
                    ({results.totalRecords} registro{results.totalRecords !== 1 ? "s" : ""} en {results.horizons.length} horizonte{results.horizons.length !== 1 ? "s" : ""})
                  </span>
                </AlertDescription>
              </Alert>

              {/* Risk sections by horizon */}
              <div className="space-y-3">
                {results.horizons.map((h) => (
                  <HorizonSection
                    key={h}
                    horizon={h}
                    records={results.byHorizon[h]}
                  />
                ))}
              </div>

              {/* AI recommendations */}
              <AIPanel results={results} />
            </>
          )}

          {/* Empty state */}
          {!results && !noData && !loading && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>Selecciona un punto en el mapa</p>
              <p className="text-xs mt-1 opacity-70">o ingresa coordenadas manualmente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
