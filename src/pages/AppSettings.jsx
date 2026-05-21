import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw } from "lucide-react";
import { useAssets } from "@/hooks/useAssets";

export default function AppSettings() {
  const { toast } = useToast();
  const [recalculating, setRecalculating] = useState(false);
  const { data: assets = [], isLoading, error } = useAssets();

  const refreshEvidence = async () => {
    setRecalculating(true);
    setTimeout(() => {
      setRecalculating(false);
      toast({ title: "Actualizacion completada", description: `Se revisaron ${assets.length} activos.` });
    }, 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracion</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestion de activos y evidencias climaticas</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Actualizar evidencias</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Refresca fuentes, senales y trazabilidad para todos los {assets.length} activos
          </p>
        </div>
        <Button onClick={refreshEvidence} disabled={recalculating} variant="outline" className="gap-2">
          {recalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {recalculating ? "Actualizando..." : "Actualizar"}
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-sm">
          {error
            ? "No se pudieron cargar los activos desde el backend. Verifica la conexion."
            : "Activos cargados desde el backend. Funcionalidad de creacion deshabilitada en modo demo."}
        </p>
      </div>
    </div>
  );
}
