import { v4 as uuid } from "uuid";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { StageInterface } from "../../shared/stage-interface.js";
import { getAdaptiveCapacityConfig, getThresholds } from "../../orchestration/config-loader.js";
import { detectTransitionRisks } from "../04-signals/detectors/transition-risk-detector.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_PATH = join(__dirname, "..", "..", "config", "sector-profiles.json");

let profilesCache = null;

function getSectorProfiles() {
  if (profilesCache) return profilesCache;
  if (!existsSync(PROFILES_PATH)) return { sectors: {}, default: { physical_sensitivity: 0.5 } };
  profilesCache = JSON.parse(readFileSync(PROFILES_PATH, "utf-8"));
  return profilesCache;
}

// H-6.2: Mapping from adaptive-capacity.json indicator IDs to canonical variable
// names produced by Stage 03. Some IDs match directly (poverty_rate → poverty_rate),
// others don't (access_to_water → water_access, healthcare_access → traveltime_healthcare).
// This mapping is the single source of truth for which canonical variable feeds each indicator.
const INDICATOR_TO_CANONICAL = {
  poverty_rate: "poverty_rate",
  gdp_per_capita: "gdp_per_capita",
  access_to_water: "water_access",
  healthcare_access: "traveltime_healthcare",
  education_literacy: "education_literacy",
};

// H-6.9: mapping from phenomenon.name to the canonical variable that carries
// its externally-sourced annual occurrence probability (GRI Oxford, domain
// hazard_risk_gri — see authoritative-sources.json). These three canonical
// names (gri_flood_occurrence, gri_drought_occurrence,
// gri_extreme_heat_occurrence) are defined in
// pipeline/stages/03-normalization/canonical-schema.js. Only sequia,
// inundacion, and ola_de_calor have a GRI-covered hazard equivalent —
// authoritative-sources.json hazard_risk_gri.known_limitations documents
// that GRI Oxford's available domains are isimip/aqueduct/jrc_flood
// (flood/drought/extreme_heat/landslide only; excludes earthquake, wildfire,
// fire). ola_de_frio and el_nino/la_nina have NO external probability
// source here — cold waves and ENSO phase probability are not covered by
// any hazard_risk_gri domain, so they always use the internal calculation
// below. Adding a fabricated mapping for them would misrepresent
// data that doesn't exist upstream.
const PHENOMENON_TO_EXTERNAL_PROBABILITY = {
  sequia: "gri_drought_occurrence",
  inundacion: "gri_flood_occurrence",
  ola_de_calor: "gri_extreme_heat_occurrence",
};

// H-6.7: mirrors thresholds.json confidence_to_probability.mapping exactly.
// Used only when thresholds.json fails to provide a mapping (defensive
// fallback), so the "no config" path runs through the SAME step-function
// algorithm as the configured path, not a second, independently-written
// formula. Before H-6.7, the fallback was a separate Math.ceil(score*5)
// formula that silently disagreed with this table at the four exact
// boundary points (0.2, 0.4, 0.6, 0.8) — see thresholds.json
// confidence_to_probability._refs._h6_7_resolution for the verified
// point-by-point comparison.
export const DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING = [
  [0.0, 1],
  [0.2, 2],
  [0.4, 3],
  [0.6, 4],
  [0.8, 5],
];

