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
import { API_URL, fetchExternalRisks, fetchClimateTrends, fetchTerritorialContext, fetchDocumentContext, fetchClimateDB } from "@/lib/api";
import {
  Search, MapPin, Loader2, AlertTriangle,
  Sparkles, Building2, Plus, ThermometerSun, Globe2, BookOpen, TrendingUp, ChevronDown,
} from "lucide-react";
import { summarizeClimateLocation } from "@/lib/climateInterpretation";
import { runClimateEngine } from "@/lib/climateEngine";
import { buildExecutiveSummaryCards, formatThreatsForExecutive, buildTechnicalDetailsContent, getExecutiveSeverityLabel } from "@/lib/executiveFormatter";
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

// ── Executive Summary Panel ───────────────────────────────────────────────────

function ExecutiveSummaryPanel({ engineResult }) {
  const cards = buildExecutiveSummaryCards(engineResult);
  if (!cards.length) return null;

  const overallSev = engineResult.overallSeverity || "none";
  const overallLabel = getExecutiveSeverityLabel(overallSev);

  const outerBorder = {
    none:     "border-zinc-200 dark:border-zinc-700",
    low:      "border-blue-300 dark:border-blue-800",
    moderate: "border-amber-300 dark:border-amber-800",
    high:     "border-orange-300 dark:border-orange-800",
    critical: "border-red-300 dark:border-red-800",
  };

  const headerBadge = {
    none:     "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600",
    low:      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700",
    moderate: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
    high:     "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700",
    critical: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
  };

  return (
    <Card className={`border-2 ${outerBorder[overallSev]} bg-white dark:bg-zinc-900 shadow-sm`}>
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Resumen ejecutivo</span>
          <Badge className={`text-[10px] py-0.5 px-2.5 font-semibold border ${headerBadge[overallSev]}`}>
            {overallLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map(card => (
            <div
              key={card.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3.5 bg-zinc-50 dark:bg-zinc-800 space-y-2.5 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-base leading-none">{card.icon}</span>
                <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest leading-tight">{card.label}</p>
              </div>

              {card.isGRI ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white">{card.currentScore}</span>
                  {card.showFutureChange && card.futureScore !== card.currentScore && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">→ {card.futureScore}</span>
                  )}
                </div>
              ) : (
                <div>
                  <div className="text-sm font-bold tabular-nums tracking-tight text-zinc-900 dark:text-white">
                    {card.historical} → {card.projected}
                    <span className="text-zinc-400 dark:text-zinc-500 font-normal text-xs ml-1">{card.unit}</span>
                  </div>
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {card.direction} {card.delta}
                  </div>
                </div>
              )}

              <Badge className="text-[10px] py-0.5 px-2 font-semibold bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600" variant="outline">
                {card.severityLabel}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Climate Changes Panel ─────────────────────────────────────────────────────

function ClimateChangesPanel({ engineResult }) {
  if (!engineResult?.signals?.length) {
    if (engineResult?.hasDBData === false) {
      return (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-center space-y-1 bg-white dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Sin datos de proyecciones en la base de datos CMIP6 para esta ubicación.</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Los cambios climáticos detectados requieren cobertura en la grilla histórica.</p>
        </div>
      );
    }
    return null;
  }

  const signals = engineResult.signals.slice(0, 4);

  const SEV_ROW = {
    none:     { bg: "bg-zinc-50 dark:bg-zinc-800", border: "border-zinc-200 dark:border-zinc-700", badge: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600", label: "Sin cambio" },
    low:      { bg: "bg-blue-50 dark:bg-blue-900/30", border: "border-blue-200 dark:border-blue-800", badge: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700", label: "Leve" },
    moderate: { bg: "bg-amber-50 dark:bg-amber-900/30", border: "border-amber-200 dark:border-amber-800", badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700", label: "Moderado" },
    high:     { bg: "bg-orange-50 dark:bg-orange-900/30", border: "border-orange-200 dark:border-orange-800", badge: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200 dark:border-orange-700", label: "Elevado" },
    critical: { bg: "bg-red-50 dark:bg-red-900/30", border: "border-red-200 dark:border-red-800", badge: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700", label: "Crítico" },
  };

  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <ThermometerSun className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Cambios climáticos detectados</span>
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">Histórico (1995–2014) vs. proyectado (2040–2059)</p>
      </CardHeader>
      <CardContent className="space-y-2.5 pb-4">
        {signals.map(signal => {
          const sign = signal.delta >= 0 ? "+" : "";
          const dirArrow = signal.direction === "up" ? "↑" : signal.direction === "down" ? "↓" : "→";
          const row = SEV_ROW[signal.severity] || SEV_ROW.none;

          return (
            <div key={signal.id} className={`rounded-lg border p-3 ${row.bg} ${row.border}`}>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{signal.icon}</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{signal.label}</span>
                </div>
                <Badge className={`text-[10px] py-0 px-2 font-semibold border ${row.badge}`}>
                  {row.label}
                </Badge>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-mono text-sm">
                  <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{signal.historical.toFixed(1)}</span>
                  <span className="text-zinc-300 dark:text-zinc-600">→</span>
                  <span className="tabular-nums font-bold text-zinc-900 dark:text-white">{signal.projected.toFixed(1)}</span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 font-sans ml-0.5">{signal.unit}</span>
                </div>
                <span className="text-xs font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
                  {dirArrow} {sign}{signal.delta?.toFixed(1) || "—"}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Threats Panel ─────────────────────────────────────────────────────────────

function ThreatsPanel({ engineResult, externalRisks }) {
  const griSignals = engineResult?.griSignals || [];
  const threats = formatThreatsForExecutive(griSignals);

  const levelBadge = {
    alto:       "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700",
    medio:      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700",
    bajo:       "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-700",
    "sin data": "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-600",
  };

  if (!threats.length) {
    return (
      <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Exposición a amenazas</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Información insuficiente sobre amenazas climáticas en esta ubicación.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Exposición a amenazas</span>
        </CardTitle>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">Fuente: GRI Infrastructure Resilience</p>
      </CardHeader>
      <CardContent className="space-y-2 pb-4">
        {threats.map(threat => {
          const scoreKey = (threat.currentScore || "sin data").toLowerCase();
          const badgeCls = levelBadge[scoreKey] || levelBadge["sin data"];
          return (
            <div
              key={threat.hazard}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 flex items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg leading-none">{threat.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{threat.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {threat.currentScore}
                    {threat.hasChange && (
                      <span className="ml-1 text-zinc-400 dark:text-zinc-500">→ {threat.futureScore}</span>
                    )}
                  </p>
                </div>
              </div>
              <Badge className={`text-[10px] py-0.5 px-2 font-semibold border flex-shrink-0 ${badgeCls}`}>
                {threat.severityLabel}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Technical Details Panel ───────────────────────────────────────────────────

function TechnicalDetailsPanel({ engineResult }) {
  const [expanded, setExpanded] = useState(false);
  const sections = buildTechnicalDetailsContent(
    engineResult?.signals || [],
    engineResult?.distanceKm
  );

  if (!sections.length) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 flex items-center justify-between gap-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 transition-colors shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Detalles técnicos</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-400 dark:text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <CardContent className="pt-4 space-y-4 pb-4">
            {sections.map((section, idx) => (
              <div key={idx} className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">{section.title}</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">{section.content}</p>
              </div>
            ))}
            <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic">
                Datos exploratorios. Validar las acciones y decisiones con tu equipo técnico.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClimateProjectionsPanel({ data, loading }) {
  if (loading) {
    return (
      <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Consultando contexto climático...
        </CardContent>
      </Card>
    );
  }

  if (!data?.historical_context?.narrative) return null;

  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Contexto climático local</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{data.historical_context.narrative}</p>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2">Fuente: registros históricos locales</p>
      </CardContent>
    </Card>
  );
}

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
        <ul className="space-y-2.5">
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

// ── Signal severity config ────────────────────────────────────────────────────

const SEV_CFG = {
  none:     { label: "Sin cambio",  color: "text-zinc-500 dark:text-zinc-400",     bg: "bg-zinc-50 dark:bg-zinc-800",         border: "border-zinc-200 dark:border-zinc-700", bars: 0, barColor: "bg-zinc-400" },
  low:      { label: "Leve",        color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-900/40",      border: "border-blue-200 dark:border-blue-800", bars: 1, barColor: "bg-blue-500" },
  moderate: { label: "Moderado",    color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-900/40",    border: "border-amber-200 dark:border-amber-800", bars: 2, barColor: "bg-amber-500" },
  high:     { label: "Elevado",     color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/40",  border: "border-orange-200 dark:border-orange-800", bars: 3, barColor: "bg-orange-500" },
  critical: { label: "Crítico",     color: "text-red-600 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-900/40",        border: "border-red-200 dark:border-red-800",   bars: 4, barColor: "bg-red-500" },
};

const OVERALL_CFG = {
  none:     { label: "Sin señales significativas",   badge: "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200" },
  low:      { label: "Señales leves",                badge: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  moderate: { label: "Señales moderadas",            badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  high:     { label: "Señales elevadas",             badge: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  critical: { label: "Señales críticas",             badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

const GRI_SCORE_CFG = {
  alto:       { color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  medio:      { color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  bajo:       { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  "sin data": { color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300" },
};

const HAZARD_ICONS_MAP = {
  flood: "🌊", fluvial: "🏞️", coastal: "🌊", pluvial: "🌧️",
  drought: "☀️", heat: "🌡️", extreme_heat: "🌡️", landslide: "⛰️",
};

// ── SeverityBar ───────────────────────────────────────────────────────────────

function SeverityBar({ level }) {
  const cfg = SEV_CFG[level] || SEV_CFG.none;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`h-1.5 w-3.5 rounded-full ${i <= cfg.bars ? cfg.barColor : "bg-zinc-200 dark:bg-zinc-700"}`} />
      ))}
    </div>
  );
}

// ── SignalCard ────────────────────────────────────────────────────────────────

function SignalCard({ signal }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEV_CFG[signal.severity] || SEV_CFG.none;
  const fmtVal = (v) => v == null ? "—" : (Number.isInteger(v) ? v : v.toFixed(1));
  const sign = signal.delta != null ? (signal.delta >= 0 ? "+" : "") : "";
  const deltaStr = signal.delta != null
    ? `${sign}${fmtVal(signal.delta)} ${signal.unit}`
    : "—";
  const dirArrow = signal.direction === "up" ? "↑" : signal.direction === "down" ? "↓" : "→";

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3.5 flex flex-col gap-2.5 shadow-sm`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base leading-none flex-shrink-0">{signal.icon}</span>
          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest leading-tight">{signal.label}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SeverityBar level={signal.severity} />
          <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
        </div>
      </div>

      {/* Values row */}
      <div className="flex items-end gap-2.5">
        <div className="text-center">
          <p className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 mb-0.5">Histórico</p>
          <p className="text-sm font-bold tabular-nums text-zinc-700 dark:text-zinc-300">{fmtVal(signal.historical)}</p>
        </div>
        <span className="text-zinc-300 dark:text-zinc-600 text-sm pb-0.5">→</span>
        <div className="text-center">
          <p className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 mb-0.5">{signal.period}</p>
          <p className={`text-sm font-bold tabular-nums ${cfg.color}`}>{fmtVal(signal.projected)}</p>
        </div>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 pb-0.5 ml-auto">{signal.unit}</span>
      </div>

      {/* Delta + range */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-mono font-bold ${cfg.color}`}>{dirArrow} {deltaStr}</span>
        {signal.projP10 != null && (
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500 tabular-nums">
            {signal.projP10.toFixed(1)}–{signal.projP90.toFixed(1)} {signal.unit}
          </span>
        )}
      </div>

      {/* Evidence toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-left"
      >
        <span>{expanded ? "▲" : "▼"}</span>
        <span>Fuente · umbral de referencia</span>
      </button>

      {expanded && (
        <div className="space-y-1.5 pt-1.5 border-t border-zinc-200 dark:border-zinc-700">
          <p className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-snug">{signal.detail}</p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 italic leading-snug">{signal.thresholdRef}</p>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Fuente: {signal.source}</p>
        </div>
      )}
    </div>
  );
}

// ── GRIExposureGrid ───────────────────────────────────────────────────────────

function GRIExposureGrid({ signals }) {
  if (!signals.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Exposición GRI · Infraestructura
      </p>
      <div className="flex flex-wrap gap-2">
        {signals.map(s => {
          const cfg = GRI_SCORE_CFG[s.currentScore] || GRI_SCORE_CFG["sin data"];
          const icon = HAZARD_ICONS_MAP[s.hazard] || "⚠️";
          return (
            <div key={s.hazard} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.color}`}>
              <span>{icon}</span>
              <span>{s.name}</span>
              {s.futureScore && s.futureScore !== s.currentScore && (
                <span className="opacity-70 text-[10px] ml-0.5">→ {s.futureScore}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
        ISIMIP · Aqueduct · JRC Flood — probabilidad de ocurrencia histórica y escenarios futuros.
      </p>
    </div>
  );
}

// ── ClimateEnginePanel ────────────────────────────────────────────────────────

function ClimateEnginePanel({ result, loading, error }) {
  if (loading) {
    return (
      <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
        <CardContent className="py-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Consultando base de datos climática...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-900/40 dark:border-amber-800">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="text-xs text-amber-900 dark:text-amber-200">{error}</AlertDescription>
      </Alert>
    );
  }

  if (!result || (!result.signals.length && !result.griSignals.length)) return null;

  const overallCfg = OVERALL_CFG[result.overallSeverity] || OVERALL_CFG.none;

  return (
    <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Análisis climático cuantitativo</span>
            </CardTitle>
            <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">
              Señales derivadas de evidencia numérica · deltas histórico → proyectado
            </p>
          </div>
          <Badge className={`${overallCfg.badge} border-0 text-[10px] py-0.5 px-2.5 font-semibold flex-shrink-0 whitespace-nowrap`}>
            {overallCfg.label}
          </Badge>
        </div>

        {(result.scenario || result.distanceKm != null) && (
          <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
            {result.scenario && (
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                {result.scenario}
              </span>
            )}
            {result.distanceKm != null && (
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Punto DB más cercano: {result.distanceKm.toFixed(1)} km
              </span>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-5 pb-4">
        {result.signals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.signals.map(signal => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        ) : result.hasDBData ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No se detectaron cambios por encima de los umbrales de referencia para esta ubicación.
          </p>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-center space-y-1">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Sin datos en la grilla climática CMIP6 para esta ubicación.</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Las señales cuantitativas requieren cobertura en la base de datos histórica.</p>
          </div>
        )}

        {result.griSignals.length > 0 && (
          <>
            {result.signals.length > 0 && <div className="border-t border-zinc-200 dark:border-zinc-700" />}
            <GRIExposureGrid signals={result.griSignals} />
          </>
        )}

        {result.hasDBData && result.distanceKm != null && result.distanceKm > 30 && (
          <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/40">
            <AlertTriangle className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <AlertDescription className="text-xs text-blue-900 dark:text-blue-200">
              El punto de datos más cercano está a {result.distanceKm.toFixed(0)} km. Las señales son orientativas para esta ubicación específica.
            </AlertDescription>
          </Alert>
        )}

        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
          {result.signals.length} indicadores evaluados · ensemble CMIP6 · umbrales IPCC AR6 / WRI / World Bank CKP.
        </p>
      </CardContent>
    </Card>
  );
}

function AIPanel({ externalRisks, climateTrends, docContext, executiveSummary }) {
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
${executiveSummary ? `Resumen ejecutivo observado:
${executiveSummary}

` : ""}${docSection}
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
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-start">
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
        <Button className="w-full gap-2" size="sm" onClick={handleGenerate} disabled={loading}>
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Analizando con IA...</>
            : <><Sparkles className="w-4 h-4" />Generar recomendaciones</>}
        </Button>
      ) : (
        <div className="space-y-3">
          {executiveSummary && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Resumen base</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{executiveSummary}</p>
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Resultado de IA</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Lenguaje claro, accionable y enfocado en el riesgo operacional</p>
              </div>
              <span className="rounded-full bg-primary/15 dark:bg-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary">IA</span>
            </div>

            <div className="text-sm leading-6 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
              {text}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => setText(null)}>
              Regenerar
            </Button>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              El resultado es una interpretación automática. Valida las acciones con tu equipo técnico.
            </p>
          </div>
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

  const [dbClimate, setDbClimate]   = useState(null);
  const [dbLoading, setDbLoading]   = useState(false);

  const [territorialCtx, setTerritorialCtx] = useState(null);
  const [docContext, setDocContext]         = useState(null);

  // Contexto Banco Mundial + catálogo de documentos: se cargan una sola vez al iniciar
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
    setExternalRisks(null);
    setClimateTrends(null);
    setDbClimate(null);
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
    setDbLoading(true);
    setExternalRisks(null);
    setClimateTrends(null);
    setDbClimate(null);
    setExternalError(null);
    setMarkerPos([latNum, lngNum]);
    setFlyTarget({ pos: [latNum, lngNum], zoom: 14 });

    try {
      const [griResult, trendsResult, dbResult] = await Promise.allSettled([
        fetchExternalRisks(latNum, lngNum),
        fetchClimateTrends(latNum, lngNum),
        fetchClimateDB(latNum, lngNum),
      ]);

      if (griResult.status === "fulfilled") {
        setExternalRisks(griResult.value);
      } else {
        setExternalError(griResult.reason?.message || "Servicio GRI no disponible");
      }

      if (trendsResult.status === "fulfilled") {
        setClimateTrends(trendsResult.value);
      }

      if (dbResult.status === "fulfilled" && dbResult.value) {
        setDbClimate(dbResult.value);
      }
    } finally {
      setLoading(false);
      setExternalLoading(false);
      setTrendsLoading(false);
      setDbLoading(false);
    }
  };

  const hasResults = !!(externalRisks || climateTrends || dbClimate);
  const engineResult = hasResults ? runClimateEngine(dbClimate, externalRisks) : null;
  const executiveSummary = hasResults
    ? summarizeClimateLocation(externalRisks, climateTrends, territorialCtx)
    : null;

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
                  setDbClimate(null);
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

          {/* Motor de análisis: paneles ejecutivos */}
          {hasResults && (
            <>
              <ExecutiveSummaryPanel engineResult={engineResult} />
              <ClimateChangesPanel engineResult={engineResult} />
              <ThreatsPanel engineResult={engineResult} externalRisks={externalRisks} />
              <TechnicalDetailsPanel engineResult={engineResult} />
            </>
          )}

          {/* Contexto territorial Banco Mundial */}
          <TerritorialContextPanel data={territorialCtx} />

          {/* 4. Recomendaciones IA */}
          {hasResults && (
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <AIPanel
                  externalRisks={externalRisks}
                  climateTrends={climateTrends}
                  docContext={docContext}
                  executiveSummary={executiveSummary}
                />
              </CardContent>
            </Card>
          )}

          {/* Estado vacío */}
          {!hasResults && !loading && !externalLoading && !trendsLoading && !territorialCtx && (
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
