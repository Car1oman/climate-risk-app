import * as React from "react";
import {
  Shield,
  SearchCheck,
  LayoutDashboard,
  Map,
  GitCompareArrows,
  Activity,
  FileText,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FlaskConical,
} from "lucide-react";

const V1_ITEMS = [
  { icon: SearchCheck, label: "Consulta de Riesgos", path: "/" },
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Map, label: "Mapa de Riesgos", path: "/map" },
];

const V2_ITEMS = [
  { icon: FlaskConical, label: "Análisis de Riesgo", path: "/v2/" },
  { icon: GitCompareArrows, label: "Comparación v1 vs v2", path: "/v2/comparison" },
];

const RESOURCE_ITEMS = [
  { icon: BookOpen, label: "Stage Guide", path: "/v2/resources/stage-guide" },
  { icon: FileText, label: "Especificación", path: "/v2/resources/spec" },
];

function NavSection({ title, items, activePath, onNavigate, variant }) {
  const isV1 = variant === "v1";
  return (
    <div className="mb-4">
      <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = activePath === item.path;
          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className={`
                flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs font-medium
                transition-all duration-150 text-left
                ${isActive
                  ? isV1
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-primary/10 text-primary"
                  : "text-muted-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"}
              `}
            >
              <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {isV1 && (
                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted/50 text-muted-foreground/50">
                  v1
                </span>
              )}
              {isV1 && !isActive && (
                <ExternalLink className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function V2Sidebar({ activePath, onNavigate, collapsed, onToggleCollapse }) {
  return (
    <aside
      className={`
        h-screen sticky top-0 flex flex-col bg-sidebar border-r border-sidebar-border
        transition-all duration-300 z-50 flex-shrink-0
        ${collapsed ? "w-14" : "w-56"}
      `}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 h-14 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center flex-shrink-0">
          <FlaskConical className="w-3.5 h-3.5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-sidebar-foreground tracking-tight truncate">
                ClimateRisk
              </p>
              <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-primary/20 text-primary font-semibold flex-shrink-0">
                v2
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground font-medium tracking-wider uppercase truncate">
              Pipeline Rebuild
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {!collapsed && (
          <>
            <NavSection
              title="Sistema Actual (v1)"
              items={V1_ITEMS}
              activePath={activePath}
              onNavigate={onNavigate}
              variant="v1"
            />

            <div className="my-3 mx-3 border-t border-sidebar-border" />

            <NavSection
              title="Nuevo Pipeline (v2)"
              items={V2_ITEMS}
              activePath={activePath}
              onNavigate={onNavigate}
              variant="v2"
            />

            <div className="my-3 mx-3 border-t border-sidebar-border" />

            <NavSection
              title="Recursos"
              items={RESOURCE_ITEMS}
              activePath={activePath}
              onNavigate={onNavigate}
              variant="v2"
            />
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="m-2 p-2 rounded-lg hover:bg-sidebar-accent text-muted-foreground transition-colors flex-shrink-0"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