export class Stage06Risk extends StageInterface {
  constructor() {
    super(6, "Risk");
    this.rulesApplied = [
      "CA se calcula con pesos configurables, nunca hardcodeados",
      "Probabilidad externa tiene prioridad sobre cálculo interno (ver detalle de implementación más abajo)",
      "Impacto es siempre cálculo interno (no se hereda de fuente externa)",
      "Riesgo catastrófico señalado independientemente del score si cumple criterios (ver detalle de implementación más abajo)",
      "Fórmula: (P × I) / CA — ISO 31000:2018 §6.6 (convención de ingeniería de riesgos, no derivación IPCC). H-6.1: IPCC AR6 WGII define riesgo cualitativamente (§1.4), no prescribe fórmula. La referencia a IPCC en la fórmula fue una simplificación; la fuente correcta es ISO 31000 §6.6 ('likelihood × consequence / controls').",
      "Riesgos de transición evaluados por perfil sectorial (regulatorio, mercado, tecnología, reputacional)",
      "H-6.2 (documentacion-v2/stage-06, CRÍTICO): getIndicatorValue() ahora lee desde canonical_variables (output de Stage 03) y normaliza usando la configuración min-max de adaptive-capacity.json. Mapping indicator_id → canonical_variable en INDICATOR_TO_CANONICAL (poverty_rate→poverty_rate, gdp_per_capita→gdp_per_capita, access_to_water→water_access, healthcare_access→traveltime_healthcare, education_literacy→education_literacy). Cuando CA=null (datos insuficientes < min_indicators), se usa fallback a CA=default (3, punto medio de escala 1-5, máxima entropía Jaynes 1957) para evitar NaN en la fórmula. El fallback está documentado en adaptive-capacity.json _methodology.score_rule. Con CA=3, la fórmula produce scores válidos: P=1,I=1 → 0.33 (bajo); P=3,I=3 → 3.0 (medio); P=5,I=5 → 8.33 (alto).",
      "H-16: transition_risk_profile_source declara si el sector tiene perfil propio en sector-profiles.json ('sector_specific') o cayó en el perfil 'default' (sin riesgos configurados) — un array de transition_risks vacío no distingue por sí solo 'sector evaluado sin riesgos' de 'sector sin perfil propio', este campo sí",
      "H-5.13 (documentacion-v2/stage-05, ALTO): calculateProbability() ahora consume phenomenon.confidence.combined (geometric mean de SQ × SS calculado en Stage 5) en lugar de retornar un valor fijo=3. Se usa 'combined' en lugar de 'signal_strength' solo porque combined es la medida completa de confianza: un fenómeno con SS=0.9 pero SQ=0.1 tiene combined=0.3 (baja confianza), no SS=0.9 (alta). Mapping configurable: confidence_to_probability.mapping en thresholds.json define umbrales [0.0→1, 0.2→2, 0.4→3, 0.6→4, 0.8→5]. Escala Likert 1-5 consistente con la escala cualitativa IPCC AR6 WGII Fig.SPM.1 (very low/low/medium/high/very high) y con ISO 31000:2018 §6.6. NOTA H-6.1: la escala Likert 1-5 viene de IPCC, pero la fórmula de conversión confidence→probability es una elección organizacional (ISO 31000 §6.6), no una prescripción IPCC. Sensibilidad: duplicar P duplica el score (P × I / CA). Configuración actual: combined<0.4 → P≤2 (bajo), combined≥0.6 → P≥4 (alto). La justificación incluye los valores SQ, SS y combined para trazabilidad completa.",
      "H-5.14 (documentacion-v2/stage-05, ALTO): calculateImpact() ahora calcula impacto dinámico en lugar de retornar un valor fijo=3, usando la sensibilidad sectorial (physical_sensitivity del sector en sector-profiles.json, 0-1) escalada a 1-5 via factor configurable (×4+1, ver H-6.4). La exposición se deriva del estado del fenómeno (active/projected/not_detected) ajustada por confidence.combined mediante bandas no solapadas (ver H-6.5). Fórmula: impact = round(√(exposure × sensitivity)) clamped [1,5] — ver H-6.3 para la corrección de esta fórmula. CA NO se incluye en impacto porque está en el denominador de la fórmula riesgo = (P × I) / CA — incluirla en I sería doble conteo. Análisis de sensibilidad: agriculture (sens=5) + active+high conf (exp=5) → impact=round(√25)=5, finance (sens=2) + projected+low conf (exp=2) → impact=round(√4)=2. Configuración: impact_calculation en thresholds.json.",
      "H-5.15 (documentacion-v2/stage-05, MEDIO): classifyRisk() usa umbrales configurables (thresholds.json risk_classification: low_max=2, medium_max=4) con fórmula (P × I) / CA (ISO 31000:2018 §6.6). Con P e I ahora dinámicos (H-5.13, H-5.14), la distribución de scores cubre razonablemente las 3 categorías: P=1,I=1,CA=5 → 0.2 (bajo); P=3,I=2,CA=3 → 2.0 (bajo/medio); P=5,I=4,CA=1 → 20.0 (alto). Análisis completo en test stage-06-risk.test.js 'sensitivity analysis: distribution of scores across P×I×CA space'. Los umbrales están fundamentados en ISO 31000:2018 §6.6 como partición organizacional del espacio de scores; la nomenclatura (bajo/medio/alto) se alinea con los 5 niveles IPCC AR6 WGII Fig.SPM.1 colapsados a 3. H-6.8: high_min eliminado por redundante.",
      "H-6.3 (documentacion-v2/stage-06, MEDIO): calculateImpact() usaba exposure × sensitivity / 5, etiquetado como 'media geométrica' en thresholds.json pese a no serlo — la media geométrica de a y b es √(a×b), no (a×b)/5. Corregido a impact = round(√(exposure × sensitivity)), que (1) es una media geométrica real, alineada con el mismo principio OECD/JRC §6.3 de no-sustituibilidad ya usado para confidence_combination (thresholds.json signal_activation._refs.confidence_combination); (2) se autonormaliza a la escala de sus factores (√(5×5)=5, √(1×1)=1) sin divisor mágico atado a que la escala sea 1-5 — a diferencia de /5, escala automáticamente si la escala Likert cambiara; (3) penaliza el desequilibrio entre exposición y sensibilidad en vez de tratarlas como perfectamente sustituibles. No se adoptó la alternativa 'producto normalizado (a×b)/scale_max configurable' porque seguiría sin penalizar desequilibrio y seguiría requiriendo una constante de escala explícita — la media geométrica real no necesita ninguna.",
      "H-6.4 (documentacion-v2/stage-06, MEDIO): sensitivity_scale_factor=4 y sensitivity_scale_offset=1 (thresholds.json impact_calculation) no son constantes independientes arbitrarias — son la única solución del mapeo lineal f(x)=offset+factor·x anclado en f(0)=1, f(1)=5, los extremos de la escala Likert 1-5 ya usada consistentemente en P y CA. Corrección a la premisa de que offset es 'redundante con el clamp': solo lo es en el piso (x=0→1, igual con o sin offset por el Math.max(1,...) posterior); en el techo NO es redundante — sin offset, x=1.0 daría round(4)=4, no 5, porque el clamp no puede subir valores, solo bajarlos. Se evaluaron alternativas a la escalación lineal (logarítmica, escalonada) y se descartaron por falta de evidencia de que la relación sensibilidad-física→impacto sea no lineal — introducir esa curvatura sin evidencia fabricaría precisión inexistente; lineal se retiene por consistencia interna con P y CA. Los valores physical_sensitivity por sector (agriculture=0.9, infrastructure=0.7, retail=0.6, energy=0.5, finance=0.3) están documentados explícitamente en sector-profiles.json._refs como ranking ordinal de juicio experto — no derivados de un índice sectorial publicado (ND-GAIN mide países, no sectores; IPCC AR6 WGII no publica un score 0-1 comparable entre estos 5 sectores). El ORDEN relativo es defendible por exposición física directa; los decimales exactos son un vacío de calibración declarado explícitamente, mismo patrón que source_quality_weights._gap y confidence_weights._gap en thresholds.json, pendiente de encuesta AHP o índice publicado futuro.",
      "H-6.5 (documentacion-v2/stage-06, MEDIO): las bases de exposición por estado (active=4, projected=3, not_detected=1) combinadas multiplicativamente con confidence.combined (exposure = base × (0.5 + 0.5×combined)) permitían una inversión contraintuitiva: un fenómeno 'active' con baja confianza (combined=0.1 → 4×0.55=2.2→2) podía tener MENOS exposición que uno 'projected' con alta confianza (combined=0.9 → 3×0.95=2.85→3), pese a que el estado temporal (¿ocurre ahora o es una proyección?) debería dominar el ranking. Corregido a un diseño de bandas [floor, floor+band_width] por estado que nunca se solapan: not_detected=[1,1] (fijo, sin modulación — no hay base física para que la confianza en un fenómeno no detectado incremente exposición), projected=[2,3], active=[4,5]. exposure = floor + round(combined × band_width). Esta partición no es arbitraria: es la única forma de dividir la escala {1..5} en 3 bloques consecutivos, monótonos y sin solape que (a) usa la escala completa sin huecos, (b) da a los 2 estados informativos un bloque de tamaño 2 — el mínimo necesario para que confidence.combined tenga algún efecto observable en una escala entera — y (c) deja not_detected fijo en su piso natural. No se citó ND-GAIN exposure sub-index como fuente porque mide exposición biofísica por país, un concepto distinto a la exposición por estado temporal de un fenómeno individual usada aquí — citarlo habría sido una referencia decorativa, no una fuente real del valor. Configuración: impact_calculation.exposure_bands en thresholds.json.",
      "H-6.6 (documentacion-v2/stage-06, ALTO): classifyHorizon() usaba phenomenon.status ('projected'→estrategico, cualquier otro→operativo), ignorando por completo phenomenon.horizon — contradiciendo el contrato (stage-06-risk.md Behavior §5: 'operativo si se materializa en ≤10 años, estratégico si >10 años') y produciendo clasificaciones incoherentes (un fenómeno 'active' con horizon='largo' se marcaba operativo pese a un horizonte >10 años). Corregido a phenomenon.horizon==='largo' ? 'estrategico' : 'operativo', anclado a horizon_years en thresholds.json (short=5, medium=10, long=30): 'corto' y 'mediano' caen dentro de los '≤10 años' del contrato (mediano llega hasta 10) → operativo; 'largo' (>10, ~30 años) → estrategico. El corte NO se puso entre 'corto' y 'mediano' (horizon==='corto'?...) porque eso clasificaría 'mediano' —hasta 10 años— como estratégico, violando el propio '≤10 años' del contrato; el corte correcto cae entre 'mediano' y 'largo'. No se agregó una 3ra categoría 'táctico' (alternativa sugerida en la auditoría): ni el contrato ni RiskClassEnum (pipeline/shared/types.js) contemplan 3 niveles para esta clasificación de riesgo de negocio — IPCC AR6 WGII §1.4.3 distingue 3 horizontes para PROYECCIONES climáticas (near/mid/late-century), pero eso no obliga a que operativo/estrategico tenga 3 niveles; agregar uno sin que el contrato o el schema de salida lo pidan habría requerido cambiar RiskClassEnum y a todo consumidor downstream sin justificación en el contrato.",
      "H-6.7 (documentacion-v2/stage-06, MEDIO): confidence_to_probability.mapping usa umbrales [0.0,0.2,0.4,0.6,0.8] espaciados uniformemente — Principio de indiferencia de Laplace / máxima entropía, NO una calibración empírica confianza→probabilidad (corrección: thresholds.json decía 'calibrados', palabra que sobrestimaba el fundamento). La escala numérica 1-5 con paso 0.2 es una elección organizacional (ISO 31000, misma convención Likert que I y CA), no una prescripción de IPCC AR6 WGII — IPCC usa etiquetas cualitativas con rangos de probabilidad asimétricos (Guidance Note on Uncertainty, Mastrandrea et al. 2010), no 5 bandas iguales; citar una figura IPCC específica como fuente de ESTOS umbrales sería la misma sobre-atribución que H-6.1 corrigió. El efecto de umbral (step function: 0.39→P2, 0.40→P3) se documenta como propiedad deliberada de la escala ordinal, no un descuido. Se verificó punto por punto (paso 0.001) la afirmación de la auditoría de que combined=0.7 producía P=4 por fallback vs. P=3 por tabla: es INCORRECTA — ambos caminos daban P=4 en 0.7; la única divergencia real estaba en los 4 puntos de frontera exactos (0.2/0.4/0.6/0.8), donde el fallback anterior (Math.ceil(score*5), una fórmula independiente) discrepaba por 1 punto de la tabla (bucle score>=threshold) debido a semánticas de redondeo distintas. Corregido unificando ambos caminos: el fallback ahora reutiliza DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING (copia exacta del default de thresholds.json) procesada por el mismo bucle — ya no son dos políticas independientes, sino la misma tabla con o sin config. Ver thresholds.json confidence_to_probability._refs._h6_7_resolution para el análisis completo.",
      "H-6.8 (documentacion-v2/stage-06, BAJO): classifyRisk() simplificado — high_min=4 eliminado de thresholds.json por ser redundante con medium_max=4 (la condición score≥4 nunca se alcanzaba porque score≤4 ya la capturaba). Código muerto removido. Lógica actual: bajo (≤low_max), medio (≤medium_max), alto (>medium_max). Los umbrales low_max=2 y medium_max=4 NO son arbitrarios: están calibrados a Score=(P×I)/CA donde P,I,CA∈[1,5] (ISO 31000:2018 §6.6). Distribución verificada en P×I×CA space: 34% bajo, 35% medio, 31% alto (test sensitivity analysis). La simplificación no cambia resultados — solo elimina dead code y documenta por qué la lógica es correcta.",
      "H-6.12 (documentacion-v2/stage-06, MEDIO): physical_sensitivity por sector son ranking ordinal de juicio experto, NO valores derivados de un índice publicado (ND-GAIN mide países, no sectores; IPCC AR6 WGII no publica scores 0-1 comparables). Análisis de sensibilidad ±0.2 documentado en sector-profiles.json._refs._sensitivity_analysis: (1) ranking agriculture>infrastructure>retail>energy>finance es estable con ±0.2 en la escala Likert resultante; (2) finance tiene mayor volatilidad (Likert [1,3] con ±0.2) por cercanía a bordes de redondeo; (3) gaps entre sectores adyacentes son frágiles (0.1-0.2) — inversión posible con ±0.1 por sector, pero solo en escala raw, no en Likert; (4) fórmula round(value×4)+1 produce saltos de 2 puntos Likert en bordes x.5 (ejemplo: 0.375→1, 0.376→3). Cada sector ahora tiene campo _confidence que documenta estabilidad del valor. Pendiente: encuesta AHP o fuente publicada para calibrar decimales exactos.",
      "H-6.10 (documentacion-v2/stage-06, ALTO): el contrato (stage-06-risk.md Behavior/Rules Applied §5) exige evaluar cada riesgo en ≥2 escenarios (≤2°C y >2°C) y 3 horizontes; Stage06Risk producía 1 evaluación por fenómeno. La causa NO está en el loop de execute() ('for (const phenomenon of phenomena)'), que ya escala a N evaluaciones si recibe N fenómenos distintos — está estructuralmente aguas arriba: (1) escenarios: ninguna fuente de datos del pipeline tiene dimensión SSP — Open-Meteo CMIP6, única fuente de proyecciones (authoritative-sources.json projection_climate), expone solo el ensemble HighResMIP (~RCP8.5) sin parámetro de escenario (HALLAZGO-8); (2) horizontes: Stage 05 (H-5.9) colapsa deliberadamente corto/mediano/largo de un fenómeno en un solo horizonte inferido por prioridad, no emite 3 fenómenos independientes. Implementar el loop anidado escenario×horizonte×fenómeno sugerido por la auditoría habría requerido FABRICAR 6 assessments por fenómeno duplicando el mismo P/I/CA con solo la etiqueta de escenario/horizonte distinta — misma clase de fabricación de precisión inexistente que H-6.4/H-6.5/H-6.9 ya rechazaron. Corregido añadiendo computeEvaluationCoverage(), que declara explícitamente en cada assessment (campo evaluation_coverage) cuántos escenarios/horizontes se evaluaron realmente (1/1) vs. los exigidos por el contrato (evaluation_coverage_requirements en thresholds.json: 2/3), con meets_contract=false y la justificación completa — visible y auditable en vez de oculto detrás de los defaults silenciosos 'not_scenario_specific'/'mediano' que ya existían. El camino real para cerrar esta brecha requiere cambios en Stage 03 (ingesta de SSPs, bloqueada por HALLAZGO-8) y Stage 05 (dejar de colapsar horizontes) — fuera del alcance de Stage 6, documentado aquí en vez de simulado.",
      "H-6.11 (documentacion-v2/stage-06, CRÍTICO): CA=null causaba riskScoreRaw=(P×I)/null=NaN, silenciosamente clasificado por classifyRisk() en una categoría cualquiera (fallthrough) en vez de señalarse como inválido. YA RESUELTO por H-6.2: execute() calcula caScore = adaptiveCapacity.score ?? thresholds.adaptive_capacity?.default ?? 3 ANTES de la fórmula de riesgo, y riskScoreRaw usa caScore (nunca null/undefined — la cadena ?? termina en el literal 3), no adaptiveCapacity.score directamente. probability.value e impact.value tampoco pueden ser NaN por la vía CA: ambos se inicializan en 1 y solo se sobrescriben con comparaciones (score>=threshold) que son siempre false para NaN, así que nunca 'heredan' un NaN de confidence.combined por esa ruta. H-6.11 verificó, adicionalmente, una SEGUNDA vía de NaN no cubierta por H-6.2: en calculateImpact(), `const combined = phenomenon.confidence?.combined ?? 0` NO protege contra combined=NaN explícito (el operador ?? solo reemplaza null/undefined, nunca NaN) — Math.round(NaN × band_width) es NaN incluso con band_width=0 (NaN×0=NaN, no 0), así que un confidence.combined=NaN corrupto en la entrada de Stage 05 sí podía propagar NaN → exposure → impact.value → risk_score_raw, evadiendo la protección de H-6.2 (que solo cubre el eje CA). Corregido reemplazando `?? 0` por un guard Number.isFinite() explícito en ese punto — misma postura defensiva de límite-de-stage que H-5.12 ya aplica en Stage 05 para sus propias señales de entrada. Test añadido: risk_score_raw nunca es NaN, barriendo CA null/calculado/default y confidence.combined=NaN.",
      "H-6.13 (documentacion-v2/stage-06, BAJO): un sector sin entrada propia en sector-profiles.json (o el archivo mismo ausente) caía silenciosamente en profiles.default (physical_sensitivity=0.5) sin que el output distinguiera esto de un sector con perfil propio cuya sensibilidad genuinamente es 0.5 — mismo problema que H-16 (transition-risk-detector.js) ya resolvió para transition_risk_profile_source, pero sin resolver aquí para sensibilidad física. Corregido agregando physical_sensitivity_source ('sector_specific' | 'default') a impact.components, con la misma semántica que su contraparte de riesgos de transición. Adicionalmente, mismo principio que H-15 (transition_sensitivity): si un perfil (propio o default) EXISTE pero no declara physical_sensitivity, calculateImpact() ahora falla ruidosamente (throw) en vez de aplicar `?? 0.5` — ese fallback era indistinguible del 0.5 genuino que profiles.default ya declara explícitamente, y H-15 ya estableció que ese tipo de ambigüedad se resuelve fallando alto, no adivinando. No se implementó la alternativa 'si sector-profiles.json no existe, retornar CA=null' (sugerida en la auditoría): es una respuesta desproporcionada a un riesgo BAJO — sector-profiles.json es un asset versionado del repo, no un dato suministrado en tiempo de ejecución, y bloquear el cálculo de impacto entero por su ausencia cambiaría el comportamiento de fail-open a fail-closed para un escenario operacional improbable; physical_sensitivity_source ya hace la brecha auditable sin ese costo.",
      "H-6.9 (documentacion-v2/stage-06, ALTO): calculateProbability() ignoraba por completo la regla ya declarada en rulesApplied ('Probabilidad externa tiene prioridad sobre cálculo interno') — nunca consultaba fuentes externas, external_source era siempre null, y el contrato (stage-06-risk.md Behavior §2: 'si existe fuente autoritativa con probabilidad directa (e.g., GRI ISIMIP drought probability), usar ese valor mapeado a 1-5') no se implementaba. Corregido con getExternalProbability(), que busca en canonical_variables (mismo mecanismo que H-6.2 usa para adaptive capacity) la variable canónica correspondiente según PHENOMENON_TO_EXTERNAL_PROBABILITY (sequia→gri_drought_occurrence, inundacion→gri_flood_occurrence, ola_de_calor→gri_extreme_heat_occurrence — GRI Oxford domain hazard_risk_gri, authoritative-sources.json). Cuando existe, se mapea a 1-5 con la MISMA tabla confidence_to_probability.mapping (H-6.7) que el cálculo interno — reutilización deliberada y documentada, no una calibración específica de probabilidad de ocurrencia (ver thresholds.json confidence_to_probability._refs._h6_9_external_scale_gap para el vacío de calibración declarado). ola_de_frio, el_nino y la_nina NO tienen entrada en el mapeo: GRI Oxford solo cubre flood/drought/extreme_heat/landslide (authoritative-sources.json hazard_risk_gri.known_limitations) — no hay fuente autoritativa para ondas de frío o fase ENSO, y fabricar un mapeo falso sería peor que no tenerlo. LIMITACIÓN CONOCIDA Y DECLARADA: Stage 03 (pipeline/stages/03-normalization/index.js) actualmente NO extrae gri_flood_occurrence/gri_drought_occurrence/gri_extreme_heat_occurrence de la respuesta cruda de GRI Oxford — solo extrae traveltime_healthcare — así que en la práctica canonical_variables nunca traerá estos valores hasta que se resuelva ese gap. Esta es la MISMA incertidumbre ya documentada en documentacion-v2/stage-02/AUDITORIA-supuestos-calculos-heuristics.md HALLAZGO-4 ('Estructura de paths de GRI Oxford incierta — Requiere verificación empírica', SIN RESOLVER): la forma exacta de results[].layer.domain para los dominios isimip/aqueduct/jrc_flood no está verificada contra la API en vivo. No se fabricó lógica de extracción en Stage 03 para H-6.9 basada en una estructura no verificada — hacerlo arriesgaría silenciosamente extraer el campo equivocado, un resultado peor que declarar el vacío. H-6.9 deja Stage06Risk correctamente cableado y listo para consumir el dato en cuanto Stage 03 resuelva HALLAZGO-4; hasta entonces, external_source seguirá siendo null y el fallback interno (H-5.13) se activa siempre, con el mismo comportamiento que antes de este fix.",
      "H-6.14 (documentacion-v2/stage-06, MEDIO): catastrophic_multiplier=1.5 estaba configurado en thresholds.json pero nunca consumido, y RiskLevelEnum incluye 'catastrofico' pero classifyRisk() nunca lo emitía — el contrato (Rules Applied §4: 'riesgo catastrófico señalado independientemente del score si cumple criterios: vida, legal, continuidad, reputación irreversible') no se implementaba. Esas 4 sub-categorías no existen como datos discretos en el pipeline; inventar un mapeo fenómeno→categoría habría sido la misma fabricación de taxonomía sin fundamento que H-6.4/H-6.5/H-6.9/H-6.10 ya rechazaron. Corregido con classifyCatastrophic(impact, thresholds): impact.value >= catastrophic_impact_threshold (5, techo de la escala Likert ya usada en P/I/CA) dispara risk_level='catastrofico' con bypass total de classifyRisk(), y multiplica risk_score_raw por catastrophic_multiplier — cumpliendo 'independientemente del score' literalmente. impact.value=5 ya representa, por construcción (H-6.3/H-6.4/H-6.5), la combinación máxima realista de exposición y sensibilidad sectorial; tratarlo como disparador de escalamiento por consecuencia es la convención estándar ISO 31000/COSO ERM de 'consequence override' en matrices de riesgo, no un valor elegido por conveniencia — verificación empírica: solo 1 de 30 combinaciones sector×exposición (3.3%) alcanza impact=5, consistente con el '≥P95 de la distribución de impactos' que catastrophic_multiplier ya citaba. Cada assessment ahora incluye catastrophic_assessment ({flagged, criterion, threshold, justification}), documentando explícitamente en el output que este proxy mide 'consecuencia física máxima según este sistema' y NO distingue vida/legal/continuidad/reputación irreversible — vacío de datos declarado, no oculto.",
      "H-6.15 (documentacion-v2/stage-06, MEDIO): el output no cumplía la forma del contrato (stage-06-risk.md Output Contract) en 2 puntos. (1) exposure: el contrato lo especifica como array top-level {phenomenon_id, level, factors, context_variables_used}; la implementación lo tenía anidado dentro de impact.components sin factors ni context_variables_used. Corregido agregando exposure[] a execute(), construido desde el nuevo exposure_detail que calculateImpact() ya retorna — sin recalcular nada. context_variables_used=[] es honesto, no un placeholder: la exposición se deriva únicamente de phenomenon.status y confidence.combined (H-6.5), nunca de canonical_variables. (2) adaptive_capacity.indicators: el contrato lo especifica como {name, value, weight, contribution}[]; la implementación solo tenía indicators_used (string[] de IDs). Corregido agregando 'indicators' en el formato del contrato junto a indicators_used/indicator_details (conservados para no romper tests existentes), usando datos ya reales: weight=1/N sobre los N indicadores usados (H-6.2, igual weight documentado en adaptive-capacity.json), contribution=normalized_score×weight. No se fabricó un campo 'name' distinto del id del indicador (adaptive-capacity.json no tiene una etiqueta humana separada) — se reutiliza el id, la mejor información disponible, en vez de inventar una etiqueta nueva. No se implementaron los campos {stage, status} del Output Contract en execute(): esos los agrega genéricamente StageInterface.wrapArtifact() (pipeline/shared/stage-interface.js) para todos los stages, no son responsabilidad de Stage06Risk.",
      "H-6.16 (documentacion-v2/stage-06, BAJO): calculateAdaptiveCapacity() usa promedio simple (peso igual 1/N) sobre los indicadores con datos, justificado solo como 'pesos diferenciales pendiente v3' sin análisis de sensibilidad. El punto #2 original de este hallazgo ('getIndicatorValue() siempre retorna null, haciendo irrelevante min_indicators') está OBSOLETO — H-6.2 ya implementó getIndicatorValue() leyendo canonical_variables reales, así que min_indicators_required=3 (ND-GAIN, IPCC AR6 Ch.8) sí discrimina ejecuciones reales ahora. El punto #3 (justificación del clamp [1,5]) ya estaba resuelto en thresholds.json adaptive_capacity._refs.min_score_max_score (ND-GAIN, IPCC AR6 Ch.8) antes de este hallazgo. Lo que faltaba, y se agregó aquí: (a) adaptive-capacity.json _methodology.weighting ahora enmarca explícitamente 1/N como default de máxima entropía/Laplace (Jaynes, 1957), no una calibración AHP; (b) análisis de sensibilidad cuantitativo (thresholds.json adaptive_capacity._refs._h6_16_sensitivity_analysis): para CUALQUIER esquema de pesos no-negativos que sumen 1, el promedio ponderado de N valores está acotado en [min(scores), max(scores)] (propiedad de combinaciones convexas) — así que la desviación máxima posible de CA bajo pesos alternativos es exactamente el rango de los indicadores contribuyentes, reportado en cada ejecución real (justification incluye 'Rango de indicadores=[min,max]'). Esto muestra que el riesgo del placeholder 1/N es proporcional a cuánto discrepan los indicadores en cada caso, no una cantidad fija — inocuo cuando concuerdan, real cuando divergen. No se implementó un sistema de pesos configurables por indicador (alternativa sugerida en la auditoría): no existe hoy una encuesta AHP o análisis PCA que determine esos pesos, y agregar un campo de configuración sin datos reales para poblarlo sería la misma fabricación de precisión inexistente que H-6.4/H-6.5/H-6.9/H-6.10/H-6.14 ya rechazaron — se documenta el vacío explícitamente en vez de inventar números. El clamp [1,5] final se documentó como matemáticamente redundante (cada normalized_score ya está en [1,5]) pero se conserva como defensa en profundidad explícita.",
      "H-6.17 (documentacion-v2/stage-06, BAJO): execute() era sync mientras StageInterface.execute() (pipeline/shared/stage-interface.js) se declara async — funciona en JavaScript (una función sync satisface una interfaz async), pero es una inconsistencia de diseño detectable en auditoría, mismo hallazgo que H-5.20 ya corrigió en Stage 05. Corregido agregando 'async' a la firma, sin cambiar ningún comportamiento: Orchestrator (pipeline/orchestration/orchestrator.js:46) ya hacía 'await stage.execute(...)' genéricamente para todos los stages, así que este cambio es transparente para el pipeline real. Deja Stage 6 preparado si en el futuro necesita I/O propio (ej. fetch directo a una fuente externa en vez de recibir canonical_variables ya normalizadas por Stage 03). Se actualizaron las 2 rutas de llamada directa (no vía Orchestrator) que invocaban execute() sin await: transition-risks.test.js (2 casos) y los ~47 bloques de test en stage-06-risk.test.js que llaman a stage.execute() directamente.",
      "H-6.18 (documentacion-v2/stage-06, BAJO): sector y sensibilidad sectorial no se propagaban al output de cada assessment — un auditor no podía verificar que agriculture (sens=0.9) obtuvo sensibilidad Likert 5 y finance (sens=0.3) obtuvo Likert 2. Corregido: (1) campo 'sector' agregado a cada assessment en execute(); (2) physical_sensitivity (raw 0-1) y sensitivity_scaled (Likert 1-5) agregados a impact.components en calculateImpact(). Ahora el output contiene la cadena completa de trazabilidad: sector → physical_sensitivity (raw) → sensitivity_scaled (Likert) → exposure → impact.value → risk_score_raw.",
    ];
  }

