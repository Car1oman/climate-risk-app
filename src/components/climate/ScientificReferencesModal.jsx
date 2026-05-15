import { AlertTriangle, BookOpen, ExternalLink, Library } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const REFERENCES = [
  {
    name: "IPCC AR6",
    doi: "10.1017/9781009157896 / 10.1017/9781009325844",
    url: "https://www.ipcc.ch/assessment-report/ar6/",
    confidence: "muy alta",
    description: "Evaluación científica internacional sobre cambio climático, impactos, adaptación y escenarios.",
    limitation: "No sustituye estudios locales de ingeniería o diseño de activos.",
  },
  {
    name: "CMIP6",
    doi: "10.5194/gmd-9-1937-2016",
    url: "https://www.wcrp-climate.org/wgcm-cmip/wgcm-cmip6",
    confidence: "alta",
    description: "Experimento multimodelo coordinado por WCRP usado para comparar escenarios climáticos.",
    limitation: "Tiene incertidumbre por resolución, sesgo de modelos e influencia de variabilidad interna.",
  },
  {
    name: "WRI Aqueduct",
    doi: "10.46830/writn.23.00061",
    url: "https://www.wri.org/aqueduct",
    confidence: "alta",
    description: "Marco global para estrés hídrico, sequía, inundación y riesgos relacionados con agua.",
    limitation: "Indicadores globales no capturan toda la infraestructura hidráulica local.",
  },
  {
    name: "World Bank Open Data",
    doi: "No aplica a nivel API",
    url: "https://data.worldbank.org/",
    confidence: "alta",
    description: "Indicadores oficiales de contexto socioeconómico y territorial.",
    limitation: "Escala país; puede no representar vulnerabilidad puntual del activo.",
  },
  {
    name: "NOAA ENSO",
    doi: "Producto operativo sin DOI general",
    url: "https://www.climate.gov/enso",
    confidence: "alta",
    description: "Monitoreo oficial de El Niño/Oscilación del Sur y condiciones del Pacífico tropical.",
    limitation: "ENSO modula riesgos regionales, pero no predice impactos locales exactos.",
  },
  {
    name: "GRI / GIRI Infrastructure Resilience",
    doi: "Portal público sin DOI general",
    url: "https://giri.unepgrid.ch/faq",
    confidence: "media-alta",
    description: "Modelo probabilístico global de riesgo y resiliencia para infraestructura.",
    limitation: "Debe complementarse con datos de construcción, operación y protección del activo.",
  },
  {
    name: "Open-Meteo Climate API",
    doi: "API sin DOI; atribución a CMIP6/HighResMIP",
    url: "https://open-meteo.com/en/docs/climate-api",
    confidence: "media-alta",
    description: "API climática programática para variables proyectadas y derivadas.",
    limitation: "Depende del modelo, downscaling y disponibilidad de variables solicitadas.",
  },
  {
    name: "Copernicus / ERA5",
    doi: "10.5194/essd-12-2097-2020",
    url: "https://climate.copernicus.eu/climate-reanalysis",
    confidence: "alta",
    description: "Reanálisis climático europeo para contexto histórico y meteorológico.",
    limitation: "Reanálisis modelado-asimilado; no equivale a medición de estación local.",
  },
  {
    name: "SENAMHI Perú",
    doi: "Depende del producto publicado",
    url: "https://www.senamhi.gob.pe/",
    confidence: "alta si está integrado",
    description: "Autoridad meteorológica e hidrológica oficial del Perú.",
    limitation: "En esta versión se documenta como referencia nacional; no implica integración activa si no aparece en metadata.",
  },
];

/**
 * @param {{ item: { name: string, doi: string, url: string, confidence: string, description: string, limitation: string } }} props
 */
function ReferenceRow({ item }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">DOI: {item.doi}</p>
        </div>
        <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          {item.confidence}
        </Badge>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">{item.description}</p>
      <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        Limitación: {item.limitation}
      </p>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
      >
        Fuente oficial <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

/** @returns {JSX.Element} */
export default function ScientificReferencesModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
          <Library className="w-3.5 h-3.5" />
          Ver referencias metodológicas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-4 h-4 text-blue-500" />
            Referencias científicas y bibliografía formal
          </DialogTitle>
          <DialogDescription>
            Respaldo institucional usado para interpretar fuentes, escenarios, incertidumbre y limitaciones metodológicas.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
              Interpretación técnica
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
              El sistema usa modelos probabilísticos y escenarios climáticos. No entrega predicciones exactas:
              estima señales de riesgo bajo supuestos SSP, datos observados/reanalizados y fuentes institucionales.
              El análisis sigue estándares internacionales y debe complementarse con estudios locales cuando se use
              para decisiones de inversión, ingeniería o cumplimiento regulatorio.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {REFERENCES.map((item) => (
            <ReferenceRow key={item.name} item={item} />
          ))}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Disclaimers técnicos</p>
          <ul className="space-y-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            <li>La incertidumbre climática proviene de variabilidad interna, diferencias entre modelos y trayectorias socioeconómicas.</li>
            <li>La resolución espacial puede suavizar microclimas, drenaje urbano, pendientes locales y exposición real del activo.</li>
            <li>SSP245 y SSP585 no son pronósticos; son escenarios comparables para evaluar sensibilidad climática.</li>
            <li>Los resultados no modifican scores por sí mismos; la bibliografía solo documenta respaldo científico.</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
