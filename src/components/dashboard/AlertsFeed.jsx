import { cn } from "@/lib/utils";
import { AlertTriangle, Info, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const severityConfig = {
  critical: { icon: Zap, color: "text-red-400", bg: "bg-red-500/10" },
  warning: { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10" },
};

export default function AlertsFeed({ alerts }) {
  const active = alerts.filter((a) => a.is_active !== false).slice(0, 5);

  if (active.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Alertas Recientes
        </h3>
        <p className="text-sm text-muted-foreground text-center py-6">Sin alertas activas</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Alertas Recientes
      </h3>
      <div className="space-y-3">
        {active.map((alert) => {
          const config = severityConfig[alert.severity] || severityConfig.info;
          const Icon = config.icon;
          return (
            <div key={alert.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", config.bg)}>
                <Icon className={cn("w-3.5 h-3.5", config.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.description}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  {alert.created_date
                    ? formatDistanceToNow(new Date(alert.created_date), { addSuffix: true, locale: es })
                    : "reciente"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}