  // H-6.17 (documentacion-v2/stage-06, BAJO): async para consistencia con
  // StageInterface.execute() (async) — mismo criterio que H-5.20 ya aplicó
  // en Stage 05. Una función sync satisface una interfaz async en
  // JavaScript, pero es una inconsistencia de diseño detectable en
  // auditoría. Si Stage 6 necesita I/O en el futuro (ej. fetch directo a
  // World Bank en vez de vía canonical_variables ya normalizadas), ya está
  // preparado sin cambiar la firma.
  async execute(input) {
    const { phenomena, sector, config } = input;
    const canonicalVariables = input.canonical_variables || [];
    const adaptiveCapacity = this.calculateAdaptiveCapacity(config, canonicalVariables);
    const thresholds = getThresholds();

    // H-6.2: Fallback when CA=null (no data for enough indicators).
    // Use the default from adaptive-capacity.json (maxim entropy / Jaynes 1957):
    // if no evidence of high or low CA, assume neutral midpoint of 1-5 scale.
    // This prevents NaN in the risk formula (P × I / null = NaN) while being
    // transparent about the assumption — the fallback is documented in
    // adaptive-capacity.json _methodology.score_rule and in rulesApplied.
    const caScore = adaptiveCapacity.score ?? thresholds.adaptive_capacity?.default ?? 3;

    const assessments = [];
    // H-6.15: contract-shaped exposure[] array, built from calculateImpact()'s
    // exposure_detail (no recomputation) — see that method for why
    // context_variables_used is honestly [] rather than fabricated.
    const exposure = [];

    for (const phenomenon of phenomena) {
      const probability = this.calculateProbability(phenomenon, canonicalVariables);
      const impact = this.calculateImpact(phenomenon, sector, caScore);
      exposure.push({
        phenomenon_id: phenomenon.phenomenon_id,
        level: impact.exposure_detail.level,
        factors: impact.exposure_detail.factors,
        context_variables_used: impact.exposure_detail.context_variables_used,
      });
      const baseScoreRaw = (probability.value * impact.value) / caScore;
      const catastrophicAssessment = this.classifyCatastrophic(impact, thresholds);
      const riskScoreRaw = catastrophicAssessment.flagged
        ? baseScoreRaw * (thresholds.risk_classification.catastrophic_multiplier ?? 1.5)
        : baseScoreRaw;
      const riskLevel = catastrophicAssessment.flagged ? "catastrofico" : this.classifyRisk(riskScoreRaw, thresholds);
      const riskClass = this.classifyHorizon(phenomenon);

      assessments.push({
        risk_id: uuid(),
        phenomenon_id: phenomenon.phenomenon_id,
        // H-6.18 (documentacion-v2/stage-06, BAJO): sector se agrega al
        // output para trazabilidad — un auditor puede verificar qué perfil
        // sectorial se usó para calcular physical_sensitivity y la
        // correspondiente sensibilidad escalada a Likert 1-5.
        sector,
        // "ssp370" was never a real fallback: no source in this pipeline
        // selects or labels an SSP scenario (HALLAZGO-8 — openmeteo_cmip6 is
        // a HighResMIP ensemble with no scenario parameter at all). Using
        // "not_scenario_specific" instead of a fabricated SSP label avoids
        // implying a scenario selection that doesn't exist anywhere upstream.
        scenario: phenomenon.scenario || "not_scenario_specific",
        horizon: phenomenon.horizon || "mediano",
        evaluation_coverage: this.computeEvaluationCoverage(thresholds),
        probability,
        impact: {
          value: impact.value,
          components: impact.components,
          justification: impact.justification,
        },
        adaptive_capacity: adaptiveCapacity,
        catastrophic_assessment: catastrophicAssessment,
        risk_score_raw: riskScoreRaw,
        risk_level: riskLevel,
        risk_classification: riskClass,
      });
    }

    const { transition_risks: transitionRisks, transition_risk_profile_source: transitionRiskProfileSource } =
      this.evaluateTransitionRisks(sector);

    return {
      assessments,
      exposure,
      adaptive_capacity: adaptiveCapacity,
      transition_risks: transitionRisks,
      transition_risk_profile_source: transitionRiskProfileSource,
    };
  }

