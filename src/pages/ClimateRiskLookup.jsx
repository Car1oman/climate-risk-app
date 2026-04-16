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
  Search, MapPin, Loader2, AlertTriangle, Info,
  Sparkles, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { toast } from "sonner";

// ── Leaflet icon fix ──────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Constantes de dominio ────────────────────────────────────────────────────

const RISK_GROUPS = {
  calor: {
    id: "calor",
    label: "Riesgo de Calor",
    emoji: "🌡️",
    variables: ["calor_extremo", "temperatura_maxima", "temperatura_media", "noches_calurosas", "mortalidad_calor"],
    impacts: [
      "Mayor consumo energético para climatización (+20–35%), impacto directo en costos operativos del local",
      "Riesgo de salud laboral para empleados en zonas sin climatización adecuada (merma de productividad 8–12%)",
      "Deterioro acelerado de productos perecederos y sensibles al calor (aumento de mermas 3–7%)",
      "Posible reducción de tráfico de clientes durante olas de calor extremo (hasta –10% en ventas diarias)",
    ],
  },
  hidrico: {
    id: "hidrico",
    label: "Riesgo Hídrico",
    emoji: "🌧️",
    variables: ["inundacion", "precipitacion_extrema", "precipitacion_media", "cambio_precipitacion"],
    impacts: [
      "Inundaciones que interrumpen operaciones por 7–45 días según severidad (daños estructurales S/ 80–200/m²)",
      "Corte de acceso logístico (proveedores, distribución) ante lluvias extremas o desborde de ríos",
      "Pérdida de inventario por daños por agua en almacenes y pisos de venta bajos",
      "Mayor variabilidad en cadena de suministro por disrupciones en zonas proveedoras",
    ],
  },
};

const VARIABLE_META = {
  calor_extremo:         { label: "Temp. máx. extrema",      desc: "Temperatura máxima diaria más alta del año" },
  temperatura_maxima:    { label: "Temp. máx. media anual",   desc: "Promedio anual de temperaturas máximas diarias" },
  temperatura_media:     { label: "Temperatura media",        desc: "Temperatura promedio anual" },
  noches_calurosas:      { label: "Noches cálidas",           desc: "Días/año con temperatura nocturna sobre umbral de calor" },
  mortalidad_calor:      { label: "Índice mortalidad calor",  desc: "Riesgo relativo de mortalidad por calor extremo" },
  inundacion:            { label: "Días de inundación",       desc: "Días al año con inundación en la zona" },
  precipitacion_extrema: { label: "Precipitación extrema",    desc: "Precipitación máxima en evento de 24 h" },
  precipitacion_media:   { label: "Precipitación media",      desc: "Precipitación media diaria anual" },
  cambio_precipitacion:  { label: "Cambio precipitación",     desc: "Cambio porcentual vs línea base histórica (1985–2014)" },
};

const HORIZON_INFO = {
  historico: { label: "Situación Actual",  period: "1985–2014", ringColor: "ring-slate-400/40",  textColor: "text-slate-400",  bg: "bg-slate-500/10" },
  corto:     { label: "Corto Plazo",       period: "~2030–2040", ringColor: "ring-blue-400/40",   textColor: "text-blue-400",   bg: "bg-blue-500/10" },
  mediano:   { label: "Mediano Plazo",     period: "~2050–2060", ringColor: "ring-amber-400/40",  textColor: "text-amber-400",  bg: "bg-amber-500/10" },
};

