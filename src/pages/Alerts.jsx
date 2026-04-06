import { useState, useEffect } from "react";
import { alerts as alertsData } from "@/data/alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info, Zap, CheckCircle, Bell } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const severityConfig = {
  critical: { icon: Zap, label: "Crítica", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  warning: { icon: AlertTriangle, label: "Advertencia", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  info: { icon: Info, label: "Información", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
};

const typeLabels = {
  sismo: "Sismo",
  inundacion: "Inundación",
  elnino: "El Niño",
  deslizamiento: "Deslizamiento",
  sequia: "Sequía",
};

export default function Alerts() {
  const [dismissedIds, setDismissedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const dismissAlert = (id) => {
    setDismissedIds(prev => [...prev, id]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const active = alertsData.filter((a) => !dismissedIds.includes(a.id));
  const dismissed = alertsData.filter((a) => dismissedIds.includes(a.id));

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {active.length} alertas activas · {dismissed.length} archivadas
        </p>
      </div>

      {/* Active Alerts */}
      <div className="space-y-3">
        {active.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Sin alertas activas</p>
          </div>
        )}
        {active.map((alert) => {
          const config = severityConfig[alert.severity] || severityConfig.info;
          const Icon = config.icon;
          return (
            <div
              key={alert.id}
              className={cn("bg-card border rounded-xl p-5", config.border)}
            >
              <div className="flex items-start gap-4">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", config.bg)}>
                  <Icon className={cn("w-5 h-5", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{alert.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={cn("text-[10px]", config.bg, config.color, config.border)}>
                          {config.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {typeLabels[alert.type] || alert.type}
                        </Badge>
                        {alert.source && (
                          <span className="text-[10px] text-muted-foreground">Fuente: {alert.source}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissAlert(alert.id)}
                      className="flex-shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Archivar
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{alert.description}</p>
                  {alert.region && (
                    <p className="text-xs text-muted-foreground mt-1">Región: {alert.region}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-2">
                    {alert.created_date ? format(new Date(alert.created_date), "dd MMM yyyy, HH:mm", { locale: es }) : "—"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dismissed */}
      {dismissed.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Alertas Archivadas ({dismissed.length})
          </h2>
          <div className="space-y-2">
            {dismissed.slice(0, 10).map((alert) => (
              <div key={alert.id} className="bg-card/50 border border-border rounded-lg p-3 opacity-60">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm">{alert.title}</p>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {alert.created_date ? format(new Date(alert.created_date), "dd/MM/yy") : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}