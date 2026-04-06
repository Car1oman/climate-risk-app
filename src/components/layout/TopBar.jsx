import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { alerts } from "@/data/alerts";

export default function TopBar() {
  const activeCount = alerts.filter(a => a.is_active !== false).length;

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar activos, distritos..."
          className="border-0 bg-transparent shadow-none h-8 text-sm placeholder:text-muted-foreground/50 focus-visible:ring-0"
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Bell className="w-4 h-4 text-muted-foreground" />
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-destructive rounded-full flex items-center justify-center">
              <span className="text-[9px] font-bold text-white">{activeCount}</span>
            </span>
          )}
        </div>
        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-xs font-semibold text-primary">IR</span>
        </div>
      </div>
    </header>
  );
}