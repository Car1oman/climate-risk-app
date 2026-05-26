import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";

const PAGE_TITLES = {
  "/":                   { title: "Consulta de Riesgos Climáticos", sub: "Banco Mundial · CMIP6 · SSP" },
  "/climate-risk-lookup":{ title: "Consulta de Riesgos Climáticos", sub: "Banco Mundial · CMIP6 · SSP" },
};

export default function TopBar() {
  const location = useLocation();
  const page = PAGE_TITLES[location.pathname] || { title: "ClimateRisk", sub: "Intercorp Retail" };

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
      {/* Título de página */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Globe className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none truncate">{page.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">{page.sub}</p>
        </div>
      </div>

      {/* Acciones derecha */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5 text-muted-foreground hidden sm:flex">
          v1.0 · MVP
        </Badge>
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">IR</span>
        </div>
      </div>
    </header>
  );
}
