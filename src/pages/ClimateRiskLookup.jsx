import { useState, useCallback, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL, fetchExternalRisks } from "@/lib/api";
import {
  Search, MapPin, Loader2, AlertTriangle,
  Sparkles, Building2, Plus, ThermometerSun, Globe2, BookOpen,
} from "lucide-react";
import { toast } from "sonner";

// ── Leaflet icon fix ──────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE_LAYERS = {
  osm: {
    label: "Calles", icon: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  topo: {
    label: "Topográfico", icon: "🌄",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> contributors',
  },
  satellite: {
    label: "Satélite", icon: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
  },
};

const LEVEL_CONFIG = {
  bajo:       { label: "Exposición baja",     color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  medio:      { label: "Exposición moderada", color: "bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300",  dot: "bg-amber-500"   },
  alto:       { label: "Alta exposición",     color: "bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300",    dot: "bg-red-500"     },
  "sin data": { label: "Sin datos",           color: "bg-muted text-muted-foreground",                                            dot: "bg-muted-foreground" },
};

const HAZARD_ICONS = {
  flood: "🌊", fluvial: "🏞️", coastal: "🌊", pluvial: "🌧️",
  drought: "☀️", heat: "🌡️", extreme_heat: "🌡️", landslide: "⛰️",
};

function getLevelCfg(level) {
  return LEVEL_CONFIG[(level || "").toLowerCase()] || LEVEL_CONFIG["sin data"];
}

function getHazardNarrative(hazardName, currentScore, futureHighScore) {
  const order = { alto: 3, medio: 2, bajo: 1, "sin data": 0 };
  const curr   = order[currentScore]    || 0;
  const future = order[futureHighScore] || 0;

  const base = {
    0: `Sin datos disponibles para ${hazardName.toLowerCase()} en esta ubicación.`,
    1: `La exposición a ${hazardName.toLowerCase()} es baja en esta zona. El riesgo histórico es reducido.`,
    2: `Se detecta un nivel moderado de exposición a ${hazardName.toLowerCase()}. Se recomienda monitoreo preventivo.`,
    3: `Alta exposición a ${hazardName.toLowerCase()} detectada. Esta amenaza puede generar impactos operacionales significativos.`,
  }[curr] || `Datos disponibles para ${hazardName.toLowerCase()}.`;

  return future > curr && future >= 2
    ? base + " Las proyecciones futuras muestran un posible incremento del riesgo."
    : base;
}

// ── Map sub-components ─────────────────────────────────────────────────────────

function SearchPanel({ onLocationSelect }) {
  const [query, setQuery]               = useState("");
  const [results, setResults]           = useState([]);
  const [searching, setSearching]       = useState(false);
  const [showResults, setShowResults]   = useState(false);
  const [selectedPlace, setSelectedPlace]   = useState(null);
  const [registerForm, setRegisterForm] = useState({ name: "", unidad_negocio: "" });
  const [registering, setRegistering]   = useState(false);
  const debounceRef = useRef(null);
  const panelRef    = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setShowResults(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) { setResults(await res.json()); setShowResults(true); }
      } catch (e) { console.error("Search error:", e); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectResult = (r) => {
    onLocationSelect(r.lat, r.lng);
    setQuery(r.tipo === "asset" ? r.name : r.direccion);
    setShowResults(false);
    setSelectedPlace(r.tipo === "place" ? r : null);
    setRegisterForm({ name: "", unidad_negocio: "" });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!registerForm.name.trim()) { toast.error("El nombre del activo es requerido"); return; }
    setRegistering(true);
    try {
      const res = await fetch(`${API_URL}/api/places/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: selectedPlace.id,
          name: registerForm.name,
          unidad_negocio: registerForm.unidad_negocio,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      toast.success("Activo registrado correctamente");
      setRegisterForm({ name: "", unidad_negocio: "" });
      setSelectedPlace(null);
      const fresh = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
      if (fresh.ok) { setResults(await fresh.json()); setShowResults(true); }
    } catch (err) {
      toast.error(err.message || "Error al registrar el activo");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="space-y-3" ref={panelRef}>
      <div className="relative">
        <Label className="text-xs text-muted-foreground">Buscar por nombre o dirección</Label>
        <div className="relative mt-1.5">
          {searching
            ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            : <Search  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
          <Input
            className="pl-9"
            placeholder="Ej. Plaza Vea San Isidro o Av. Javier Prado..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
          />
        </div>

        {showResults && (
          <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {results.length === 0 && !searching && (
              <p className="px-3 py-2.5 text-xs text-muted-foreground text-center">
                Sin resultados para &ldquo;{query}&rdquo;
              </p>
            )}
            {results.map((r, i) => (
              <button
                key={r.id || i}
                onClick={() => handleSelectResult(r)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0"
              >
                <span className="flex-shrink-0 mt-0.5">
                  {r.tipo === "asset"
                    ? <Building2 className="w-4 h-4 text-blue-500" />
                    : <MapPin    className="w-4 h-4 text-amber-500" />}
                </span>
                <div className="flex-1 min-w-0">
                  {r.tipo === "asset" ? (
                    <>
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.direccion}</p>
                      {r.unidad_negocio && (
                        <Badge className="text-[10px] px-1.5 py-0 mt-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-0">
                          {r.unidad_negocio}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate">{r.direccion}</p>
                      <Badge className="text-[10px] px-1.5 py-0 mt-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0">
                        Sin activos registrados
                      </Badge>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPlace && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/50 dark:border-amber-600 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-300 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">No hay activos registrados aquí</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-snug">{selectedPlace.direccion}</p>
            </div>
          </div>
          <form onSubmit={handleRegister} className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nombre del activo *</Label>
              <Input
                placeholder="Ej. Plaza Vea San Isidro"
                value={registerForm.name}
                onChange={(e) => setRegisterForm(f => ({ ...f, name: e.target.value }))}
                className="h-8 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Unidad de negocio</Label>
              <Input
                placeholder="Ej. Supermercados"
                value={registerForm.unidad_negocio}
                onChange={(e) => setRegisterForm(f => ({ ...f, unidad_negocio: e.target.value }))}
                className="h-8 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="flex-1 h-8 text-xs gap-1.5" disabled={registering}>
                {registering
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Registrando...</>
                  : <><Plus    className="w-3.5 h-3.5" />Registrar activo</>}
              </Button>
              <Button
                type="button" size="sm" variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => setSelectedPlace(null)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

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

function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target?.pos) return;
    const [lat, lng] = target.pos;
    if (!isFinite(lat) || !isFinite(lng)) return;
    map.flyTo(target.pos, target.zoom, { animate: true, duration: 1.2 });
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Result panels ─────────────────────────────────────────────────────────────

function HazardNarrativePanel({ data, loading, error }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Consultando amenazas climáticas...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">
          No se pudo consultar las amenazas externas: {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const hazards    = Array.isArray(data.hazards) ? data.hazards : [];
  const overallCfg = getLevelCfg(data.overall_score);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Amenazas climáticas detectadas</span>
          <Badge className={`${overallCfg.color} border-0`}>{overallCfg.label}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Fuente en tiempo real: GRI Infrastructure Resilience</p>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {hazards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin amenazas identificadas para esta ubicación.</p>
        ) : (
          hazards.map((hazard) => {
            const currentScore    = hazard.baseline?.score              || "sin data";
            const futureHighScore = hazard.future_high_emissions?.score || "sin data";
            const levelCfg = getLevelCfg(currentScore);
            const icon     = HAZARD_ICONS[hazard.hazard] || "⚠️";

            return (
              <div key={hazard.hazard} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{icon}</span>
                    <span className="text-sm font-semibold">{hazard.hazard_name}</span>
                  </div>
                  <Badge className={`${levelCfg.color} border-0`}>{levelCfg.label}</Badge>
                </div>

                <p className="text-sm text-foreground/75 leading-snug">
                  {getHazardNarrative(hazard.hazard_name, currentScore, futureHighScore)}
                </p>

                {futureHighScore !== "sin data" && futureHighScore !== currentScore && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[11px] text-muted-foreground">Proyección a futuro:</span>
                    <Badge className={`${getLevelCfg(futureHighScore).color} border-0 text-[10px] py-0`}>
                      {getLevelCfg(futureHighScore).label}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })
        )}
        <p className="text-[10px] text-muted-foreground/60">
          Basado en modelos ISIMIP, Aqueduct y JRC Flood.
        </p>
      </CardContent>
    </Card>
  );
}

function ClimateProjectionsPanel({ data, loading }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Consultando proyecciones climáticas...
        </CardContent>
      </Card>
    );
  }

  if (!data?.narrative?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <ThermometerSun className="w-4 h-4 text-amber-500" />
          ¿Cómo cambiará el clima aquí?
        </CardTitle>
        <p className="text-xs text-muted-foreground">Fuente: Open-Meteo · proyecciones históricas y futuras (1980–2050)</p>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {data.narrative.map((item, i) => (
          <div
            key={i}
            className={`rounded-xl p-3 space-y-1.5 ${
              i === 0
                ? "bg-blue-500/5 ring-1 ring-blue-500/20"
                : "bg-amber-500/5 ring-1 ring-amber-500/20"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{i === 0 ? "📅" : "🔭"}</span>
              <span className="text-xs font-semibold">{item.period}</span>
            </div>
            <ul className="space-y-1">
              {item.messages.map((msg, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0 mt-1.5" />
                  {msg}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {/* Complemento narrativo desde BD histórica — solo si aporta contexto */}
        {data.historical_context?.narrative && (
          <div className="rounded-xl bg-slate-500/5 ring-1 ring-slate-400/20 p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">📋</span>
              <span className="text-xs font-semibold text-muted-foreground">Registros históricos locales</span>
            </div>
            <p className="text-sm text-foreground/65 leading-snug">
              {data.historical_context.narrative}
            </p>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/60">
          Modelos climáticos: CMCC, FGOALS, HiRAM, MRI · temperatura y precipitación media diaria.
        </p>
      </CardContent>
    </Card>
  );
}

function TerritorialContextPanel({ data }) {
  if (!data?.narrative?.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-blue-500" />
          Contexto del territorio
        </CardTitle>
        <p className="text-xs text-muted-foreground">Fuente: Banco Mundial · indicadores socioeconómicos de Perú</p>
      </CardHeader>
      <CardContent className="pb-4">
        <ul className="space-y-2">
          {data.narrative.map((msg, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground/75">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 mt-1.5" />
              {msg}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function AIPanel({ externalRisks, climateTrends, docContext }) {
  const [loading, setLoading] = useState(false);
  const [text, setText]       = useState(null);

  const docCount = docContext?.total || 0;

  const handleGenerate = async () => {
    setLoading(true);
    setText(null);
    try {
      const hazardLines = externalRisks?.hazards?.map(h =>
        `- ${h.hazard_name}: ${h.baseline?.score || "sin data"}`
      ).join("\n") || "Sin datos GRI";

      const trendLines = climateTrends?.narrative?.map(p =>
        `${p.period}:\n${p.messages.map(m => `  - ${m}`).join("\n")}`
      ).join("\n") || "Sin proyecciones disponibles";

      // Contexto de documentos: se inyecta en el prompt si existen archivos de referencia
      const docSection = docContext?.ai_context
        ? `\n${docContext.ai_context}\n`
        : "";

      const prompt = `Eres asesor experto en riesgos climáticos para operaciones de retail en Perú.
${docSection}
Amenazas climáticas detectadas (GRI):
${hazardLines}

Proyecciones climáticas (Open-Meteo):
${trendLines}

Elabora un análisis ejecutivo breve y accionable con:
1. Perfil de riesgo (2–3 oraciones)
2. Impactos operacionales más probables (máx. 4 puntos)
3. Acciones recomendadas${docCount > 0 ? " — cuando sea pertinente, menciona los documentos de referencia disponibles" : ""} (máx. 3 puntos)

Responde en español. Usa lenguaje claro y directo, sin términos técnicos científicos.`;

      const res = await fetch(`${API_URL}/api/ai`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt }),
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
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" />
          Recomendaciones con IA
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Análisis generado a partir de los datos de riesgo detectados
        </p>
        {docCount > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              {docCount} documento{docCount !== 1 ? "s" : ""} de referencia disponible{docCount !== 1 ? "s" : ""} como contexto
            </span>
          </div>
        )}
      </div>
      {!text ? (
        <Button className="w-full gap-2" size="sm" onClick={handleGenerate} disabled={loading}>
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Analizando con IA...</>
            : <><Sparkles className="w-4 h-4" />Generar recomendaciones</>}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClimateRiskLookup() {
  const DEFAULT_CENTER = [-12.0464, -77.0428];

  const [lat, setLat]             = useState("");
  const [lng, setLng]             = useState("");
  const [tileLayer, setTileLayer] = useState("osm");
  const [markerPos, setMarkerPos] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [loading, setLoading]     = useState(false);

  const [externalRisks, setExternalRisks]   = useState(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError]   = useState(null);

  const [climateTrends, setClimateTrends]   = useState(null);
  const [trendsLoading, setTrendsLoading]   = useState(false);

  const [territorialCtx, setTerritorialCtx] = useState(null);
  const [docContext, setDocContext]         = useState(null);

  // Contexto Banco Mundial + catálogo de documentos: se cargan una sola vez al iniciar
  useEffect(() => {
    Promise.allSettled([
      fetch(`${API_URL}/api/territorial-context`).then(r => r.ok ? r.json() : null),
      fetch(`${API_URL}/api/documentos/context`).then(r => r.ok ? r.json() : null),
    ]).then(([terrResult, docResult]) => {
      if (terrResult.status === "fulfilled" && terrResult.value) setTerritorialCtx(terrResult.value);
      if (docResult.status === "fulfilled"  && docResult.value?.total > 0) setDocContext(docResult.value);
    });
  }, []);

  const handleMapClick = useCallback((clickLat, clickLng) => {
    setLat(String(clickLat));
    setLng(String(clickLng));
    setMarkerPos([clickLat, clickLng]);
    setExternalRisks(null);
    setClimateTrends(null);
    setExternalError(null);
  }, []);

  const handleSearch = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || latNum < -90  || latNum > 90)  { toast.error("Latitud inválida");  return; }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) { toast.error("Longitud inválida"); return; }

    setLoading(true);
    setExternalLoading(true);
    setTrendsLoading(true);
    setExternalRisks(null);
    setClimateTrends(null);
    setExternalError(null);
    setMarkerPos([latNum, lngNum]);
    setFlyTarget({ pos: [latNum, lngNum], zoom: 14 });

    try {
      const [griResult, trendsResult] = await Promise.allSettled([
        fetchExternalRisks(latNum, lngNum),
        fetch(`${API_URL}/api/climate-trends?lat=${latNum}&lng=${lngNum}`)
          .then(r => r.ok ? r.json() : Promise.reject(new Error("Error en proyecciones"))),
      ]);

      if (griResult.status === "fulfilled") {
        setExternalRisks(griResult.value);
      } else {
        setExternalError(griResult.reason?.message || "Servicio GRI no disponible");
      }

      if (trendsResult.status === "fulfilled") {
        setClimateTrends(trendsResult.value);
      }
    } finally {
      setLoading(false);
      setExternalLoading(false);
      setTrendsLoading(false);
    }
  };

  const hasResults = !!(externalRisks || climateTrends);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Análisis de Riesgos Climáticos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecciona un punto en el mapa para analizar las amenazas y tendencias climáticas de esa zona
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ── Mapa ─────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Haz clic en el mapa para seleccionar una ubicación
          </p>
          <div className="rounded-xl border border-border shadow-sm relative" style={{ height: "480px" }}>
            <MapContainer
              center={DEFAULT_CENTER} zoom={7}
              style={{ height: "100%", width: "100%", borderRadius: "0.75rem" }}
              className="z-0"
            >
              <TileLayer
                key={tileLayer}
                url={TILE_LAYERS[tileLayer].url}
                attribution={TILE_LAYERS[tileLayer].attribution}
              />
              <MapClickHandler onMapClick={handleMapClick} />
              <MapFlyTo target={flyTarget} />
              {markerPos && <Marker position={markerPos} />}
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

        {/* ── Panel derecho ─────────────────────────── */}
        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>

          {/* Búsqueda y coordenadas */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <SearchPanel
                onLocationSelect={(newLat, newLng) => {
                  if (!isFinite(newLat) || !isFinite(newLng)) return;
                  setLat(String(newLat));
                  setLng(String(newLng));
                  setMarkerPos([newLat, newLng]);
                  setFlyTarget({ pos: [newLat, newLng], zoom: 16 });
                  setExternalRisks(null);
                  setClimateTrends(null);
                  setExternalError(null);
                }}
              />

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

          {/* 1. Amenazas GRI (tiempo real) */}
          <HazardNarrativePanel
            data={externalRisks}
            loading={externalLoading}
            error={externalError}
          />

          {/* 2. Proyecciones Open-Meteo */}
          <ClimateProjectionsPanel
            data={climateTrends}
            loading={trendsLoading}
          />

          {/* 3. Contexto territorial Banco Mundial */}
          <TerritorialContextPanel data={territorialCtx} />

          {/* 4. Recomendaciones IA */}
          {hasResults && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <AIPanel externalRisks={externalRisks} climateTrends={climateTrends} docContext={docContext} />
              </CardContent>
            </Card>
          )}

          {/* Estado vacío */}
          {!hasResults && !loading && !externalLoading && !trendsLoading && !territorialCtx && (
            <div className="text-center py-16 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Selecciona un punto en el mapa</p>
              <p className="text-xs mt-1 opacity-60">
                o ingresa coordenadas para analizar los riesgos climáticos
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
