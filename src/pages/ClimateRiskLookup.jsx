import { useState, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { toast } from "sonner";

// ── Leaflet icon fix for Vite ────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Risk catalogue ───────────────────────────────────────────────────────────
// Keys: lowercase, underscored. Add new entries freely — getRiskMeta does fuzzy fallback.
const RISK_CATALOGUE = {
  // ─ Inundación
  flood:          { label: "Inundación",         emoji: "🌊", impacts: ["Daño estructural al local e interrupción de operaciones (estimado 7–45 días)","Pérdida de inventario perecedero y equipos de refrigeración","Corte de acceso vial para empleados, clientes y proveedores","Costos de rehabilitación: S/ 80–200/m²"] },
  inundacion:     { label: "Inundación",         emoji: "🌊", impacts: ["Daño estructural al local e interrupción de operaciones (estimado 7–45 días)","Pérdida de inventario perecedero y equipos de refrigeración","Corte de acceso vial para empleados, clientes y proveedores","Costos de rehabilitación: S/ 80–200/m²"] },
  // ─ Calor / Temperatura
  calor_extremo:  { label: "Calor Extremo",      emoji: "🌡️", impacts: ["Riesgo de salud para empleados y clientes en pisos de ventas sin refrigeración adecuada","Incremento del 20–35% en consumo eléctrico de sistemas HVAC","Deterioro acelerado de productos perecederos y sensibles al calor","Posibles cortes eléctricos en picos de demanda regional"] },
  olas_calor:     { label: "Olas de Calor",      emoji: "🌡️", impacts: ["Riesgo de salud para empleados y clientes en pisos de ventas sin refrigeración adecuada","Incremento del 20–35% en consumo eléctrico de sistemas HVAC","Deterioro acelerado de productos perecederos y sensibles al calor","Posibles cortes eléctricos en picos de demanda regional"] },
  ola_calor:      { label: "Ola de Calor",       emoji: "🌡️", impacts: ["Riesgo de salud para empleados y clientes en pisos de ventas sin refrigeración adecuada","Incremento del 20–35% en consumo eléctrico de sistemas HVAC","Deterioro acelerado de productos perecederos y sensibles al calor","Posibles cortes eléctricos en picos de demanda regional"] },
  heatwave:       { label: "Ola de Calor",       emoji: "🌡️", impacts: ["Riesgo de salud para empleados y clientes en pisos de ventas sin refrigeración adecuada","Incremento del 20–35% en consumo eléctrico de sistemas HVAC","Deterioro acelerado de productos perecederos y sensibles al calor","Posibles cortes eléctricos en picos de demanda regional"] },
  heat:           { label: "Calor Extremo",      emoji: "🌡️", impacts: ["Riesgo de salud para empleados y clientes en pisos de ventas sin refrigeración adecuada","Incremento del 20–35% en consumo eléctrico de sistemas HVAC","Deterioro acelerado de productos perecederos y sensibles al calor","Posibles cortes eléctricos en picos de demanda regional"] },
  temperatura_media: { label: "Aumento de Temperatura", emoji: "🌡️", impacts: ["Cambio en el patrón de demanda de productos según temperatura (mayor consumo de bebidas frías, menos de abrigos)","Mayor consumo energético sostenido para climatización de instalaciones","Ajuste necesario en gestión de cadena de frío y temperaturas de almacenamiento","Impacto gradual en el bienestar y productividad del personal"] },
  // ─ Sequía
  drought:        { label: "Sequía",             emoji: "☀️", impacts: ["Escasez hídrica que afecta limpieza, cocinas y servicios higiénicos del local","Disrupciones en cadena de suministro de proveedores agrícolas","Mayor presión sobre costos energéticos de refrigeración al aumentar temperatura","Reducción de tráfico de clientes durante condiciones extremas"] },
  sequia:         { label: "Sequía",             emoji: "☀️", impacts: ["Escasez hídrica que afecta limpieza, cocinas y servicios higiénicos del local","Disrupciones en cadena de suministro de proveedores agrícolas","Mayor presión sobre costos energéticos de refrigeración al aumentar temperatura","Reducción de tráfico de clientes durante condiciones extremas"] },
  // ─ Deslizamiento
  landslide:      { label: "Deslizamiento",      emoji: "🏔️", impacts: ["Bloqueo de acceso vehicular y peatonal al local","Daño a infraestructura de transporte logístico (proveedores y distribución)","Evacuación de personal y cierre prolongado del establecimiento","Costos de limpieza, habilitación de vías y reparaciones estructurales"] },
  deslizamiento:  { label: "Deslizamiento",      emoji: "🏔️", impacts: ["Bloqueo de acceso vehicular y peatonal al local","Daño a infraestructura de transporte logístico (proveedores y distribución)","Evacuación de personal y cierre prolongado del establecimiento","Costos de limpieza, habilitación de vías y reparaciones estructurales"] },
  // ─ Ciclón / Tormenta
  cyclone:        { label: "Ciclón / Tormenta",  emoji: "🌀", impacts: ["Daño físico severo a techo, fachadas y señalización exterior","Interrupción del suministro eléctrico por varios días","Corte de la cadena de frío y pérdida de inventario perecedero","Posible inundación combinada con daños al inmueble"] },
  storm:          { label: "Tormenta",           emoji: "⛈️", impacts: ["Daño físico al edificio y equipos exteriores","Interrupción eléctrica y de conectividad","Riesgo de seguridad para empleados durante la tormenta","Impacto en logística de última milla"] },
  // ─ Precipitación
  precipitacion:  { label: "Precipitación",      emoji: "🌧️", impacts: ["Mayor riesgo de inundaciones locales y encharcamiento en zonas de carga/descarga","Deterioro de vías de acceso y aumento de accidentes","Impacto en cadena logística por retrasos de proveedores","Aumento en costos de mantenimiento de techos e impermeabilización"] },
  precipitation:  { label: "Precipitación",      emoji: "🌧️", impacts: ["Mayor riesgo de inundaciones locales y encharcamiento en zonas de carga/descarga","Deterioro de vías de acceso y aumento de accidentes","Impacto en cadena logística por retrasos de proveedores","Aumento en costos de mantenimiento de techos e impermeabilización"] },
  // ─ Riesgo climático genérico
  riesgo_climatico: { label: "Riesgo Climático", emoji: "🌍", impacts: ["Posible incremento en la frecuencia de eventos climáticos extremos","Mayor variabilidad en patrones de temperatura y precipitación que afectan planificación","Necesidad de actualizar planes de continuidad operacional y BCP","Impacto en seguros: posible aumento de primas o reducción de cobertura"] },
  climate_risk:   { label: "Riesgo Climático",   emoji: "🌍", impacts: ["Posible incremento en la frecuencia de eventos climáticos extremos","Mayor variabilidad en patrones de temperatura y precipitación que afectan planificación","Necesidad de actualizar planes de continuidad operacional y BCP","Impacto en seguros: posible aumento de primas o reducción de cobertura"] },
};

const LEVEL_ORDER = { low: 1, bajo: 1, medium: 2, medio: 2, high: 3, alto: 3, very_high: 4, muy_alto: 4, critical: 5, critico: 5 };

const LEVEL_CONFIG = {
  1: { label: "Bajo",     color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  2: { label: "Medio",    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  3: { label: "Alto",     color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  4: { label: "Muy Alto", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  5: { label: "Crítico",  color: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300" },
};

// Fuzzy lookup in catalogue
function getRiskMeta(riskType) {
  const key = (riskType || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (RISK_CATALOGUE[key]) return RISK_CATALOGUE[key];
  // Try partial match (a key word appears in the entry)
  for (const [k, v] of Object.entries(RISK_CATALOGUE)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  // Keyword hints
  if (key.includes("calor") || key.includes("heat") || key.includes("temp"))
    return RISK_CATALOGUE.calor_extremo;
  if (key.includes("inunda") || key.includes("flood")) return RISK_CATALOGUE.flood;
  if (key.includes("sequia") || key.includes("drought")) return RISK_CATALOGUE.drought;
  if (key.includes("desliz") || key.includes("landslide")) return RISK_CATALOGUE.landslide;
  if (key.includes("lluvias") || key.includes("precip") || key.includes("rain"))
    return RISK_CATALOGUE.precipitacion;
  // Generic fallback
  return {
    label: riskType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    emoji: "⚠️",
    impacts: [
      "Posibles disrupciones en las operaciones del local",
      "Impacto en la cadena de suministro y logística",
      "Necesidad de revisar plan de continuidad operacional",
      "Monitorear evolución del indicador climático",
    ],
  };
}

function levelScore(level) {
  return LEVEL_ORDER[(level || "").toLowerCase()] || 0;
}

function getLevelConfig(level) {
  const score = levelScore(level);
  return LEVEL_CONFIG[score] || { label: level, color: "bg-muted text-muted-foreground" };
}

function labelHorizon(h) {
  const lower = (h || "").toLowerCase().replace(/[_\s]/g, "");
  if (lower === "corto" || lower === "cortplazo" || lower === "short") return "Corto plazo";
  if (lower === "mediano" || lower === "medianoplazo" || lower === "mid" || lower === "medium")
    return "Mediano plazo";
  if (lower === "largo" || lower === "largoplazo" || lower === "long") return "Largo plazo";
  const year = parseInt(h);
  if (!isNaN(year) && year > 2000 && year < 2200) {
    if (year <= 2040) return `Corto plazo · ${year}`;
    if (year <= 2060) return `Mediano plazo · ${year}`;
    return `Largo plazo · ${year}`;
  }
  return h;
}

// ── Pre-analysis ─────────────────────────────────────────────────────────────
// Groups ALL records by risk_type, keeping only the peak level per horizon.
// Returns array sorted by severity (highest first).
function preAnalyzeRisks(byHorizon) {
  const allRecords = Object.values(byHorizon).flat();
  const grouped = {};

  for (const r of allRecords) {
    const key = r.risk_type;
    if (!grouped[key]) grouped[key] = { perHorizon: {}, all: [] };
    grouped[key].all.push(r);
    const h = r.horizon;
    const prev = grouped[key].perHorizon[h];
    if (!prev || levelScore(r.level) > levelScore(prev.level)) {
      grouped[key].perHorizon[h] = r;
    }
  }

  return Object.entries(grouped)
    .map(([riskType, { perHorizon, all }]) => {
      const peakLevel = all.reduce(
        (best, r) => (levelScore(r.level) > levelScore(best) ? r.level : best),
        all[0].level
      );
      const horizonEntries = Object.entries(perHorizon)
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([h, r]) => ({ horizon: h, level: r.level }));
      return {
        riskType,
        peakLevel,
        peakScore: levelScore(peakLevel),
        horizonEntries,
        meta: getRiskMeta(riskType),
      };
    })
    .sort((a, b) => b.peakScore - a.peakScore);
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

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

function RiskCard({ item }) {
  const [open, setOpen] = useState(false);
  const levelCfg = getLevelConfig(item.peakLevel);
  const showTimeline = item.horizonEntries.length > 1;

  return (
    <div className="border border-border rounded-xl overflow-hidden transition-shadow hover:shadow-sm">
      {/* Header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="text-xl flex-shrink-0" aria-hidden="true">
          {item.meta.emoji}
        </span>
        <span className="flex-1 font-medium text-sm">{item.meta.label}</span>
        <Badge className={`text-xs font-semibold px-2.5 py-0.5 ${levelCfg.color}`}>
          {levelCfg.label}
        </Badge>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground ml-1 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground ml-1 flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border bg-muted/10 px-4 pb-4 pt-3 space-y-4">
          {/* Temporal evolution */}
          {showTimeline && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Evolución temporal
              </p>
              <div className="flex flex-wrap gap-2">
                {item.horizonEntries.map(({ horizon, level }) => {
                  const cfg = getLevelConfig(level);
                  return (
                    <div
                      key={horizon}
                      className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs"
                    >
                      <span className="text-muted-foreground">{labelHorizon(horizon)}</span>
                      <span className={`font-semibold rounded px-1 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Impacts */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Posibles impactos operacionales
            </p>
            <ul className="space-y-1.5">
              {item.meta.impacts.map((impact, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                  {impact}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function AIPanel({ analyzed, queried, nearestPoint }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setText(null);
    try {
      const riskList = analyzed
        .map((item) => {
          const horizons = item.horizonEntries
            .map(({ horizon, level }) => `${labelHorizon(horizon)}: ${getLevelConfig(level).label}`)
            .join(" | ");
          return `- ${item.meta.label} [${getLevelConfig(item.peakLevel).label}]${horizons ? ` → ${horizons}` : ""}`;
        })
        .join("\n");

      const prompt = `Eres un asesor experto en riesgos climáticos para Intercorp Retail (SPSA) en Perú.

Datos del Banco Mundial para la ubicación (lat: ${queried.lat}, lng: ${queried.lng}).
Punto de datos más cercano: (${nearestPoint.lat}, ${nearestPoint.lng}) — ${nearestPoint.distanceKm} km de distancia.

Riesgos climáticos identificados:
${riskList}

Elabora un análisis ejecutivo en 4 secciones, conciso y práctico:

1. **Resumen del perfil de riesgo** (2–3 oraciones)
2. **Impactos operacionales prioritarios** (máx. 4 puntos con cifras estimadas, enfocado en retail)
3. **Acciones de adaptación inmediatas** (0–2 años, máx. 4 puntos accionables y específicos)
4. **Inversiones en resiliencia** (mediano y largo plazo, máx. 4 puntos)

Responde en español. Sé directo y específico para operaciones de supermercados y retail en Perú.`;

      const res = await fetch(`${API_URL}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error("Error al generar recomendaciones");
      const data = await res.json();
      setText(typeof data === "string" ? data : data.response || "");
    } catch (err) {
      toast.error(err.message || "Error al generar recomendaciones");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="border-t border-border" />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            Recomendaciones con IA
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Análisis de impactos y estrategias de mitigación
          </p>
        </div>
      </div>

      {!text && (
        <Button
          className="w-full gap-2"
          onClick={handleGenerate}
          disabled={loading}
          variant="default"
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analizando con IA...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generar recomendaciones
            </>
          )}
        </Button>
      )}

      {text && (
        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
            {text}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground h-7"
            onClick={() => setText(null)}
          >
            Regenerar
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClimateRiskLookup() {
  const DEFAULT_CENTER = [-12.0464, -77.0428];

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [markerPos, setMarkerPos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [analyzed, setAnalyzed] = useState(null);
  const [noData, setNoData] = useState(false);

  const handleMapClick = useCallback((clickLat, clickLng) => {
    setLat(String(clickLat));
    setLng(String(clickLng));
    setMarkerPos([clickLat, clickLng]);
    setResults(null);
    setAnalyzed(null);
    setNoData(false);
  }, []);

  const handleSearch = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      toast.error("Latitud inválida (entre -90 y 90)");
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      toast.error("Longitud inválida (entre -180 y 180)");
      return;
    }

    setLoading(true);
    setResults(null);
    setAnalyzed(null);
    setNoData(false);
    setMarkerPos([latNum, lngNum]);

    try {
      const res = await fetch(
        `${API_URL}/api/climate-risks/lookup?lat=${latNum}&lng=${lngNum}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al consultar");
      }
      const data = await res.json();
      if (!data.found) {
        setNoData(true);
      } else {
        setResults(data);
        setAnalyzed(preAnalyzeRisks(data.byHorizon));
      }
    } catch (err) {
      toast.error(err.message || "Error al consultar riesgos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consulta de Riesgos Climáticos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecciona un punto en el mapa o ingresa coordenadas para conocer los riesgos climáticos
          según datos del Banco Mundial
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ── Mapa ──────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Haz clic en el mapa para seleccionar una ubicación
          </p>
          <div className="rounded-xl overflow-hidden border border-border shadow-sm">
            <MapContainer
              center={DEFAULT_CENTER}
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
                    iconSize: [16, 26],
                    iconAnchor: [8, 26],
                    className: "opacity-50",
                  })}
                />
              )}
            </MapContainer>
          </div>
        </div>

        {/* ── Panel derecho ─────────────────────── */}
        <div className="space-y-4">

          {/* Coordinate form */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lat" className="text-xs text-muted-foreground">Latitud</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    placeholder="-12.0464"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lng" className="text-xs text-muted-foreground">Longitud</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    placeholder="-77.0428"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                </div>
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleSearch}
                disabled={loading || (!lat && !lng)}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Consultando...</>
                ) : (
                  <><Search className="w-4 h-4" />Consultar riesgos</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* No data */}
          {noData && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                No se encontraron datos para esta ubicación. Asegúrate de haber cargado un
                dataset en{" "}
                <a href="/climate-upload" className="underline">
                  Datos Climáticos
                </a>
                .
              </AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {results && analyzed && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                {/* Summary line */}
                <Alert className="border-primary/20 bg-primary/5 p-3">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <AlertDescription className="text-xs">
                    <span className="font-semibold">{analyzed.length} riesgo{analyzed.length !== 1 ? "s" : ""} identificado{analyzed.length !== 1 ? "s" : ""}</span>
                    {" "}para ({results.queried.lat}, {results.queried.lng}).{" "}
                    Punto de datos del Banco Mundial:{" "}
                    <span className="font-mono">
                      {results.nearestPoint.lat}, {results.nearestPoint.lng}
                    </span>{" "}
                    a{" "}
                    <span className="font-semibold">{results.nearestPoint.distanceKm} km</span>.
                  </AlertDescription>
                </Alert>

                <CardTitle className="text-sm text-muted-foreground font-normal mt-2 px-1">
                  Haz clic en cada riesgo para ver sus impactos
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2 pb-4">
                {/* Risk cards */}
                {analyzed.map((item) => (
                  <RiskCard key={item.riskType} item={item} />
                ))}

                {/* AI section */}
                <AIPanel
                  analyzed={analyzed}
                  queried={results.queried}
                  nearestPoint={results.nearestPoint}
                />
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!results && !noData && !loading && (
            <div className="text-center py-16 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Selecciona un punto en el mapa</p>
              <p className="text-xs mt-1 opacity-60">o ingresa coordenadas manualmente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