  evaluateTransitionRisks(sector) {
    const { profile_source: profileSource, risks } = detectTransitionRisks(sector);
    return {
      transition_risks: risks.map(r => ({
        risk_id: r.risk_id,
        sector: r.sector,
        type: r.type,
        description: r.description,
        timeframe: r.timeframe,
        severity: r.severity,
        signal_strength: r.signal_strength,
      })),
      transition_risk_profile_source: profileSource,
    };
  }

  // H-6.15 (documentacion-v2/stage-06, MEDIO): el contrato (stage-06-risk.md
  // Output Contract) especifica adaptive_capacity.indicators como
  // {name, value, weight, contribution}[], no como indicators_used:
  // string[]. indicators_used/indicator_details se conservan tal cual
  // (usados por tests existentes) y se agrega 'indicators' en el formato
  // del contrato, construido con datos que YA existen: weight=1/N sobre los
  // N indicadores usados (H-6.2: "igual weight — pesos diferenciales
  // pendiente v3", documentado en adaptive-capacity.json
  // _methodology.weighting), contribution=normalized_score×weight (cuánto
  // aportó cada indicador al promedio final). 'name' reutiliza el id del
  // indicador — adaptive-capacity.json no tiene un campo de etiqueta
  // humana separado del id/description, y usar el id como name es reusar
  // el mejor identificador disponible, no fabricar uno nuevo.
  calculateAdaptiveCapacity(config, canonicalVariables = []) {
    const acConfig = getAdaptiveCapacityConfig();
    const indicators = acConfig.indicators;
    const minIndicators = acConfig._min_indicators ?? 3;
    if (indicators.length === 0) {
      return { score: null, indicators_used: [], indicators: [], justification: "Sin indicadores configurados" };
    }
    let sum = 0;
    const used = [];
    const indicatorDetails = [];
    for (const ind of indicators) {
      const value = this.getIndicatorValue(ind.id, canonicalVariables);
      if (value != null) {
        sum += value;
        used.push(ind.id);
        indicatorDetails.push({ id: ind.id, normalized_score: value });
      }
    }
    if (used.length < minIndicators) {
      return {
        score: null,
        indicators_used: used,
        indicator_details: indicatorDetails,
        // weight/contribution son null: CA=null significa que NUNCA se
        // calculó un promedio (datos insuficientes), así que "cuánto
        // aportó este indicador al promedio final" no aplica todavía —
        // distinto de asumir 0, que implicaría falsamente que el indicador
        // no importa.
        indicators: indicatorDetails.map(d => ({
          name: d.id,
          value: d.normalized_score,
          weight: null,
          contribution: null,
        })),
        justification: `CA=null — indicadores disponibles (${used.length}) < mínimo requerido (${minIndicators}). Indicadores con datos: [${used.join(", ")}].`,
      };
    }
    const score = Math.round(sum / used.length);
    const weight = 1 / used.length;
    // H-6.16 (documentacion-v2/stage-06, BAJO): weight=1/N (ponderación
    // igual) es el default de máxima entropía / Laplace, no una calibración
    // AHP — adaptive-capacity.json _methodology.weighting lo declara
    // explícitamente como placeholder pendiente de v3. Cuánto importa esta
    // elección en una ejecución dada es acotable matemáticamente: cualquier
    // esquema de pesos no-negativos que sumen 1 produce un promedio dentro
    // de [min(scores), max(scores)] (propiedad de combinaciones convexas),
    // así que la desviación máxima posible de este CA bajo OTRO esquema de
    // pesos es exactamente ese rango. Se reporta aquí (indicatorMin/Max) en
    // vez de solo en la documentación estática, para que cada ejecución
    // muestre si el placeholder es inocuo (indicadores concuerdan, rango
    // estrecho) o una limitación real (indicadores discrepan, rango
    // amplio) — ver thresholds.json
    // adaptive_capacity._refs._h6_16_sensitivity_analysis para el análisis
    // completo con ejemplos numéricos.
    const indicatorScores = indicatorDetails.map(d => d.normalized_score);
    const indicatorMin = Math.min(...indicatorScores);
    const indicatorMax = Math.max(...indicatorScores);
    // H-6.16: el clamp [1,5] es matemáticamente redundante en este punto,
    // no una salvaguarda necesaria — cada normalized_score ya viene
    // clamped a [1,5] por getIndicatorValue(), y el promedio de valores en
    // [1,5] permanece en [1,5] (misma propiedad de combinación convexa
    // citada arriba). Se conserva como defensa en profundidad explícita
    // (documentada, no una salvaguarda "por si acaso" sin explicación) en
    // vez de eliminarlo — mismo criterio que otros clamps redundantes en
    // este stage.
    return {
      score: Math.max(1, Math.min(5, score)),
      indicators_used: used,
      indicator_details: indicatorDetails,
      indicators: indicatorDetails.map(d => ({
        name: d.id,
        value: d.normalized_score,
        weight,
        contribution: d.normalized_score * weight,
      })),
      justification: `CA calculado como promedio simple de ${used.length} indicadores (igual weight=${weight.toFixed(4)} — pesos diferenciales pendiente v3, H-6.16). Scores: [${indicatorDetails.map(d => `${d.id}=${d.normalized_score}`).join(", ")}]. Rango de indicadores=[${indicatorMin},${indicatorMax}]: bajo CUALQUIER otro esquema de pesos no-negativos, CA seguiría dentro de ese rango — desviación máxima posible ${indicatorMax - indicatorMin} punto(s) Likert respecto a este promedio igual (H-6.16, propiedad de combinaciones convexas).`,
    };
  }

