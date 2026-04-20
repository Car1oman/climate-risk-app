import { useState, useCallback, useRef, useEffect } from "react";
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
  Building2, Plus,
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

// Variables de calor y precipitación del CCKP / CMIP6
const RISK_GROUPS = {
  calor: {
    id: "calor",
    label: "Riesgo de Calor",
    emoji: "🌡️",
    // txx, hd35, hd30, tasmax, tr, tas, tx84rr
    variables: ["txx", "hd35", "hd30", "tasmax", "tr", "tas", "tx84rr"],
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
    // rx1day, rx5day, r20mm, r50mm, pr, prpercnt
    variables: ["rx1day", "rx5day", "r20mm", "r50mm", "pr", "prpercnt"],
    impacts: [
      "Inundaciones que interrumpen operaciones por 7–45 días según severidad (daños estructurales S/ 80–200/m²)",
      "Corte de acceso logístico (proveedores, distribución) ante lluvias extremas o desborde de ríos",
      "Pérdida de inventario por daños por agua en almacenes y pisos de venta bajos",
      "Mayor variabilidad en cadena de suministro por disrupciones en zonas proveedoras",
    ],
  },
};

// Metadatos de cada variable climática (CMIP6 · CCKP)
const VARIABLE_META = {
  // Calor
  txx:      { label: "Temp. máx. extrema",      desc: "Temperatura máxima diaria más alta del año (°C)" },
  hd35:     { label: "Días calurosos (>35 °C)",  desc: "Días al año con temperatura máxima superior a 35 °C" },
  hd30:     { label: "Días cálidos (>30 °C)",    desc: "Días al año con temperatura máxima superior a 30 °C" },
  tasmax:   { label: "Temp. máx. media anual",   desc: "Promedio anual de temperaturas máximas diarias (°C)" },
  tr:       { label: "Noches tropicales",        desc: "Noches al año con temperatura mínima superior a 20 °C" },
  tas:      { label: "Temperatura media",        desc: "Temperatura media superficial del aire (°C)" },
  tx84rr:   { label: "Índice mortalidad calor",  desc: "Exceso de mortalidad estimada por calor extremo (índice)" },
  // Precipitación
  rx1day:   { label: "Lluvia extrema (1 día)",   desc: "Mayor precipitación acumulada en un solo día del año (mm)" },
  rx5day:   { label: "Lluvia extrema (5 días)",  desc: "Mayor precipitación en 5 días consecutivos (mm)" },
  r20mm:    { label: "Días lluvia intensa",       desc: "Días al año con precipitación superior a 20 mm" },
  r50mm:    { label: "Días lluvia severa",        desc: "Días al año con precipitación superior a 50 mm" },
  pr:       { label: "Precipitación media",       desc: "Precipitación total media acumulada del período (mm)" },
  prpercnt: { label: "Cambio precipitación",      desc: "Porcentaje relativo al histórico (100% = sin cambio)" },
};

