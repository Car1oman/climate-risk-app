export const HAZARD_WEIGHTS = {
  hazard_flood: 0.30,
  hazard_elnino: 0.25,
  hazard_earthquake: 0.20,
  hazard_landslide: 0.15,
  hazard_drought: 0.10,
};

export const TYPE_FACTOR = {
  supermercado_grande: 1.0,
  supermercado_mediano: 0.8,
  centro_distribucion: 1.2,
  tienda_express: 0.6,
};

export const HAZARD_LABELS = {
  hazard_flood: "Inundación Fluvial",
  hazard_elnino: "Fenómeno El Niño",
  hazard_earthquake: "Sismo",
  hazard_landslide: "Deslizamiento",
  hazard_drought: "Sequía Hídrica",
};

// Temporal planning horizon per hazard
export const HORIZON = {
  hazard_flood: "corto",
  hazard_elnino: "corto",
  hazard_earthquake: "largo",
  hazard_landslide: "medio",
  hazard_drought: "medio",
};

// Horizon display labels (years range)
export const HORIZON_LABELS = {
  corto: "0–2 años",
  medio: "2–10 años",
  largo: "10–50 años",
};

// CSS classes for each risk level
export function getRiskColor(level) {
  switch (level) {
    case "critico": return { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", dot: "bg-red-500" };
    case "alto":    return { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-500" };
    case "medio":   return { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-500" };
    case "bajo":    return { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-500" };
    default:        return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", dot: "bg-muted-foreground" };
  }
}