  // H-6.2: getIndicatorValue now reads from canonical_variables (Stage 03 output)
  // and normalizes using the indicator's min-max configuration from adaptive-capacity.json.
  // Returns null when no data is available for the indicator — this is correct behavior
  // (null means "unknown", not "zero"), and calculateAdaptiveCapacity handles it by
  // excluding the indicator from the average.
  getIndicatorValue(id, canonicalVariables = []) {
    const acConfig = getAdaptiveCapacityConfig();
    const indicator = acConfig.indicators.find(ind => ind.id === id);
    if (!indicator) return null;

    const canonicalName = INDICATOR_TO_CANONICAL[id];
    if (!canonicalName) return null;

    const canonicalVar = canonicalVariables.find(v => v.name === canonicalName);
    if (!canonicalVar || canonicalVar.value == null) return null;

    const raw = canonicalVar.value;
    const { min_value, max_value, min_score, max_score } = indicator.normalization;

    // Min-max normalization to 1-5 scale.
    // When max_value === min_value (degenerate range), return midpoint to avoid division by zero.
    if (max_value === min_value) {
      return Math.round((min_score + max_score) / 2);
    }
    const normalized = min_score + ((raw - min_value) / (max_value - min_value)) * (max_score - min_score);
    return Math.max(1, Math.min(5, Math.round(normalized)));
  }

