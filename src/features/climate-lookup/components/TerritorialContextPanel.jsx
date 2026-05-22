// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe2 } from "lucide-react";

export default function TerritorialContextPanel({ data }) {
  if (!data?.narrative?.length) return null;

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-foreground">Contexto del territorio</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Fuente: Banco Mundial · indicadores socioeconómicos de Perú</p>
      </CardHeader>
      <CardContent className="pb-4">
        <ul className="space-y-2">
          {data.narrative.map((msg, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-secondary-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
              {msg}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
