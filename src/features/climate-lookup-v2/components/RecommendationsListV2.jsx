import { Card, CardContent } from "@/components/ui/card";
import { ListChecks } from "lucide-react";

export default function RecommendationsListV2({ recommendations }) {
  const list = recommendations || [];
  if (list.length === 0) return null;

  return (
    <Card className="border-border">
      <CardContent className="pt-4 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
          Recomendaciones
        </div>
        <ul className="space-y-2">
          {list.map((rec, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span className="w-1 h-1 rounded-full bg-primary mt-2 flex-shrink-0" aria-hidden="true" />
              {rec}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
