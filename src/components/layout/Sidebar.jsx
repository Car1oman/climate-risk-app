import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Map,
  Building2,
  Waves,
  Bell,
  FileText,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Database,
  CloudUpload,
  Lock,
  SearchCheck,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const mvpNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Map, label: "Mapa de Riesgos", path: "/map" },
  { icon: Building2, label: "Activos", path: "/assets" },
  { icon: SearchCheck, label: "Consulta de Riesgos", path: "/climate-risk-lookup" },
  { icon: Database, label: "Gestión de Datos", path: "/data-management" },
  { icon: CloudUpload, label: "Datos Climáticos", path: "/climate-upload" },
  { icon: Settings, label: "Configuración", path: "/settings" },
];

const comingSoonItems = [
  { icon: Waves, label: "Simulador El Niño" },
  { icon: Bell, label: "Alertas" },
  { icon: FileText, label: "Reporte TCFD" },
];

export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "h-screen sticky top-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 z-50",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-sidebar-foreground tracking-tight">ClimateRisk</p>
              <p className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase">Intercorp</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {/* MVP items */}
          {mvpNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-primary")} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right">{item.label}</TooltipContent>
                )}
              </Tooltip>
            );
          })}

          {/* Próximamente section */}
          <div className={cn("pt-3", !collapsed && "px-1")}>
            {!collapsed && (
              <div className="flex items-center gap-1.5 mb-2 px-2">
                <Lock className="w-3 h-3 text-muted-foreground/50" />
                <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/50">
                  Próximamente
                </span>
              </div>
            )}
            {collapsed && <div className="border-t border-sidebar-border mb-2" />}

            {comingSoonItems.map((item) => (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-not-allowed opacity-40 select-none"
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {collapsed ? item.label + " — " : ""}Disponible en versión 2
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="m-2 p-2 rounded-lg hover:bg-sidebar-accent text-muted-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>
    </TooltipProvider>
  );
}