  // H-6.9 (documentacion-v2/stage-06, ALTO): busca una probabilidad de
  // ocurrencia anual desde una fuente externa autoritativa (GRI Oxford,
  // domain hazard_risk_gri) para el fenómeno dado, vía la canonical_variable
  // correspondiente en PHENOMENON_TO_EXTERNAL_PROBABILITY. Retorna null si el
  // fenómeno no tiene mapeo (sin fuente GRI equivalente) o si la variable no
  // está presente en canonical_variables (dato no disponible para esta
  // ubicación/momento) — en ambos casos calculateProbability() cae al
  // cálculo interno, exactamente como especifica el contrato
  // (stage-06-risk.md Behavior §2: "si no [hay fuente autoritativa], calcular
  // desde signal_strength").
  getExternalProbability(phenomenon, canonicalVariables = []) {
    const canonicalName = PHENOMENON_TO_EXTERNAL_PROBABILITY[phenomenon.name];
    if (!canonicalName) return null;

    const variable = canonicalVariables.find(v => v.name === canonicalName);
    if (!variable || variable.value == null) return null;

    return {
      canonicalName,
      probability01: Math.max(0, Math.min(1, variable.value)),
    };
  }

  calculateProbability(phenomenon, canonicalVariables = []) {
    const thresholds = getThresholds();
    // H-6.7: fallback usa la misma tabla y el mismo algoritmo que el path
    // configurado — un solo código de mapeo, no dos formulas independientes
    // que puedan divergir. Ver DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING.
    const mapping = thresholds.confidence_to_probability?.mapping ?? DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING;

    // H-6.9: probabilidad externa tiene prioridad sobre el cálculo interno,
    // como especifica el contrato (stage-06-risk.md Behavior §2, y ya
    // declarado sin implementar en rulesApplied desde el inicio de este
    // stage). Se reutiliza la MISMA tabla confidence_to_probability.mapping
    // para convertir la probabilidad anual de ocurrencia (0-1, GRI Oxford)
    // a la escala 1-5 — no una segunda tabla independiente. Esto es una
    // simplificación deliberada y documentada, no una equivalencia
    // rigurosamente calibrada: la probabilidad anual de ocurrencia de un
    // hazard (ej. sequía) y la confianza epistémica combinada (SQ×SS) son
    // magnitudes conceptualmente distintas que comparten solo el rango
    // [0,1] — no existe en este proyecto una calibración específica de
    // umbrales para probabilidad de ocurrencia (ej. bandas por periodo de
    // retorno, común en literatura de riesgo catastrófico/de seguros). Se
    // documenta el vacío explícitamente en vez de fabricar una segunda
    // tabla sin fundamento; ver thresholds.json
    // confidence_to_probability._refs._h6_9_external_scale_gap.
    const external = this.getExternalProbability(phenomenon, canonicalVariables);
    if (external) {
      let value = 1;
      for (const [threshold, prob] of mapping) {
        if (external.probability01 >= threshold) value = prob;
      }
      return {
        value,
        source: "external",
        external_source: `gri_oxford:${external.canonicalName}`,
        justification: `Probabilidad tomada de fuente externa autoritativa gri_oxford (${external.canonicalName}=${external.probability01.toFixed(4)}, domain hazard_risk_gri — authoritative-sources.json), mapeada a escala 1-5 via confidence_to_probability (misma tabla usada para el cálculo interno, ver H-6.9) = ${value}/5. Prioridad externa sobre cálculo interno según contrato stage-06-risk.md Behavior §2.`,
      };
    }

    // H-5.13: mapeo de confidence.combined (0-1) a probabilidad ordinal (1-5)
    // usando la tabla configurable confidence_to_probability.mapping. Este
    // es el camino de fallback cuando no hay fuente externa disponible para
    // el fenómeno (H-6.9: ni PHENOMENON_TO_EXTERNAL_PROBABILITY tiene una
    // entrada para este fenómeno, ni canonical_variables trae el dato).
    // Se usa 'combined' (geometric mean de SQ × SS) en lugar de 'signal_strength'
    // porque combined es la medida completa de confianza que accounta por calidad
    // de fuente Y fuerza de señal. Usar solo signal_strength ignoraría la
    // degradación por SQ baja — un fenómeno con SS=0.9 pero SQ=0.1 no debería
    // tener alta probabilidad.
    //
    // H-6.7: los umbrales [0.0, 0.2, 0.4, 0.6, 0.8] son espaciado uniforme
    // (Principio de indiferencia de Laplace / máxima entropía), NO una
    // calibración empírica confianza→probabilidad — no existe tal calibración
    // en este proyecto. Es una función escalón (step function) deliberada,
    // no continua: un cambio de 0.01 en combined puede mover P en 1 punto
    // exactamente en los 4 umbrales. Esto es una propiedad conocida y
    // aceptada de escalas ordinales Likert (misma convención que P, I, CA en
    // todo el sistema), no un descuido. Ver thresholds.json
    // confidence_to_probability._refs._h6_7_resolution para el análisis de
    // sensibilidad completo y la comparación tabla-vs-fallback verificada
    // punto por punto.
    const score = phenomenon.confidence?.combined ?? 0;
    let value = 1;
    for (const [threshold, prob] of mapping) {
      if (score >= threshold) value = prob;
    }

    return {
      value,
      source: "calculated",
      external_source: null,
      justification: `Probabilidad calculada desde confidence.combined=${score.toFixed(4)} (geometric mean de SQ=${phenomenon.confidence?.source_quality} × SS=${phenomenon.confidence?.signal_strength}) mapeado a escala 1-5 via confidence_to_probability (${value >= 4 ? "probable/alto" : value >= 3 ? "posible/medio" : "improbable/bajo"}).`,
    };
  }