const TILE_LAYERS = {
  osm: {
    label: "Calles",
    icon: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  topo: {
    label: "Topográfico",
    icon: "🌄",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
  },
  satellite: {
    label: "Satélite",
    icon: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
  },
};

const LEVEL_CONFIG = {
  bajo:  { label: "Baja exposición",     color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500", score: 1 },
  medio: { label: "Exposición moderada", color: "bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300",  dot: "bg-amber-500",   score: 2 },
  alto:  { label: "Alta exposición",     color: "bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300",    dot: "bg-red-500",     score: 3 },
};

function getLevelCfg(level) {
  return LEVEL_CONFIG[(level || "").toLowerCase()] || {
    label: level, color: "bg-muted text-muted-foreground", dot: "bg-muted-foreground", score: 0,
  };
}

function getGroupForVariable(riskType) {
  for (const [key, g] of Object.entries(RISK_GROUPS)) {
    if (g.variables.includes(riskType)) return key;
  }
  return null;
}

// Calcula tendencia respecto al histórico (para valores numéricos)
function trend(current, base) {
  if (base == null || current == null || base === 0) return null;
  const delta = current - base;
  const pct = ((delta / Math.abs(base)) * 100).toFixed(1);
  return { delta: parseFloat(delta.toFixed(3)), pct: parseFloat(pct) };
}

// Agrupa registros de un horizonte en los 2 grupos temáticos con nivel headline
function buildGroups(horizonRecords, baseline) {
  const grouped = { calor: [], hidrico: [] };
  for (const r of horizonRecords) {
    const g = getGroupForVariable(r.risk_type);
    if (g) grouped[g].push(r);
  }

  return Object.entries(grouped).map(([groupId, records]) => {
    const group = RISK_GROUPS[groupId];
    // Headline = nivel más alto del grupo
    const headlineScore = records.reduce((m, r) => Math.max(m, getLevelCfg(r.level).score), 0);
    const headlineLevel = Object.keys(LEVEL_CONFIG).find(
      (k) => LEVEL_CONFIG[k].score === headlineScore
    ) || "bajo";

    // Enriquecer con baseline
    const enriched = records.map((r) => ({
      ...r,
      baseline: baseline[r.risk_type] || null,
      varMeta: VARIABLE_META[r.risk_type] || { label: r.risk_type, desc: "" },
    }));

    return { groupId, group, headlineLevel, records: enriched };
  }).filter((g) => g.records.length > 0);
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

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

function ScenarioSelector({ value, onChange, disabled }) {
  const opts = [
    { id: "actual",    icon: "📍", label: "Actual",    sub: "Histórico 1985–2014" },
    { id: "moderado",  icon: "🟡", label: "Moderado",  sub: "SSP2-4.5 · emisiones mod." },
    { id: "pesimista", icon: "🔴", label: "Pesimista", sub: "SSP5-8.5 · altas emisiones" },
  ];
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Escenario climático</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {opts.map((o) => (
          <button
            key={o.id}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={`rounded-xl border px-2 py-2.5 text-left transition-all ${
              value === o.id
                ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                : "border-border hover:bg-muted/40"
            } disabled:opacity-40`}
          >
            <div className="flex items-center gap-1 text-xs font-medium">
              <span>{o.icon}</span>
              <span>{o.label}</span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{o.sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function VariableRow({ record }) {
  const levelCfg = getLevelCfg(record.level);
  const t = record.baseline ? trend(record.value, record.baseline.value) : null;

  const TrendIcon =
    t == null ? null
    : t.delta > 0 ? TrendingUp
    : t.delta < 0 ? TrendingDown
    : Minus;
  const trendColor =
    t == null ? ""
    : t.delta > 0 ? "text-red-400"
    : "text-emerald-400";

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${levelCfg.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium">{record.varMeta.label}</span>
          <Badge className={`text-[10px] px-1.5 py-0 ${levelCfg.color}`}>{levelCfg.label}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{record.varMeta.desc}</p>
      </div>
      <div className="text-right flex-shrink-0 space-y-0.5">
        {record.value != null && (
          <div className="text-xs font-mono text-foreground/80">
            {record.value % 1 === 0 ? record.value : record.value.toFixed(2)} {record.unit}
          </div>
        )}
        {t && TrendIcon && (
          <div className={`flex items-center justify-end gap-0.5 text-[10px] ${trendColor}`}>
            <TrendIcon className="w-2.5 h-2.5" />
            {t.delta > 0 ? "+" : ""}{t.delta % 1 === 0 ? t.delta : t.delta.toFixed(2)} {record.unit}
          </div>
        )}
        {record.baseline && (
          <div className="text-[10px] text-muted-foreground/60">
            base: {record.baseline.value % 1 === 0 ? record.baseline.value : record.baseline.value?.toFixed(2)} {record.unit}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupCard({ groupData }) {
  const [open, setOpen] = useState(false);
  const { group, headlineLevel, records } = groupData;
  const levelCfg = getLevelCfg(headlineLevel);

  return (
    <div className="border border-border rounded-xl overflow-hidden transition-shadow hover:shadow-sm">
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="text-xl flex-shrink-0">{group.emoji}</span>
        <span className="flex-1 text-sm font-semibold">{group.label}</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${levelCfg.dot}`} />
          <Badge className={`text-xs font-medium px-2.5 py-0.5 border-0 ${levelCfg.color}`}>
            {levelCfg.label}
          </Badge>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground ml-1 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground ml-1 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border bg-muted/5 px-4 py-3 space-y-4">
          {/* Indicadores técnicos */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Indicadores técnicos
            </p>
            <div className="space-y-0">
              {records.map((r) => (
                <VariableRow key={r.risk_type} record={r} />
              ))}
            </div>
          </div>

          {/* Impactos */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Impactos operacionales en retail
            </p>
            <ul className="space-y-1.5">
              {group.impacts.map((imp, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/75">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${levelCfg.dot}`} />
                  {imp}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function HorizonSection({ horizon, records, baseline }) {
  const hInfo = HORIZON_INFO[horizon] || {
    label: horizon, period: "", ringColor: "ring-border", textColor: "text-muted-foreground", bg: "bg-muted/10",
  };
  const groups = buildGroups(records, baseline);

  return (
    <div className={`rounded-xl ring-1 ${hInfo.ringColor} overflow-hidden`}>
      <div className={`${hInfo.bg} px-4 py-2.5 flex items-center gap-2`}>
        <span className={`text-sm font-bold ${hInfo.textColor}`}>{hInfo.label}</span>
        {hInfo.period && (
          <span className="text-xs text-muted-foreground">{hInfo.period}</span>
        )}
      </div>
      <div className="p-3 space-y-2 bg-card">
        {groups.map((g) => (
          <GroupCard key={g.groupId} groupData={g} />
        ))}
      </div>
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
      const lines = results.horizons.flatMap((h) => {
        const hInfo = HORIZON_INFO[h] || { label: h, period: "" };
        return results.byHorizon[h].map(
          (r) => `  - ${VARIABLE_META[r.risk_type]?.label || r.risk_type}: ${r.value} ${r.unit} [${r.level}]`
        ).concat([`  Horizonte: ${hInfo.label} ${hInfo.period}`]);
      });

      const prompt = `Eres asesor experto en riesgos climáticos para Intercorp Retail (SPSA) en Perú.

Ubicación consultada: lat ${results.queried.lat}, lng ${results.queried.lng}
Punto de datos (Banco Mundial CCKP): ${results.nearestPoint.lat}, ${results.nearestPoint.lng} (${results.nearestPoint.distanceKm} km)
Escenario: ${results.scenarioMeta?.label} — ${results.scenarioMeta?.sublabel}

Indicadores climáticos proyectados:
${lines.join("\n")}

Elabora un análisis ejecutivo estructurado en 4 secciones, breve y accionable para gestores de riesgo de retail:

1. **Perfil de riesgo** (2–3 oraciones: ¿cuál es el riesgo principal y su magnitud?)
2. **Impactos operacionales** (máx. 4 puntos con cifras estimadas — inventario, personal, energía, logística)
3. **Acciones inmediatas (0–2 años)** (máx. 4 puntos específicos y aplicables)
4. **Inversiones en resiliencia (2–10 años)** (máx. 4 puntos con foco en infraestructura y cadena de suministro)

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
    <div className="space-y-3 pt-1">
      <div className="border-t border-border" />
      <div>
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" />
          Recomendaciones con IA
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Estrategias de mitigación generadas con Gemini AI
        </p>
      </div>
      {!text ? (
        <Button className="w-full gap-2" size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Analizando con IA...</>
          ) : (
            <><Sparkles className="w-4 h-4" />Generar recomendaciones</>
          )}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-muted/10 p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
            {text}
          </div>
          <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground" onClick={() => setText(null)}>
            Regenerar
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ClimateRiskLookup() {
  const DEFAULT_CENTER = [-12.0464, -77.0428];

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [scenario, setScenario] = useState("pesimista");
  const [tileLayer, setTileLayer] = useState("osm");
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

  const handleSearch = async (overrideScenario) => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) { toast.error("Latitud inválida"); return; }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) { toast.error("Longitud inválida"); return; }

    const useScenario = overrideScenario || scenario;
    setLoading(true);
    setResults(null);
    setNoData(false);
    setMarkerPos([latNum, lngNum]);

    try {
      const res = await fetch(
        `${API_URL}/api/climate-risks/lookup?lat=${latNum}&lng=${lngNum}&scenario=${useScenario}`
      );
      if (!res.ok) throw new Error((await res.json()).error || "Error al consultar");
      const data = await res.json();
      if (!data.found) { setNoData(true); }
      else { setResults(data); }
    } catch (err) {
      toast.error(err.message || "Error al consultar riesgos");
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch cuando cambia escenario y ya hay resultados
  const handleScenarioChange = (s) => {
    setScenario(s);
    if (lat && lng && (results || noData)) {
      setNoData(false);
      handleSearch(s);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consulta de Riesgos Climáticos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecciona un punto en el mapa o ingresa coordenadas · datos del Banco Mundial (CCKP · CMIP6)
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ── Mapa ────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Haz clic en el mapa para seleccionar una ubicación
          </p>
          <div className="rounded-xl border border-border shadow-sm relative" style={{ height: "480px" }}>
            <MapContainer center={DEFAULT_CENTER} zoom={7} style={{ height: "100%", width: "100%", borderRadius: "0.75rem" }} className="z-0">
              <TileLayer
                key={tileLayer}
                url={TILE_LAYERS[tileLayer].url}
                attribution={TILE_LAYERS[tileLayer].attribution}
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
                    iconSize: [16, 26], iconAnchor: [8, 26], className: "opacity-50",
                  })}
                />
              )}
            </MapContainer>
            {/* Selector de capa flotante */}
            <div className="absolute bottom-3 left-3 z-[1000] flex gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1 shadow-md">
              {Object.entries(TILE_LAYERS).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => setTileLayer(key)}
                  className={`text-[10px] px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                    tileLayer === key
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Panel derecho ─────────────────── */}
        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>

          {/* Formulario */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              {/* Coordenadas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lat" className="text-xs text-muted-foreground">Latitud</Label>
                  <Input id="lat" type="number" step="any" placeholder="-12.0464" value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lng" className="text-xs text-muted-foreground">Longitud</Label>
                  <Input id="lng" type="number" step="any" placeholder="-77.0428" value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
                </div>
              </div>

              {/* Escenario */}
              <ScenarioSelector value={scenario} onChange={handleScenarioChange} disabled={loading} />

              {/* Botón buscar */}
              <Button className="w-full gap-2" onClick={() => handleSearch()} disabled={loading || (!lat && !lng)}>
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Consultando...</>
                ) : (
                  <><Search className="w-4 h-4" />Consultar riesgos</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Sin datos */}
          {noData && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                No se encontraron datos para esta ubicación. Asegúrate de haber cargado un dataset en{" "}
                <a href="/climate-upload" className="underline">Datos Climáticos</a>.
              </AlertDescription>
            </Alert>
          )}

          {/* Resultados */}
          {results && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <Alert className="border-primary/20 bg-primary/5 p-3">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <AlertDescription className="text-xs space-y-0.5">
                    <div>
                      <span className="font-semibold">
                        {results.horizons.length} horizonte{results.horizons.length !== 1 ? "s" : ""},&nbsp;
                        {Object.values(results.byHorizon).flat().length} indicadores
                      </span>
                      {" "}para ({results.queried.lat}, {results.queried.lng}).
                    </div>
                    <div className="text-muted-foreground">
                      Punto más cercano del Banco Mundial:{" "}
                      <span className="font-mono">{results.nearestPoint.lat}, {results.nearestPoint.lng}</span>
                      {" "}· <span className="font-semibold text-foreground">{results.nearestPoint.distanceKm} km</span>
                    </div>
                    <div className="text-muted-foreground">
                      Escenario:{" "}
                      <span className="font-medium text-foreground">{results.scenarioMeta?.label}</span>
                      {" "}— {results.scenarioMeta?.sublabel}
                    </div>
                  </AlertDescription>
                </Alert>

                <CardTitle className="text-xs text-muted-foreground font-normal mt-2 px-0.5">
                  Haz clic en cada grupo de riesgo para ver indicadores e impactos
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4 pb-4">
                {results.horizons.map((h) => (
                  <HorizonSection
                    key={h}
                    horizon={h}
                    records={results.byHorizon[h]}
                    baseline={results.baseline}
                  />
                ))}
                <AIPanel results={results} />
              </CardContent>
            </Card>
          )}

          {/* Estado vacío */}
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
