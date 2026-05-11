// @ts-nocheck
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_URL, fetchTerritorialContext, fetchDocumentContext, analyzeClimateRisk } from "@/lib/api";
import {
  Search, MapPin, Loader2, AlertTriangle,
  Sparkles, Building2, Plus, Globe2, BookOpen, ChevronDown, ChevronUp,
  ShieldAlert, Leaf, BarChart3, Thermometer,
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

const SECTORS = [
  { value: "retail",          label: "Retail / Supermercados" },
  { value: "salud",           label: "Salud / Clínicas" },
  { value: "educacion",       label: "Educación" },
  { value: "entretenimiento", label: "Entretenimiento" },
  { value: "otros",           label: "Otro sector" },
];

const URGENCY_STYLES = {
  "crítica": { badge: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",    dot: "bg-red-500"     },
  alta:      { badge: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700", dot: "bg-orange-500" },
  media:     { badge: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700", dot: "bg-yellow-500" },
  baja:      { badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700", dot: "bg-emerald-500" },
};

const SIGNAL_META = {
  extreme_heat:  { icon: "🌡️", label: "Calor extremo (>35°C)",        unit: "días/año" },
  severe_heat:   { icon: "🔥", label: "Calor severo (>40°C)",          unit: "días/año" },
  drought:       { icon: "☀️", label: "Sequía / estrés hídrico",        unit: "días"     },
  extreme_rain:  { icon: "🌧️", label: "Lluvia extrema",                unit: "mm"       },
  temp_increase: { icon: "📈", label: "Aumento temperatura media",      unit: "°C"       },
  flood_risk:    { icon: "🌊", label: "Riesgo de inundación",           unit: "%"        },
};

const HORIZON_LABEL = {
  short_term: "2020–2039 (corto plazo)",
  mid_term:   "2040–2059 (mediano plazo)",
  long_term:  "2060+ (largo plazo)",
};

const GRI_ICONS = {
  flood: "🌊", fluvial: "🏞️", coastal: "🌊", pluvial: "🌧️",
  drought: "☀️", heat: "🌡️", extreme_heat: "🌡️", landslide: "⛰️",
};

const GRI_BADGE = {
  alto:       "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
  medio:      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
  bajo:       "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
  "sin data": "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-600",
};

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(val) {
  if (val == null) return "—";
  if (val >= 1_000_000) return `USD ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `USD ${(val / 1_000).toFixed(0)}K`;
  return `USD ${val}`;
}

function fmtNum(v, decimals = 1) {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(decimals);
}

function UrgencyBadge({ urgency }) {
  const s = URGENCY_STYLES[urgency] ?? URGENCY_STYLES.baja;
  return (
    <Badge variant="outline" className={`text-[10px] py-0 px-2 font-semibold border ${s.badge}`}>
      {urgency}
    </Badge>
  );
}

function ScoreBar({ score }) {
  const pct = Math.round((score ?? 0) * 100);
  const color = pct >= 75 ? "bg-red-500" : pct >= 50 ? "bg-orange-500" : pct >= 25 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 w-7 text-right">{pct}</span>
    </div>
  );
}

// ── Panel 1: Resumen ejecutivo (Layer 6 narrative) ────────────────────────────

function NarrativePanel({ narrative, location, metadata }) {
  const summary = narrative?.executive_summary;
  const metrics = narrative?.key_metrics ?? {};
  const urgency = metrics.urgencia_top_riesgo ?? null;
  const scoreTop = metrics.composite_score_top;
  const distKm = location?.distanceKm ?? metadata?.distance_km;

  const urgencyBorderColor = {
    "crítica": "border-red-400 dark:border-red-700",
    alta:      "border-orange-400 dark:border-orange-700",
    media:     "border-yellow-400 dark:border-yellow-700",
    baja:      "border-emerald-400 dark:border-emerald-700",
  }[urgency] ?? "border-primary/30";

  if (!summary) return null;

  return (
    <Card className={`border-2 ${urgencyBorderColor} bg-white dark:bg-zinc-900 shadow-sm`}>
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary flex-shrink-0" />
            Evaluación de riesgo climático
          </CardTitle>
          <div className="flex items-center gap-2 flex-shrink-0">
            {urgency && <UrgencyBadge urgency={urgency} />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>

        {/* Key metrics strip */}
        {(metrics.total_señales > 0 || scoreTop != null || metrics.impacto_financiero_min != null) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {metrics.total_señales > 0 && (
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2.5 text-center">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Señales IPCC</p>
                <p className="text-lg font-bold text-zinc-900 dark:text-white">{metrics.total_señales}</p>
              </div>
            )}
            {scoreTop != null && (
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2.5 text-center">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Score riesgo</p>
                <p className="text-lg font-bold text-zinc-900 dark:text-white">{Math.round(scoreTop * 100)}<span className="text-xs font-normal text-zinc-400">/100</span></p>
              </div>
            )}
            {metrics.impacto_financiero_min != null && (
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2.5 text-center col-span-2">
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">Impacto financiero est.</p>
                <p className="text-sm font-bold text-zinc-900 dark:text-white">
                  {fmtUSD(metrics.impacto_financiero_min)} – {fmtUSD(metrics.impacto_financiero_max)}<span className="text-[10px] font-normal text-zinc-400 ml-1">/año</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Distance warning */}
        {distKm != null && distKm > 30 && (
          <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/40 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <AlertDescription className="text-xs text-blue-900 dark:text-blue-200">
              Punto de datos más cercano: {distKm.toFixed(0)} km. Los resultados son orientativos.
            </AlertDescription>
          </Alert>
        )}

        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
          Fuentes: {(metadata?.data_sources ?? []).join(" · ") || "climate_cells · GRI · Open-Meteo · World Bank"}
          {metadata?.scenario && ` · ${metadata.scenario}`}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Panel 2: Señales climáticas (Layer 2) ─────────────────────────────────────

function SignalRow({ signal }) {
  const meta  = SIGNAL_META[signal.signalType] ?? { icon: "⚠️", label: signal.signalType, unit: "" };
  const sign  = (signal.delta ?? 0) >= 0 ? "+" : "";
  const conf  = signal.confidence;
  const confColor = conf === "high" ? "text-emerald-600 dark:text-emerald-400" : conf === "medium" ? "text-amber-600 dark:text-amber-400" : "text-zinc-400";

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          <span className="text-base leading-none">{meta.icon}</span>
          {meta.label}
        </span>
        <span className={`text-[10px] font-semibold ${confColor}`}>{conf}</span>
      </div>

      <div className="flex items-center gap-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
        <span className="tabular-nums">{fmtNum(signal.historical)}</span>
        <span className="text-zinc-300 dark:text-zinc-600">→</span>
        <span className="tabular-nums font-bold text-zinc-900 dark:text-white">{fmtNum(signal.projected)}</span>
        <span className="text-zinc-400 dark:text-zinc-500 font-sans">{meta.unit}</span>
        {signal.delta != null && (
          <span className="ml-auto text-zinc-500">({sign}{fmtNum(signal.delta)})</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{HORIZON_LABEL[signal.horizon] ?? signal.horizon}</p>
        {signal.threshold_reference && (
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[55%] text-right" title={signal.threshold_reference}>
            {signal.threshold_reference.slice(0, 40)}…
          </p>
        )}
      </div>
    </div>
  );
}

function SignalsPanel({ signals }) {
  const list = signals?.signals ?? [];
  if (!list.length) return null;

  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Señales climáticas detectadas
            <span className="ml-2 text-[11px] font-normal text-zinc-400">({list.length})</span>
          </span>
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
          Comparación histórico (1995–2014) vs. proyectado · umbrales IPCC AR6 / WRI Aqueduct
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-4">
        {list.map((s, i) => <SignalRow key={i} signal={s} />)}
      </CardContent>
    </Card>
  );
}

// ── Panel 3: Riesgos priorizados (Layer 3 + 4) ───────────────────────────────

function RiskCard({ risk }) {
  const [expanded, setExpanded] = useState(false);
  const signalMeta = SIGNAL_META[risk.signal?.signalType] ?? { icon: "⚠️", label: risk.signal?.signalType ?? "Riesgo" };
  const s = URGENCY_STYLES[risk.urgency] ?? URGENCY_STYLES.baja;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 overflow-hidden">
      <div className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-[10px] font-bold flex items-center justify-center text-zinc-600 dark:text-zinc-300">
              {risk.rank}
            </span>
            <span className="text-base leading-none flex-shrink-0">{signalMeta.icon}</span>
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{signalMeta.label}</p>
          </div>
          <UrgencyBadge urgency={risk.urgency} />
        </div>

        {/* Score bar */}
        <ScoreBar score={risk.composite_score} />

        {/* Operational impacts (top 3) */}
        {risk.operational_impacts?.length > 0 && (
          <ul className="space-y-1">
            {risk.operational_impacts.slice(0, expanded ? undefined : 3).map((imp, j) => (
              <li key={j} className="flex items-start gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                <span className="w-1 h-1 rounded-full bg-zinc-400 flex-shrink-0 mt-1.5" />
                {imp}
              </li>
            ))}
          </ul>
        )}

        {/* Financial impact */}
        {risk.financial_impact_range && (
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
            Impacto estimado: <span className="font-semibold text-zinc-600 dark:text-zinc-300">
              {fmtUSD(risk.financial_impact_range.min_usd)} – {fmtUSD(risk.financial_impact_range.max_usd)}
            </span>/año
          </p>
        )}
      </div>

      {/* Expandable: score components */}
      {risk.score_components && (
        <div className="border-t border-zinc-200 dark:border-zinc-700">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <span>Componentes del score</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {expanded && (
            <div className="px-3 pb-3 grid grid-cols-3 gap-2">
              {Object.entries(risk.score_components).map(([k, v]) => (
                <div key={k} className="text-center">
                  <p className="text-[9px] text-zinc-400 uppercase tracking-widest">{k}</p>
                  <p className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300">{(v * 100).toFixed(0)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RisksPanel({ risks }) {
  if (!risks?.length) return null;
  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Riesgos empresariales priorizados</span>
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
          Ordenados por score compuesto: probabilidad · intensidad · exposición · sensibilidad sectorial
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5 pb-4">
        {risks.map((r, i) => <RiskCard key={i} risk={r} />)}
      </CardContent>
    </Card>
  );
}

// ── Panel 4: Amenazas GRI (desde gri_hazards en respuesta v2) ─────────────────

function GRIThreatsPanel({ hazards }) {
  const filtered = (hazards ?? [])
    .filter(h => h.baseline?.score && h.baseline.score !== "sin data")
    .sort((a, b) => {
      const order = { alto: 3, medio: 2, bajo: 1 };
      return (order[b.baseline?.score] ?? 0) - (order[a.baseline?.score] ?? 0);
    });

  if (!filtered.length) return null;

  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Exposición a amenazas</span>
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">Fuente: GRI Infrastructure Resilience · probabilidad histórica y proyecciones</p>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {filtered.map(h => {
          const scoreKey = (h.baseline?.score ?? "sin data").toLowerCase();
          const badgeCls = GRI_BADGE[scoreKey] ?? GRI_BADGE["sin data"];
          const icon = GRI_ICONS[h.hazard] ?? "⚠️";
          const futureScore = h.future_high_emissions?.score ?? h.future_low_emissions?.score;
          const hasChange = futureScore && futureScore !== h.baseline?.score;

          return (
            <div
              key={h.hazard}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 flex items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-800"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg leading-none">{icon}</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{h.hazard_name}</p>
                  {hasChange && (
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      Proyección: {h.baseline?.score} → {futureScore}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] py-0.5 px-2 font-semibold border flex-shrink-0 ${badgeCls}`}>
                {h.baseline?.score}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Panel 5: Medidas de adaptación (Layer 5) ──────────────────────────────────

function AdaptationPanel({ adaptations }) {
  const list = adaptations?.adaptations ?? [];
  if (!list.length) return null;

  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Leaf className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Medidas de adaptación</span>
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">Priorizadas por riesgo detectado · incluye horizonte y costo estimado</p>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {list.map((adapt, i) => {
          const signalMeta = SIGNAL_META[adapt.risk_type] ?? { icon: "⚠️", label: adapt.risk_type };
          return (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm leading-none">{signalMeta.icon}</span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  {signalMeta.label}
                </p>
                <UrgencyBadge urgency={adapt.urgency} />
              </div>
              <div className="space-y-1.5 pl-1">
                {(adapt.measures ?? []).slice(0, 3).map((m, j) => (
                  <div key={j} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{m.nombre}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {m.horizonte_implementacion} plazo
                        {m.costo_estimado_rango && ` · ${fmtUSD(m.costo_estimado_rango.min_usd)}–${fmtUSD(m.costo_estimado_rango.max_usd)}`}
                      </p>
                      {m.donde_impacta && (
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-600 mt-0.5 italic">{m.donde_impacta}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] py-0 px-1.5 flex-shrink-0 ${
                        m.efectividad === "alta"  ? "border-emerald-400 text-emerald-700 dark:text-emerald-300" :
                        m.efectividad === "media" ? "border-amber-400 text-amber-700 dark:text-amber-300" :
                                                    "border-zinc-400 text-zinc-500"
                      }`}
                    >
                      {m.efectividad}
                    </Badge>
                  </div>
                ))}
              </div>
              {i < list.length - 1 && <div className="border-t border-zinc-100 dark:border-zinc-800" />}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Panel 6: Contexto territorial (World Bank) ────────────────────────────────

function TerritorialContextPanel({ data }) {
  if (!data?.narrative?.length) return null;
  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Contexto del territorio</span>
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Fuente: Banco Mundial · indicadores socioeconómicos de Perú</p>
      </CardHeader>
      <CardContent className="pb-4">
        <ul className="space-y-2">
          {data.narrative.map((msg, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
              {msg}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── Panel 7: Recomendaciones IA ───────────────────────────────────────────────

function AIPanel({ analysis, docContext }) {
  const [loading, setLoading] = useState(false);
  const [text, setText]       = useState(null);
  const docCount = docContext?.total || 0;

  const handleGenerate = async () => {
    if (!analysis) return;
    setLoading(true);
    setText(null);
    try {
      const { narrative, risks, signals, metadata } = analysis;
      const summary = narrative?.executive_summary ?? "";
      const topRisks = (risks ?? []).slice(0, 3).map(r =>
        `- ${r.signal?.signalType ?? "riesgo"} (urgencia: ${r.urgency}, score: ${Math.round((r.composite_score ?? 0) * 100)}/100): ${(r.operational_impacts ?? []).slice(0, 2).join(", ")}`
      ).join("\n");
      const sigCount = signals?.signals_count ?? 0;

      const docSection = docContext?.ai_context ? `\n${docContext.ai_context}\n` : "";

      const prompt = `Eres asesor experto en riesgos climáticos para operaciones de ${metadata?.sector ?? "retail"} en Perú.

Resumen ejecutivo del análisis:
${summary}

Señales detectadas: ${sigCount}
Riesgos principales:
${topRisks || "Sin riesgos detectados"}
${docSection}
Elabora un análisis ejecutivo breve y accionable con:
1. Perfil de riesgo (2–3 oraciones basadas en los datos anteriores)
2. Impactos operacionales más probables para el sector (máx. 4 puntos concretos)
3. Acciones recomendadas${docCount > 0 ? " — cuando sea pertinente, menciona los documentos de referencia disponibles" : ""} (máx. 3 puntos)

Responde en español. Usa lenguaje claro y directo, sin términos técnicos científicos. No inventes datos que no estén en el contexto.`;

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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5 text-zinc-900 dark:text-zinc-100">
            <Sparkles className="w-4 h-4 text-primary" />
            Recomendaciones con IA
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Análisis generado a partir de los datos de riesgo detectados.
          </p>
        </div>
        {docCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <BookOpen className="w-3.5 h-3.5" />
            {docCount} documento{docCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!text ? (
        <Button className="w-full gap-2" size="sm" onClick={handleGenerate} disabled={loading || !analysis}>
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Analizando con IA...</>
            : <><Sparkles className="w-4 h-4" />Generar recomendaciones</>}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Análisis IA</p>
              <span className="rounded-full bg-primary/15 dark:bg-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary">IA</span>
            </div>
            <div className="text-sm leading-6 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{text}</div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="secondary" onClick={() => setText(null)}>Regenerar</Button>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Valida las acciones con tu equipo técnico.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────

function AnalysisLoading() {
  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
      <CardContent className="py-6 flex flex-col items-center gap-3 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Ejecutando análisis climático</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Consultando climate_cells · GRI · Open-Meteo · World Bank
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClimateRiskLookup() {
  const DEFAULT_CENTER = [-12.0464, -77.0428];

  const [lat, setLat]             = useState("");
  const [lng, setLng]             = useState("");
  const [sector, setSector]       = useState("retail");
  const [tileLayer, setTileLayer] = useState("osm");
  const [markerPos, setMarkerPos] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);

  const [loading, setLoading]     = useState(false);
  const [analysis, setAnalysis]   = useState(null);
  const [error, setError]         = useState(null);

  const [territorialCtx, setTerritorialCtx] = useState(null);
  const [docContext, setDocContext]         = useState(null);

  useEffect(() => {
    Promise.allSettled([
      fetchTerritorialContext(),
      fetchDocumentContext(),
    ]).then(([terrResult, docResult]) => {
      if (terrResult.status === "fulfilled" && terrResult.value) setTerritorialCtx(terrResult.value);
      if (docResult.status === "fulfilled" && docResult.value?.total > 0) setDocContext(docResult.value);
    });
  }, []);

  const handleMapClick = useCallback((clickLat, clickLng) => {
    setLat(String(clickLat));
    setLng(String(clickLng));
    setMarkerPos([clickLat, clickLng]);
    setAnalysis(null);
    setError(null);
  }, []);

  const handleSearch = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || latNum < -90  || latNum > 90)  { toast.error("Latitud inválida");  return; }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) { toast.error("Longitud inválida"); return; }

    setLoading(true);
    setAnalysis(null);
    setError(null);
    setMarkerPos([latNum, lngNum]);
    setFlyTarget({ pos: [latNum, lngNum], zoom: 14 });

    try {
      const result = await analyzeClimateRisk({ lat: latNum, lon: lngNum, sector });
      if (result) {
        setAnalysis(result);
      } else {
        setError("No se pudo obtener el análisis. Verifica la conexión con el backend.");
      }
    } catch (err) {
      setError(err.message || "Error al ejecutar el análisis climático.");
    } finally {
      setLoading(false);
    }
  };

  const hasResults = !!analysis;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Análisis de Riesgo Climático</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecciona un punto en el mapa para analizar riesgos y proyecciones climáticas de esa zona
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ── Mapa ─────────────────────────── */}
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

        {/* ── Panel derecho ─────────────────── */}
        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>

          {/* Formulario de búsqueda */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <SearchPanel
                onLocationSelect={(newLat, newLng) => {
                  if (!isFinite(newLat) || !isFinite(newLng)) return;
                  setLat(String(newLat));
                  setLng(String(newLng));
                  setMarkerPos([newLat, newLng]);
                  setFlyTarget({ pos: [newLat, newLng], zoom: 16 });
                  setAnalysis(null);
                  setError(null);
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

              {/* Sector selector */}
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

          {/* Loading state */}
          {loading && <AnalysisLoading />}

          {/* Error state */}
          {error && !loading && (
            <Alert className="border-destructive bg-destructive/10">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <AlertDescription className="text-sm text-destructive">{error}</AlertDescription>
            </Alert>
          )}

          {/* Resultados del análisis integrado (Layers 1-6) */}
          {hasResults && !loading && (
            <>
              {/* Layer 6: Narrativa ejecutiva */}
              <NarrativePanel
                narrative={analysis.narrative}
                location={analysis.location}
                metadata={analysis.metadata}
              />

              {/* Layer 2: Señales climáticas */}
              <SignalsPanel signals={analysis.signals} />

              {/* Layer 3+4: Riesgos priorizados */}
              <RisksPanel risks={analysis.risks} />

              {/* GRI: Amenazas por tipo */}
              <GRIThreatsPanel hazards={analysis.gri_hazards} />

              {/* Layer 5: Adaptaciones */}
              <AdaptationPanel adaptations={analysis.adaptations} />
            </>
          )}

          {/* Contexto territorial Banco Mundial (siempre disponible) */}
          <TerritorialContextPanel data={territorialCtx} />

          {/* Recomendaciones IA */}
          {hasResults && !loading && (
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <AIPanel analysis={analysis} docContext={docContext} />
              </CardContent>
            </Card>
          )}

          {/* Estado vacío */}
          {!hasResults && !loading && !error && (
            <div className="text-center py-12">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Selecciona un punto en el mapa</p>
              <p className="text-xs mt-1 text-zinc-400 dark:text-zinc-600">o ingresa coordenadas para analizar los riesgos climáticos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