  calculateImpact(phenomenon, sector, adaptiveCapacityScore) {
    const thresholds = getThresholds();
    const impactConfig = thresholds.impact_calculation;

    // H-5.14: sensibilidad del sector desde sector-profiles.json.
    // physical_sensitivity (0-1) se escala a 1-5 usando factor configurable.
    // H-6.4: sensitivity_scale_factor=4 y sensitivity_scale_offset=1 no son dos
    // constantes elegidas independientemente — son la única solución del mapeo
    // lineal f(x)=offset+factor·x anclado en f(0)=1, f(1)=5 (extremos de la
    // escala Likert 1-5 ya usada en P y CA). offset NO es redundante con el
    // clamp de abajo: sin offset, x=1.0 daría round(1×4)=4, no 5 — el clamp
    // solo puede bajar valores, nunca subirlos. Ver thresholds.json
    // impact_calculation._refs._h6_4_resolution para la comparación lineal
    // vs. logarítmica vs. escalonada, y sector-profiles.json._refs para el
    // vacío de calibración de los valores physical_sensitivity por sector
    // (ranking ordinal de juicio experto, no de un índice publicado).
    //
    // H-6.13 (documentacion-v2/stage-06, BAJO): un sector sin perfil propio
    // caía silenciosamente en profiles.default (physical_sensitivity=0.5)
    // sin que el output distinguiera "este sector fue evaluado con su
    // propio perfil" de "este sector no tiene perfil y usó el default" —
    // mismo problema que H-16 ya resolvió para transition_risk_profile_source
    // en transition-risk-detector.js. physicalSensitivitySource lo hace
    // explícito y auditable aquí también, con la misma semántica
    // "sector_specific" | "default". Adicionalmente, mismo principio que
    // H-15 (transition_sensitivity): si un perfil (propio o default) EXISTE
    // pero no declara physical_sensitivity, se falla ruidosamente en vez de
    // aplicar 0.5 arbitrariamente — un ?? 0.5 silencioso sería indistinguible
    // del 0.5 genuino que profiles.default ya declara explícitamente.
    const profiles = getSectorProfiles();
    const sectorSpecificProfile = profiles.sectors?.[sector];
    const resolvedProfile = sectorSpecificProfile || profiles.default;
    const physicalSensitivitySource = sectorSpecificProfile ? "sector_specific" : "default";
    if (resolvedProfile && resolvedProfile.physical_sensitivity == null) {
      const profileName = sectorSpecificProfile ? `sector '${sector}'` : "sector 'default' (fallback)";
      throw new Error(
        `physical_sensitivity requerido pero no definido en ${profileName} de sector-profiles.json ` +
        `(H-6.13: cada perfil debe declarar physical_sensitivity explícitamente, sin fallback arbitrario)`
      );
    }
    const physicalSensitivity01 = resolvedProfile.physical_sensitivity;
    const sensitivity = Math.round(
      physicalSensitivity01 * (impactConfig?.sensitivity_scale_factor ?? 4)
    ) + (impactConfig?.sensitivity_scale_offset ?? 1);
    const sensitivityClamped = Math.max(1, Math.min(5, sensitivity));

    // H-6.5: exposición derivada del estado del fenómeno y su confianza,
    // usando bandas [floor, floor+band_width] por estado que NUNCA se
    // solapan entre sí, sin importar el valor de confidence.combined.
    // El diseño anterior (base × (0.5 + 0.5×combined), base=4/3/1) permitía
    // que un fenómeno "projected" con alta confianza (combined=0.9 →
    // 3×0.95=2.85→3) superara a uno "active" con baja confianza
    // (combined=0.1 → 4×0.55=2.2→2) — una inversión contraintuitiva: el
    // estado temporal (¿ocurre ahora o es una proyección futura?) debe
    // dominar el ranking de exposición; confidence solo debe modular DENTRO
    // del bloque de un estado, nunca cruzar hacia el bloque de otro estado.
    //
    // Partición: not_detected=[1,1], projected=[2,3], active=[4,5]. Es la
    // única partición de la escala {1..5} en 3 bloques consecutivos,
    // monótonos y sin solape que (a) usa la escala completa sin huecos,
    // (b) da a los 2 estados informativos (projected, active) un bloque de
    // tamaño 2 — el mínimo necesario para que confidence.combined tenga
    // algún efecto observable en una escala entera —, y (c) deja
    // not_detected fijo en 1 (sin modulación: si no hay fenómeno detectado,
    // no hay base física para que la confianza incremente exposición). Ver
    // thresholds.json impact_calculation._refs._h6_5_resolution para el
    // análisis completo, incluyendo por qué no se cita ND-GAIN exposure
    // sub-index (mide exposición biofísica por país, no por estado temporal
    // de un fenómeno — no es una fuente válida para esta escala).
    // CA NO se incluye aquí — está en el denominador de la fórmula
    // riesgo = (P × I) / CA. Incluirla en I sería doble conteo.
    const exposureBands = impactConfig?.exposure_bands ?? {
      active: { floor: 4, band_width: 1 },
      projected: { floor: 2, band_width: 1 },
      not_detected: { floor: 1, band_width: 0 },
    };
    const band = exposureBands[phenomenon.status] ?? exposureBands.not_detected;
    // H-6.11: Number.isFinite guard, not `?? 0` — `??` only replaces
    // null/undefined, it does NOT catch a malformed confidence.combined=NaN
    // arriving from Stage 05. Math.round(NaN * band_width) is NaN even when
    // band_width=0 (NaN * 0 = NaN, not 0), so an unguarded NaN here would
    // propagate through exposure → impact.value → risk_score_raw, the exact
    // failure mode H-6.11 flags for the CA axis. This is the same defensive
    // stage-boundary posture Stage 05 already applies to its own inputs
    // (H-5.12: "el stage es autónomo, no depende de que la validación
    // upstream funcione correctamente").
    const combined = Number.isFinite(phenomenon.confidence?.combined) ? phenomenon.confidence.combined : 0;
    const exposureRaw = band.floor + Math.round(combined * band.band_width);
    const exposure = Math.max(1, Math.min(5, exposureRaw));

    // H-6.3: impacto = round(√(exposure × sensitivity)), clamped [1,5].
    // Media geométrica real (no el producto-dividido-por-5 anterior, que no
    // era una media geométrica pese a llamarse así). √(a×b) se autonormaliza
    // a la misma escala que sus factores — √(5×5)=5, √(1×1)=1 — sin divisor
    // mágico dependiente de que la escala sea 1-5. Penaliza desequilibrio
    // entre exposición y sensibilidad (misma propiedad, y misma justificación
    // OECD/JRC §6.3, que confidence_combination usa para SQ×SS — ver
    // thresholds.json signal_activation._refs.confidence_combination):
    // - agriculture (sens=5) + active+high conf combined≥0.5 (exp=5): impact=round(√25)=5
    // - finance (sens=2) + projected+low conf combined<0.5 (exp=2): impact=round(√4)=2
    // - retail (sens=3) + active+low conf combined<0.5 (exp=4): impact=round(√12)=3
    const impactRaw = Math.round(Math.sqrt(exposure * sensitivityClamped));
    const value = Math.max(1, Math.min(5, impactRaw));

    return {
      value,
      components: {
        exposure,
        sensitivity: sensitivityClamped,
        // H-6.18 (documentacion-v2/stage-06, BAJO): physical_sensitivity
        // (raw 0-1) y sensitivity_scaled (Likert 1-5) se agregan al output
        // para trazabilidad completa: un auditor puede verificar que agriculture
        // (sens=0.9) obtuvo Likert 5, finance (sens=0.3) obtuvo Likert 2, etc.
        // physical_sensitivity es el valor raw del perfil sectorial;
        // sensitivity_scaled es el resultado de round(value × 4) + 1, clamped [1,5].
        physical_sensitivity: physicalSensitivity01,
        sensitivity_scaled: sensitivityClamped,
        // H-6.13: distingue si physical_sensitivity vino del perfil propio
        // del sector o del perfil 'default' de sector-profiles.json — mismo
        // patrón que transition_risk_profile_source (H-16) para riesgos de
        // transición. Sin este campo, un sector real con sensibilidad 0.5
        // sería indistinguible de un sector sin perfil que cayó en el default.
        physical_sensitivity_source: physicalSensitivitySource,
        // CA se incluye en components solo por compatibilidad con
        // RiskAssessmentSchema — no afecta el cálculo de impact.value.
        // CA está en el denominador de la fórmula riesgo = (P × I) / CA.
        adaptive_capacity: adaptiveCapacityScore,
      },
      // H-6.15 (documentacion-v2/stage-06, MEDIO): el contrato (stage-06-risk.md
      // Output Contract) especifica exposure como un array separado con
      // {phenomenon_id, level, factors, context_variables_used}, no anidado
      // dentro de impact.components. exposure_detail empaqueta exactamente
      // esos campos (menos phenomenon_id, que execute() agrega — no lo tiene
      // esta función) para que execute() arme ese array sin recalcular nada.
      // context_variables_used=[] es honesto, no un placeholder: la
      // exposición en este sistema se deriva únicamente de phenomenon.status
      // y confidence.combined (H-6.5) — no consume canonical_variables hoy.
      exposure_detail: {
        level: exposure,
        factors: {
          status: phenomenon.status,
          confidence_combined: combined,
          band: [band.floor, band.floor + band.band_width],
        },
        context_variables_used: [],
      },
      justification: `Impacto calculado: sensibilidad sectorial="${sector}" (fuente=${physicalSensitivitySource}) physical_sensitivity=${physicalSensitivity01} → ${sensitivityClamped}/5 (escala ×${impactConfig?.sensitivity_scale_factor ?? 4}+${impactConfig?.sensitivity_scale_offset ?? 1}), exposición=${exposure}/5 (estado="${phenomenon.status}" banda=[${band.floor},${band.floor + band.band_width}], confianza combined=${combined.toFixed(4)}, H-6.5), impacto=round(√(${exposure}×${sensitivityClamped}))=${value}/5 (media geométrica real, H-6.3). CA=${adaptiveCapacityScore} en denominador (fórmula P×I/CA), no en impacto.`,
    };
  }

  // H-6.8 (documentacion-v2/stage-06, BAJO): classifyRisk simplificado.
  // La implementación anterior tenía high_min=4 redundante con medium_max=4,
  // creando código muerto (la condición ≥4 nunca se alcanzaba porque ≤4 ya
  // capturaba el caso). La lógica ahora es trivialmente correcta:
  //   bajo:  score ≤ low_max (2)
  //   medio: score ≤ medium_max (4)
  //   alto:  score > medium_max (4)
  // El parámetro high_min se eliminó de thresholds.json porque es redundante.
  // La clasificación en 3 categorías es una simplificación de los 5 niveles IPCC
  // AR6 WGII Fig.SPM.1 (ver _refs.low_max_medium_max_high_min en thresholds.json).
  classifyRisk(score, thresholds) {
    if (score <= thresholds.risk_classification.low_max) return "bajo";
    if (score <= thresholds.risk_classification.medium_max) return "medio";
    return "alto";
  }

