import { useState, useEffect } from "react";
import { fetchAssets } from "@/lib/api";
import { getRiskColor, formatCurrency } from "@/lib/riskEngine";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Building2, MapPin, ChevronRight, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const TYPE_LABELS = {
  supermercado_grande: "Supermercado Grande",
  supermercado_mediano: "Supermercado Mediano",
  centro_distribucion: "Centro de Distribución",
  tienda_express: "Tienda Express",
};

const RISK_LABELS = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
};

export default function Assets() {
  const [isLoading, setIsLoading] = useState(true);
  const [assetsList, setAssetsList] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadAssets = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchAssets();
        setAssetsList(Array.isArray(data) ? data : []);
      } catch (fetchError) {
        setAssetsList([]);
        setError('No se pudieron cargar activos desde el servidor. Intenta recargar la página.');
      } finally {
        setIsLoading(false);
      }
    };

    loadAssets();
  }, []);

  const filtered = assetsList.filter((a) => {
    const matchSearch = !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.district?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || a.type === typeFilter;
    const matchRisk = riskFilter === "all" || a.risk_level === riskFilter;
    return matchSearch && matchType && matchRisk;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {assetsList.length} activos registrados en el portafolio
        </p>
        {error && (
          <p className="text-xs text-orange-500 mt-2">{error}</p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o distrito..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48 bg-card">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-40 bg-card">
            <SelectValue placeholder="Riesgo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            {Object.entries(RISK_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Asset list */}
      <div className="space-y-2">
        {filtered.map((asset) => {
          const rc = getRiskColor(asset.risk_level);
          return (
            <Link
              key={asset.id}
              to={`/assets/${asset.id}`}
              className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", rc.bg)}>
                  <Building2 className={cn("w-4 h-4", rc.text)} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                    {asset.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{asset.district}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABELS[asset.type] || asset.type}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-muted-foreground">Impacto</p>
                  <p className="text-sm font-mono font-semibold">{formatCurrency(asset.financial_impact || 0)}</p>
                </div>
                <Badge variant="outline" className={cn("text-xs px-2.5 py-1", rc.bg, rc.text, rc.border)}>
                  {((asset.risk_score || 0) * 100).toFixed(0)}
                </Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No se encontraron activos</p>
          </div>
        )}
      </div>
    </div>
  );
}