// Etiquetas de horizonte temporal
const HORIZON_INFO = {
  historico: { label: "¿Cómo fue?",                  period: "1995–2014", ringColor: "ring-slate-400/40",  textColor: "text-slate-500",  bg: "bg-slate-500/10" },
  corto:     { label: "Corto plazo",                  period: "2020–2039", ringColor: "ring-blue-400/40",   textColor: "text-blue-500",   bg: "bg-blue-500/10"  },
  mediano:   { label: "Mediano plazo",                period: "2040–2059", ringColor: "ring-amber-400/40",  textColor: "text-amber-600",  bg: "bg-amber-500/10" },
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

function SearchPanel({ onLocationSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [registerForm, setRegisterForm] = useState({ name: '', unidad_negocio: '' });
  const [registering, setRegistering] = useState(false);
  const debounceRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setShowResults(true);
        }
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectResult = (r) => {
    onLocationSelect(r.lat, r.lng);
    setQuery(r.tipo === 'asset' ? r.name : r.direccion);
    setShowResults(false);
    setSelectedPlace(r.tipo === 'place' ? r : null);
    setRegisterForm({ name: '', unidad_negocio: '' });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!registerForm.name.trim()) { toast.error('El nombre del activo es requerido'); return; }
    setRegistering(true);
    try {
      const res = await fetch(`${API_URL}/api/places/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place_id: selectedPlace.id,
          name: registerForm.name,
          unidad_negocio: registerForm.unidad_negocio,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success('Activo registrado correctamente');
      setRegisterForm({ name: '', unidad_negocio: '' });
      setSelectedPlace(null);
      // Refrescar resultados
      const fresh = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
      if (fresh.ok) { setResults(await fresh.json()); setShowResults(true); }
    } catch (err) {
      toast.error(err.message || 'Error al registrar el activo');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="space-y-3" ref={panelRef}>
      <div className="relative">
        <Label className="text-xs text-muted-foreground">Buscar por nombre o dirección</Label>
        <div className="relative mt-1.5">
          {searching ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          )}
          <Input
            className="pl-9"
            placeholder="Ej. Plaza Vea San Isidro o Av. Javier Prado..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
          />
        </div>

        {/* Dropdown de resultados */}
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
                  {r.tipo === 'asset'
                    ? <Building2 className="w-4 h-4 text-blue-500" />
                    : <MapPin className="w-4 h-4 text-amber-500" />}
                </span>
                <div className="flex-1 min-w-0">
                  {r.tipo === 'asset' ? (
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

      {/* Formulario de registro de activo */}
      {selectedPlace && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                No hay activos registrados aquí
              </p>
              <p className="text-[11px] text-amber-700/70 dark:text-amber-400/60 mt-0.5 leading-snug">
                {selectedPlace.direccion}
              </p>
            </div>
          </div>

          <form onSubmit={handleRegister} className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nombre del activo *</Label>
              <Input
                placeholder="Ej. Plaza Vea San Isidro"
                value={registerForm.name}
                onChange={(e) => setRegisterForm(f => ({ ...f, name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Unidad de negocio</Label>
              <Input
                placeholder="Ej. Supermercados"
                value={registerForm.unidad_negocio}
                onChange={(e) => setRegisterForm(f => ({ ...f, unidad_negocio: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="flex-1 h-8 text-xs gap-1.5" disabled={registering}>
                {registering
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Registrando...</>
                  : <><Plus className="w-3.5 h-3.5" />Registrar activo</>}
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

function ScenarioSelector({ value, onChange, disabled }) {
  const opts = [
    { id: "actual",    icon: "📍", label: "Actual",    sub: "Histórico 1995–2014" },
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

// Formatear número: entero si no tiene decimales, 2 dec. si los tiene
const fmtVal = (v) =>
  v == null ? "—" : v % 1 === 0 ? String(v) : v.toFixed(2);

function VariableRow({ record }) {
  const levelCfg = getLevelCfg(record.level);
  const t = record.baseline ? trend(record.value, record.baseline.value) : null;

  // Solo mostrar delta si hay cambio real (evita Minus 0.00 en histórico)
  const showTrend = t != null && Math.abs(t.delta) > 0.001;
  const TrendIcon = !showTrend ? null : t.delta > 0 ? TrendingUp : TrendingDown;
  const trendColor = !showTrend ? "" : t.delta > 0 ? "text-red-400" : "text-emerald-400";

  // Mostrar rango p10–p90 solo si difieren del valor mediano
  const hasRange = record.p10 != null && record.p90 != null
    && !(record.p10 === record.value && record.p90 === record.value);

  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/40 last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${levelCfg.dot}`} />

      {/* Etiqueta y descripción */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium">{record.varMeta.label}</span>
          <Badge className={`text-[10px] px-1.5 py-0 ${levelCfg.color}`}>{levelCfg.label}</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{record.varMeta.desc}</p>
      </div>

      {/* Valores */}
      <div className="text-right flex-shrink-0 space-y-0.5 min-w-[80px]">
        {/* Mediana */}
        {record.value != null && (
          <div className="text-xs font-mono font-semibold text-foreground/85">
            {fmtVal(record.value)} <span className="font-normal text-muted-foreground">{record.unit}</span>
          </div>
        )}

        {/* Rango p10–p90 (incertidumbre del ensemble) */}
        {hasRange && (
          <div className="text-[10px] text-muted-foreground/65 font-mono">
            {fmtVal(record.p10)} – {fmtVal(record.p90)}
          </div>
        )}

        {/* Delta vs histórico */}
        {showTrend && TrendIcon && (
          <div className={`flex items-center justify-end gap-0.5 text-[10px] ${trendColor}`}>
            <TrendIcon className="w-2.5 h-2.5" />
            {t.delta > 0 ? "+" : ""}{fmtVal(t.delta)} {record.unit} vs. hist.
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

  // Ícono de reloj por horizonte
  const horizonIcon = { historico: "📋", corto: "📅", mediano: "🔭" }[horizon] ?? "📊";

  return (
    <div className={`rounded-xl ring-1 ${hInfo.ringColor} overflow-hidden`}>
      <div className={`${hInfo.bg} px-4 py-3 flex items-center gap-2.5`}>
        <span className="text-base">{horizonIcon}</span>
        <div>
          <span className={`text-sm font-bold ${hInfo.textColor}`}>{hInfo.label}</span>
          {hInfo.period && (
            <span className="text-xs text-muted-foreground ml-2">{hInfo.period}</span>
          )}
          {horizon !== "historico" && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Los valores muestran la mediana del ensemble · el rango (p10–p90) indica la incertidumbre proyectada
            </p>
          )}
        </div>
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
              {/* Búsqueda híbrida */}
              <SearchPanel
                onLocationSelect={(newLat, newLng) => {
                  setLat(String(newLat));
                  setLng(String(newLng));
                  setMarkerPos([newLat, newLng]);
                  setResults(null);
                  setNoData(false);
                }}
              />

              <div className="border-t border-border/50" />

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
                  <AlertDescription className="text-xs space-y-1">
                    <div>
                      <span className="font-semibold">
                        {results.horizons.length} período{results.horizons.length !== 1 ? "s" : ""},&nbsp;
                        {Object.values(results.byHorizon).flat().length} indicadores
                      </span>
                      {" "}para ({results.queried.lat}, {results.queried.lng})
                    </div>
                    <div className="text-muted-foreground">
                      Celda CMIP6 más cercana:{" "}
                      <span className="font-mono">{results.nearestPoint.lat}, {results.nearestPoint.lng}</span>
                      {" "}· <span className="font-semibold text-foreground">{results.nearestPoint.distanceKm} km</span>
                    </div>
                    <div className="text-muted-foreground">
                      Escenario:{" "}
                      <span className="font-medium text-foreground">{results.scenarioMeta?.label}</span>
                      {" "}— {results.scenarioMeta?.sublabel}
                    </div>
                    <div className="text-muted-foreground/70 text-[10px]">
                      Fuente: World Bank CCKP · CMIP6 ensemble-all · resolución 0.25°
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