  // H-6.14 (documentacion-v2/stage-06, MEDIO): catastrophic_multiplier estaba
  // configurado en thresholds.json pero nunca consumido — RiskLevelEnum
  // incluye "catastrofico" pero classifyRisk() nunca lo emitía, y el
  // contrato (stage-06-risk.md Rules Applied §4) exige señalar riesgo
  // catastrófico "independientemente del score si cumple criterios (vida,
  // legal, continuidad, reputación irreversible)".
  //
  // Esas 4 sub-categorías no están representadas como datos en ningún punto
  // del pipeline — inventar un mapeo fenómeno→categoría (ej. "inundacion" =
  // vida, "riesgo regulatorio" = legal) sería fabricar una taxonomía sin
  // fundamento, la misma clase de fabricación que H-6.4/H-6.5/H-6.9/H-6.10
  // ya rechazaron. En su lugar se usa el proxy más defendible disponible con
  // datos reales: impact.value ya es, por construcción (H-6.3/H-6.4/H-6.5),
  // la combinación máxima realista de exposición (fenómeno activo, alta
  // confianza) y sensibilidad sectorial — el techo del marco de severidad
  // de este sistema. Tratar ese techo como disparador de escalamiento por
  // consecuencia, independiente de la probabilidad, es la convención
  // estándar de "consequence override" en matrices de riesgo (ISO
  // 31000/COSO ERM), no una elección arbitraria. Verificación empírica
  // (thresholds.json risk_classification._refs.catastrophic_impact_threshold):
  // solo 1 de 30 combinaciones sector×exposición (3.3%) alcanza impact=5,
  // consistente con el "≥P95 de la distribución de impactos" que
  // catastrophic_multiplier ya citaba como justificación.
  //
  // LIMITACIÓN DECLARADA: este proxy mide "consecuencia física máxima según
  // este sistema", no distingue las 4 dimensiones textuales del contrato
  // (vida/legal/continuidad/reputación irreversible) — el sistema no tiene
  // hoy los datos para esa distinción; se documenta la brecha en el output
  // (catastrophic_assessment.justification) en vez de fabricarla.
  //
  // Cuando se dispara: risk_level="catastrofico" (bypass total de
  // classifyRisk/low_max/medium_max) y risk_score_raw se multiplica por
  // catastrophic_multiplier — cumpliendo literalmente "independientemente
  // del score" del contrato.
  classifyCatastrophic(impact, thresholds) {
    const threshold = thresholds.risk_classification.catastrophic_impact_threshold ?? 5;
    const flagged = impact.value >= threshold;
    return {
      flagged,
      criterion: "impact_at_scale_ceiling",
      threshold,
      justification: flagged
        ? `impact.value=${impact.value} alcanza el umbral catastrophic_impact_threshold=${threshold} (techo de la escala Likert 1-5) — escalado a risk_level="catastrofico" independientemente de probability.value, con catastrophic_multiplier aplicado a risk_score_raw (H-6.14). Proxy de "consecuencia máxima según este sistema", no distingue las 4 sub-categorías del contrato (vida/legal/continuidad/reputación irreversible) — vacío de datos declarado, no fabricado.`
        : `impact.value=${impact.value} no alcanza catastrophic_impact_threshold=${threshold} — clasificación normal via classifyRisk() (bajo/medio/alto).`,
    };
  }

  // H-6.6: el contrato (stage-06-risk.md, Behavior §5) define la clasificación
  // por AÑOS, no por status: "operativo si se materializa en ≤10 años,
  // estratégico si >10 años". La implementación anterior usaba
  // phenomenon.status ("projected" → estrategico, cualquier otro →
  // operativo), ignorando por completo phenomenon.horizon — un fenómeno
  // "active" con horizon="largo" se clasificaba como operativo, contradiciendo
  // el propio horizonte del fenómeno.
  //
  // Corregido a phenomenon.horizon, anclado a horizon_years en
  // thresholds.json (short=5, medium=10, long=30): "corto" (≤5 años) y
  // "mediano" (5-10 años) caen dentro del corte "≤10 años" del contrato →
  // operativo; "largo" (>10 años, ~30) → estrategico. No se usa
  // horizon==="corto" como corte (la alternativa ingenua sugerida en la
  // auditoría) porque eso clasificaría "mediano" (hasta 10 años) como
  // estrategico, violando el propio "≤10 años" del contrato — el corte
  // correcto cae entre "mediano" y "largo", no entre "corto" y "mediano".
  //
  // No se introduce una 3ra categoría "táctico": RiskClassEnum
  // (pipeline/shared/types.js) y el contrato definen explícitamente una
  // dicotomía operativo/estrategico con un único corte en 10 años: IPCC AR6
  // WGII §1.4.3 distingue 3 horizontes temporales (near/mid/late-century)
  // para PROYECCIONES climáticas, pero eso no obliga a que la clasificación
  // de RIESGO de negocio (operativo vs. estrategico) tenga 3 niveles —
  // agregar "táctico" sin que el contrato o el schema de salida lo
  // contemplen requeriría cambiar RiskClassEnum y a todo consumidor
  // downstream sin que el contrato lo pida.
  classifyHorizon(phenomenon) {
    return phenomenon.horizon === "largo" ? "estrategico" : "operativo";
  }

  // H-6.10 (documentacion-v2/stage-06, ALTO): el contrato (stage-06-risk.md
  // Behavior/Rules Applied §5) exige evaluar cada riesgo en ≥2 escenarios
  // (≤2°C y >2°C) y 3 horizontes. Stage06Risk produce exactamente 1
  // evaluación por fenómeno recibido — pero ESTE loop (execute(), "for
  // (const phenomenon of phenomena)") ya escala correctamente a N
  // evaluaciones si Stage 05 alguna vez emite N entradas de fenómeno
  // distintas para el mismo hazard (una por escenario/horizonte); el
  // cuello de botella NO está aquí, está en Stage 05 y en la fuente de
  // datos de proyección:
  // - Escenarios: no existe NINGUNA fuente de datos con dimensión SSP en
  //   este pipeline. Open-Meteo CMIP6 (única fuente de proyecciones, ver
  //   authoritative-sources.json projection_climate) expone solo el
  //   ensemble HighResMIP (~RCP8.5), sin parámetro de escenario
  //   (HALLAZGO-8). Fabricar 2 assessments idénticos etiquetados "≤2°C" y
  //   ">2°C" con el mismo P/I/CA subyacente sería aparentar un análisis
  //   por escenario que no existe — el mismo tipo de fabricación que H-6.4,
  //   H-6.5 y H-6.9 ya rechazaron para otros cálculos de este stage.
  // - Horizontes: Stage 05 (H-5.9, signal-metadata.js inferHorizon())
  //   colapsa deliberadamente las señales corto/mediano/largo de un
  //   fenómeno en UN horizonte inferido por prioridad (largo > mediano >
  //   corto), no emite 3 entradas de fenómeno independientes. Repetir la
  //   MISMA phenomenon.confidence 3 veces con solo la etiqueta de horizonte
  //   distinta produciría 3 assessments byte-idénticos salvo el label —
  //   igual de fabricado.
  //
  // En vez de fabricar esa cobertura, este método la declara explícitamente
  // en cada assessment: cuántos escenarios/horizontes se evaluaron
  // realmente vs. cuántos exige el contrato (evaluation_coverage_requirements
  // en thresholds.json), y por qué. meets_contract=false hoy, de forma
  // honesta y trazable, en vez de ocultarse detrás de los valores por
  // defecto "not_scenario_specific"/"mediano" que ya existían en scenario/
  // horizon. Alternativa NO adoptada de la auditoría (loop anidado
  // scenario×horizon×phenomenon): requeriría que Stage 03 ingiera SSPs
  // (bloqueado por HALLAZGO-8, limitación de la API de Open-Meteo, no de
  // este pipeline) y que Stage 05 deje de colapsar horizontes — ambos
  // cambios de arquitectura fuera del alcance de Stage 6, documentados aquí
  // como el camino real hacia adelante en vez de simulados con datos
  // duplicados.
  computeEvaluationCoverage(thresholds) {
    const req = thresholds.evaluation_coverage_requirements ?? { scenarios_required: 2, horizons_required: 3 };
    const scenariosEvaluated = 1;
    const horizonsEvaluated = 1;
    return {
      mode: "single_scenario_single_horizon",
      scenarios_evaluated: scenariosEvaluated,
      scenarios_required_by_contract: req.scenarios_required,
      horizons_evaluated: horizonsEvaluated,
      horizons_required_by_contract: req.horizons_required,
      meets_contract: scenariosEvaluated >= req.scenarios_required && horizonsEvaluated >= req.horizons_required,
      justification: `Este riesgo se evaluó en ${scenariosEvaluated} escenario(s) y ${horizonsEvaluated} horizonte(s), vs. ${req.scenarios_required} escenarios y ${req.horizons_required} horizontes requeridos por el contrato (stage-06-risk.md Behavior §5). No es un descuido de Stage 6: no existe dimensión de escenario SSP en ningún dato del pipeline (HALLAZGO-8 — Open-Meteo CMIP6 HighResMIP no la expone), y Stage 05 colapsa los horizontes corto/mediano/largo de un fenómeno en uno solo por prioridad (H-5.9). Ver Stage06Risk rulesApplied H-6.10 para el detalle completo.`,
    };
  }
}
