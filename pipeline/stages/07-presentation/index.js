import { StageInterface } from "../../shared/stage-interface.js";
import { getThresholds, getAdaptationMeasures, getPhenomenonDefinitions } from "../../orchestration/config-loader.js";
import { PresentationInputSchema } from "../../shared/types.js";
import { PresentationError } from "../../shared/errors.js";

const RISK_LABELS = { bajo: "Bajo", medio: "Medio", alto: "Alto", catastrofico: "Catastrófico" };
// H-7.5 (documentacion-v2/stage-07, BAJO): catastrofico colapsaba a "rojo",
// el mismo color que alto — la distinción entre "riesgo alto" y un
// consequence-override de catastrofico (H-6.14) se perdía visualmente,
// quedando solo en el label textual. "morado" (no un rojo más oscuro) se
// eligió por 2 razones: (1) precedente ya activo en la UI de producción de
// este pipeline — src/features/climate-lookup-v2/components/riskLevelStyles.js
// (consumido por RiskSummaryV2.jsx y PhenomenaGridV2.jsx, la ruta /v2 real)
// ya usa purple-500 para catastrofico, independientemente de este campo;
// (2) un cambio de matiz (rojo→morado) es más distinguible que un cambio de
// tono (rojo claro→rojo oscuro) para usuarios con deficiencias de visión de
// color rojo-verde (~8% de hombres) — WCAG 1.4.1 desaconseja transmitir
// significado solo por variación de luminosidad dentro de un mismo matiz.
// src-new/components/ExecutiveDashboard/{RiskSummary,PhenomenonCard}.jsx
// usaban independientemente un rojo más oscuro para catastrofico (inconsistente
// con riskLevelStyles.js) — alineados a "morado" en el mismo cambio para que
// las 2 superficies de UI conocidas coincidan con esta fuente semántica.
const RISK_COLORS = { bajo: "verde", medio: "ámbar", alto: "rojo", catastrofico: "morado" };
const TRANSITION_TYPE_LABELS = {
  regulatory: "Regulatorio",
  market: "Mercado",
  technology: "Tecnológico",
  reputational: "Reputacional",
  physical: "Físico",
};

// H-7.3: caps para que "recomendaciones priorizadas" (contrato, Behavior §1)
// sea literal — una lista de 10 recomendaciones no está priorizada, está
// completa. 3 físicas + 2 de transición es un límite editorial (no viene de
// una fuente citada), documentado como tal en vez de implícito; el orden
// dentro de cada lista SÍ está fundamentado (risk_score_raw / signal_strength
// descendente, ver buildRecommendations()).
const MAX_PHYSICAL_RECOMMENDATIONS = 3;
const MAX_TRANSITION_RECOMMENDATIONS = 2;

// H-7.4: copia literal de thresholds.json confidence_to_probability.mapping
// (Stage 06Risk.DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING mirrors la misma
// tabla, H-6.7) — NO se importa desde pipeline/stages/06-risk/index.js
// porque los 7 stages están deliberadamente desacoplados (spec-kit
// 001-climate-risk-pipeline-rebuild): un import cruzado entre stages
// crearía una dependencia directa que el diseño evita. thresholds.json es
// la fuente de verdad real para ambos stages; esta constante es solo el
// mismo fallback defensivo que Stage 6 ya usa cuando la config falla en
// cargar, mantenido en su propio archivo por la misma razón que Stage 6
// mantiene el suyo.
const DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING = [
  [0.0, 1],
  [0.2, 2],
  [0.4, 3],
  [0.6, 4],
  [0.8, 5],
];

export class Stage07Presentation extends StageInterface {
  constructor() {
    super(7, "Presentation");
    this.rulesApplied = [
      // H-7.11 (documentacion-v2/stage-07, BAJO): estas 4 reglas eran texto
      // declarativo sin verificación — 2 de las 4 (evidencia en narrativa,
      // templates literales del contrato) NO eran ciertas en el código de
      // ese momento (buildExecutiveSummary() generaba una narrativa ad-hoc
      // sin ningún enlace, corregido después por H-7.2). Ahora las 4 SÍ
      // están verificadas programáticamente — cada una cita el método que
      // la implementa y el test que la prueba (tests-new/pipeline/stages/
      // stage-07-presentation.test.js, describe 'rulesApplied compliance
      // (H-7.11)') — y la redacción de la regla 2 se alineó palabra por
      // palabra con stage-07-presentation.md Rules Applied §2 (antes decía
      // solo 'enlace al artefacto de evidencia'; el contrato dice 'un
      // enlace interno al artefacto de evidencia (trace_id + señal/fenómeno
      // específico)' — la discrepancia de redacción era el punto #4 del
      // hallazgo original).
      "Todo valor numérico se traduce a categoría semántica antes de mostrar — verificado: overall_risk.level/risk_composite.level (H-7.1), risk_contribution.level (H-7.7) y confidence_note (H-7.4) siempre acompañan a su score/valor numérico correspondiente, nunca se emite un número sin su categoría.",
      "Toda afirmación en la narrativa ejecutiva tiene un enlace interno al artefacto de evidencia (trace_id + señal/fenómeno específico) — implementado en buildExecutiveSummary()/evidence_summary (H-7.2): cada executive_summary incluye literalmente 'trace_id=...' y, cuando hay un fenómeno driver, 'phenomenon_id=...'. Verificado con test que falla si el patrón desaparece.",
      "La respuesta de UI es una proyección, no el artefacto completo — verificado: getSourcesUsed()/getSourcesOutOfCoverage() (H-7.8/H-7.10) y getSignalDetail() (H-7.8) proyectan campos específicos desde sources_consulted/signals, ninguno incluye source.response (el JSON crudo de la API externa) ni signal.source_variables completo sin resumir.",
      "Narrativas son templates — no hay generación con IA — verificado por determinismo: buildExecutiveSummary() con el mismo input produce siempre el mismo string (sin llamadas a red, sin aleatoriedad); una narrativa generada por IA no tendría esa garantía. Test dedicado llama el método 2 veces con el mismo input y compara.",
      "H-7.11 (documentacion-v2/stage-07, BAJO): las 4 reglas arriba se declaraban sin verificación programática, y su redacción no coincidía con el contrato (stage-07-presentation.md Rules Applied §2: 'un enlace interno al artefacto de evidencia (trace_id + señal/fenómeno específico)' vs. el texto previo 'enlace al artefacto de evidencia') — además, 2 de las 4 reglas NO eran ciertas en el momento en que se declaró este hallazgo (la evidencia en la narrativa se implementó recién en H-7.2). Corregido: (1) redacción alineada palabra por palabra con el contrato; (2) cada regla ahora cita el método/H-7.x que la implementa; (3) se agregó una suite de tests 'rulesApplied compliance' que verifica programáticamente las 4 reglas contra el output real, no contra la intención declarada. El contrato también define una 5ta regla (§4: exportación PDF con el artefacto completo como anexo técnico) que Stage 7 NO implementa — no existe lógica de generación de PDF en ningún punto de este archivo. Se declara explícitamente como brecha NO IMPLEMENTADA en vez de omitirla silenciosamente del rulesApplied (mismo criterio de H-6.10/H-7.3: declarar el vacío, no ocultarlo) — implementarla está fuera del alcance de este hallazgo (BAJO, sobre reglas declarativas, no sobre construir exportación PDF).",
      "GAP DECLARADO (contrato §4, NO IMPLEMENTADO): 'Si se solicita exportación (PDF), el artefacto completo puede incluirse como anexo técnico, no en la vista por defecto' — Stage 7 no tiene ninguna ruta de exportación PDF; view solo acepta 'executive'|'analyst' (PresentationInputSchema, H-7.9). Declarado aquí para que rulesApplied refleje honestamente lo que el código hace y lo que el contrato pide pero el código no cubre, en vez de una lista que solo enumera éxitos.",
      "H-7.1/H-7.14 (documentacion-v2/stage-07, MEDIO): calculateOverallRisk() usaba max-risk puro — un solo fenómeno 'catastrofico' entre 9 'bajo' dominaba overall_risk.level, sin documentación ni alternativas comparadas, y sin distinguir '1 fenómeno alto' de '5 fenómenos altos'. Corregido SIN reemplazar max-risk (sigue siendo overall_risk.level): max-risk se documenta explícitamente como 'worst-case conservador' (COSO ERM 2017 §4.3 'risk aggregation' + ISO 31000:2018 §6.6, que deja la consolidación a criterio organizacional) y se complementa con 2 indicadores nuevos que dan el contexto que max-risk por sí solo no puede dar: risk_composite (promedio simple de risk_score_raw entre fenómenos — ponderación igual, Laplace/máxima entropía, mismo criterio que H-6.16 ya usó para indicadores de CA sin AHP) y risk_count (tally bajo/medio/alto/catastrofico). No se reemplazó max-risk por el promedio como level PRINCIPAL: un comité de riesgo esperaría que 'catastrofico' se muestre como tal aunque sea 1 de 10 fenómenos — diluirlo en un promedio ocultaría la cola de la distribución, exactamente lo que COSO ERM §4.3 advierte contra en agregación de riesgo de portafolio. Ver thresholds.json overall_risk_consolidation para la comparación completa con 3 alternativas (max-risk, promedio ponderado, suma de scores) y la justificación de por qué NO se implementó un enfoque de portafolio con correlación entre fenómenos (no existe en este pipeline ningún dato de correlación entre hazards — fabricarlo sería la misma clase de precisión inexistente que H-6.4/H-6.5/H-6.9/H-6.10 ya rechazaron en Stage 6).",
      "H-7.2 (documentacion-v2/stage-07, MEDIO): buildExecutiveSummary() generaba una narrativa ad-hoc que ignoraba por completo el template del contrato (stage-07-presentation.md, Narrative Template: '{location} presenta exposición {level} a fenómeno {phenomenon_name} {status}. {confidence_note}. {evidence_summary}. {recommendation_intro}') — no incluía phenomenon_name, status, confidence_note, evidence_summary ni recommendation_intro, no enlazaba trace_id (violando Rules Applied §2 del contrato: 'toda afirmación en la narrativa ejecutiva tiene un enlace interno al artefacto de evidencia'), y no validaba sector antes de interpolarlo ('para el sector undefined' si sector faltaba). Corregido implementando el template literal del contrato. Decisión de diseño no explícita en el contrato: el template usa singular ('a fenómeno {phenomenon_name}'), pero Stage 7 recibe N assessments — se resolvió usando el MISMO fenómeno 'driver' que ya determina overall_risk.level (H-7.1: el assessment con risk_level máximo, ahora expuesto como driver_phenomenon_id en calculateOverallRisk()), no un fenómeno arbitrario ni una lista. Esto mantiene coherencia interna: el semáforo (overall_risk.level) y el fenómeno nombrado en la narrativa son siempre el mismo — evita la incongruencia de mostrar 'Alto' en el semáforo mientras la narrativa habla de un fenómeno de menor severidad. evidence_summary ahora cita explícitamente trace_id + phenomenon_id del driver (cumpliendo Rules Applied §2 del contrato), no una referencia genérica. recommendation_intro se deriva de las recomendaciones YA calculadas por buildRecommendations() (recommendations ahora se calcula antes que executive_summary en execute()) — reutiliza el mismo texto en vez de fabricar una segunda narrativa de recomendación independiente que podría divergir. sector se valida con sector?.trim() || 'no especificado', evitando 'undefined' interpolado literalmente (alternativa sugerida por la auditoría, adoptada sin modificación).",
      "H-7.3 (documentacion-v2/stage-07, MEDIO): buildRecommendations() producía 0-2 textos estáticos hardcodeados ('Implementar medidas de adaptación estructural...', 'Evaluar estrategia de transición...') sin importar el sector, el fenómeno, el número de fenómenos afectados, o el tipo de riesgo de transición — y no distinguía 'sin datos' de 'datos pero todo bajo'. Corregido implementando la matriz de recomendaciones configurable que la auditoría sugería: pipeline/config/adaptation-measures.json, indexada por fenómeno×sector (riesgo físico) y por tipo×sector (riesgo de transición), con fuente primaria Anexo 10.2 Catálogo de Riesgos y Medidas de Adaptación (documento interno) — NO texto genérico inventado. Cobertura sector-específica verificada solo para 'retail' y 'finance' (los únicos sectores de este pipeline con equivalente directo en el Anexo); agriculture/energy/infrastructure y los fenómenos sin fila en el catálogo (la_nina, ola_de_frio) caen a generic_measures/generic_transition_measures — filas del Anexo etiquetadas 'Todas las plataformas', genuinamente sector-agnósticas por diseño del documento fuente, NO una generalización fabricada por este sistema (ver adaptation-measures.json _methodology.coverage_gap para el detalle completo, mismo criterio de 'declarar el vacío en vez de fabricar precisión' que H-6.4/H-6.5/H-6.9/H-6.10/H-6.16/H-7.1 ya aplicaron). Priorización (contrato Behavior §1: 'recomendaciones priorizadas'): assessments con risk_level≠bajo se ordenan por risk_score_raw descendente (no solo por la categoría discreta bajo/medio/alto/catastrofico) — resuelve el punto #5 del hallazgo: un 'medio' con risk_score_raw alto por alta probabilidad puede superar en prioridad a un 'alto' con score menor, porque risk_score_raw (Stage 6, fórmula ISO 31000 P×I/CA) ya captura esa información continua que la categoría ordinal colapsa. Transition risks se ordenan por signal_strength descendente. Ambas listas se capan (MAX_PHYSICAL_RECOMMENDATIONS=3, MAX_TRANSITION_RECOMMENDATIONS=2 — límite editorial no citado, documentado como tal) para que 'priorizadas' no degenere en 'todas'. 'Sin datos' (assessments null/undefined) y 'datos pero todo bajo' (assessments no vacío, ningún risk_level≠bajo) ahora producen textos distintos — la distinción epistemológica que el hallazgo #2 señalaba.",
      "H-7.4 (documentacion-v2/stage-07, MEDIO): buildConfidenceNote() promediaba assessment.probability.value/5 bajo el nombre avgSQ ('source quality'), pese a que probability.value NO es una medida de calidad de fuente ni de confianza epistémica — es la probabilidad del fenómeno, que además (H-6.9) puede venir de una fuente externa (GRI Oxford) sin relación alguna con qué tan confiable es la evaluación. Los umbrales 0.7/0.4 eran, además, una reutilización sin justificar de otro umbral (parecidos mas no idénticos a signal_activation.signal_strength_labels, que etiqueta una magnitud distinta: signal_strength solo, no confidence.combined). Corregido leyendo phenomenon.confidence.combined (Stage 05, geometric mean SQ×SS, H-5.13 — la medida de confianza epistémica real) vía cross-reference phenomenon_id↔phenomena (mismo patrón que driverPhenomenon en H-7.2), mapeado a ordinal 1-5 con la MISMA tabla confidence_to_probability.mapping que Stage 6 ya usa para esta exacta variable (H-6.7) — reutilización principiada de un umbral ya citado para la magnitud correcta, no un umbral nuevo ni uno prestado de otra magnitud. Los ordinales se promedian entre fenómenos (igual peso, Laplace — mismo criterio que risk_composite en H-7.1) y el promedio se clasifica [1,3)→baja, [3,4)→media, [4,5]→alta, el mismo tipo de colapso de la escala Likert 1-5 de IPCC AR6 WGII Fig.SPM.1 a 3 categorías que risk_classification.low_max_medium_max ya usa (thresholds.json _refs). confidence.combined ausente/no-finito para un fenómeno se EXCLUYE del promedio (mismo criterio H-5.6, null≠0); si ningún assessment tiene confidence.combined disponible, retorna un mensaje distinto ('Confianza no evaluable') en vez de fabricar un promedio sobre cero datos.",
      "H-7.5 (documentacion-v2/stage-07, BAJO): RISK_COLORS colapsaba catastrofico a 'rojo', el mismo color que alto — la distinción visual entre un riesgo alto ordinario y un consequence-override de catastrofico (H-6.14) se perdía en el semáforo, quedando solo en RISK_LABELS (textual). Corregido a 'morado' para catastrofico, NO un rojo más oscuro, por 2 razones documentadas en el comentario junto a RISK_COLORS: (1) src/features/climate-lookup-v2/components/riskLevelStyles.js — consumido por RiskSummaryV2.jsx y PhenomenaGridV2.jsx, la superficie de UI real que sirve /v2 — ya usa purple-500 para catastrofico independientemente de este campo; adoptar el mismo matiz aquí evita que Stage 7 emita un 'color' semántico que contradiga lo que la UI de producción ya muestra. (2) Un cambio de matiz es más distinguible que un cambio de luminosidad dentro del mismo matiz para deficiencias de visión de color rojo-verde (~8% de hombres) — WCAG 1.4.1. Como consecuencia de esta decisión, se alinearon también src-new/components/ExecutiveDashboard/RiskSummary.jsx y PhenomenonCard.jsx (usaban independientemente un rojo más oscuro, divergente de riskLevelStyles.js) al mismo morado — sin este alineamiento, la corrección de Stage 7 habría creado una TERCERA convención de color en vez de resolver la inconsistencia entre las 2 ya existentes.",
      "H-7.6 (documentacion-v2/stage-07, BAJO): formatPhenomenonName() tenía un mapa hardcodeado con solo 7 de las 9 entradas de PhenomenonNameEnum (pipeline/shared/types.js) — deslizamiento y huayco faltaban por completo, cayendo al fallback name.replace(/_/g,' ') sin capitalizar (inconsistente con el resto del mapa, que sí capitaliza) — y ningún nombre citaba una fuente meteorológica/institucional. Corregido moviendo el mapa a phenomenon-definitions.json display_names (fuente única de verdad para metadatos de fenómeno — ya lo es para required_signals/scientific_reference/etc., un nombre de presentación es el mismo tipo de metadato), con las 9 entradas del enum cubiertas y cada una citando su fuente (WMO/SENAMHI para ola_de_calor/ola_de_frio/sequia/vientos_fuertes, IPCC/INDECI para inundacion, NOAA/SENAMHI para el_nino/la_nina, INGEMMET para deslizamiento, INDECI/SENAMHI para huayco). Caso notable: el display name de 'huayco' es 'Huaico' (con 'i'), NO 'Huayco' (con 'y', la ortografía del identificador interno) — 'huaico' es la ortografía oficial en documentos de gestión de riesgo peruanos (INDECI, SENAMHI, y el propio Anexo 10.2 usado en H-7.3), documentado explícitamente en vez de asumir que el identificador snake_case es también el texto correcto en español. El fallback (para cualquier nombre fuera del enum, robustez futura) ahora SÍ capitaliza cada palabra, cerrando el punto #4 del hallazgo.",
      "H-7.7 (documentacion-v2/stage-07, BAJO): getRiskContribution() retornaba risk_score_raw crudo (ej. 3.5) sin ninguna indicación de su escala — un consumidor no puede saber si 3.5 es alto o bajo sin conocer que el rango de la fórmula (P×I)/CA (P,I,CA∈[1,5] Likert, ISO 31000:2018 §6.6) es [0.2, 25], extendido a 37.5 cuando catastrophic_multiplier (H-6.14) se aplica. Corregido agregando score_scale={min,max,formula} a cada risk_contribution — mismo principio que H-7.1/H-7.4 ya aplicaron: nunca exponer un número derivado sin su fórmula/rango. El fallback score=0 para un fenómeno sin assessment se corrigió a score=null (alternativa explícita de la auditoría) — 0 está fuera del rango real alcanzable por la fórmula (mínimo=0.2), así que era un valor fabricado, no uno que ningún cálculo real produce; null es honesto ('sin assessment'), mismo criterio que CA=null en Stage 6 (H-6.2). level se mantiene 'bajo' en ese fallback (fuera del alcance de este hallazgo). score ahora se redondea a 2 decimales: P/I/CA son enteros Likert, así que más precisión decimal no está sustentada por los insumos ordinales.",
      "H-7.8 (documentacion-v2/stage-07, MEDIO): sources_out_of_coverage y signal_detail (vista analyst) eran [] SIEMPRE, no porque el dato no exista sino porque nadie leyó lo que ya llega en `input` — el motor real de producción (pipeline/orchestration/engine.js, PipelineEngine.run(): 'Object.assign(pipelineState, result)' tras CADA stage — usado por server/climate-v2.js; pipeline/orchestration/orchestrator.js define una clase equivalente pero NUNCA se instancia en ningún punto del código, ver H-7.9 nota de corrección) aplana el output de todos los stages anteriores y lo reenvía completo a cada stage siguiente. Se verificó línea por línea que ningún stage intermedio (02/03/05/06) reutiliza las claves 'sources_consulted' (Stage 1) o 'signals' (Stage 4) — Stage02 retorna validated_sources/coverage_decisions, Stage03 retorna canonical_variables/excluded_variables/source_decisions, Stage05 retorna phenomena/phenomena_not_detected, Stage06 retorna assessments/exposure/adaptive_capacity/transition_risks — ninguna colisiona, así que input.sources_consulted e input.signals llegan intactos a Stage 7. Corregido implementando getSourcesOutOfCoverage() (complemento exacto de getSourcesUsed() ya existente, mismo array, filtro inverso: coverage_status!=='available') y getSignalDetail() (mapea input.signals a {signal_id, name, type, source_quality, signal_strength, contributing_to} — contributing_to cruza phenomenon.contributing_signals de Stage 5, dato derivado no fabricado). LÍMITE DECLARADO: signals_discarded (Stage 4, señales que NO pasaron min_signal_strength) no se incluye en signal_detail — Stage05Phenomena.execute() no reenvía esa clave en su output, así que no sobrevive el aplanado hasta Stage 7; incluirla requeriría un cambio en Stage 5 (fuera del alcance de este hallazgo), documentado aquí en vez de fabricado.",
      "H-7.9 (documentacion-v2/stage-07, MEDIO): execute() no validaba la forma del input — location.location_name o assessments.length lanzaban TypeError genéricos no controlados (sin code/detail estructurados) si location/assessments faltaban o tenían el tipo equivocado. Corregido con validateInput(), que parsea contra PresentationInputSchema (pipeline/shared/types.js, nuevo) y envuelve cualquier fallo en PresentationError (pipeline/shared/errors.js — la clase ya existía, pero H-7.9 es su primer uso real en todo el pipeline; ningún otro stage la usaba tampoco pese a tener su propio *Error definido). Alcance deliberadamente NO exhaustivo: location es el único campo que causa un throw real (sin él, Stage 7 no puede renderizar nada, ni el nombre de la ubicación), validado con el MISMO LocationSchema que pipeline/orchestration/engine.js (PipelineEngine.run(), el motor REAL usado por server/climate-v2.js) ya usa en la entrada del pipeline (fuente única, no una copia más laxa) — CORRECCIÓN sobre H-7.8: ese hallazgo citaba pipeline/orchestration/orchestrator.js como 'el orchestrator'; verificado aquí que esa clase (PipelineOrchestrator) nunca se instancia en ningún archivo del repo (grep 'new PipelineOrchestrator' sin resultados) — es código muerto/scaffolding paralelo a engine.js, con la misma lógica de aplanado pero sin uso real. La validación de location en Stage 7 es honestamente redundante en el camino de producción (engine.js ya valida en la entrada), pero necesaria para cualquier llamada directa a stage.execute() que no pase por el engine — exactamente el escenario que este hallazgo señala. sector/assessments/phenomena NO causan throw — H-7.2 ya construyó y testeó una degradación elegante para sector ausente ('no especificado') y H-7.3/H-7.4 ya construyeron mensajes distintos para assessments vacío/ausente ('sin datos' vs. 'datos pero todo bajo') — convertir esos casos en errores duros habría sido una regresión de trabajo ya hecho, no una mejora. assessments/phenomena solo se validan como arrays de objetos con phenomenon_id (el campo mínimo que H-7.2/H-7.4/H-7.7/H-7.8 ya usan para cruzar datos entre sí) — no se re-valida cada campo de RiskAssessmentSchema/ClimatePhenomenonSchema, que es responsabilidad de contrato de Stage 6/Stage 5, no de Stage 7 reverificando su propio upstream. El schema usa .passthrough() en la raíz y en cada elemento de array porque el orchestrator reenvía el pipelineState completo (H-7.8) — un schema .strict() rechazaría una llamada real por campos que Stage 7 simplemente ignora.",
      "H-7.10 (documentacion-v2/stage-07, BAJO): getSourcesUsed() solo mostraba fuentes coverage_status==='available', y ni ese método ni sources_out_of_coverage (H-7.8) incluían más que {name, domain, status} pese a que RawSourceResponseSchema (pipeline/shared/types.js) trae authority_level/spatial_distance_km/resolution_native/duration_ms por fuente. El punto #1/#3 del hallazgo original ('un analista no puede ver qué fuentes fallaron', 'el contrato implica mostrar TODAS las fuentes') YA quedó resuelto por H-7.8: sources_used ∪ sources_out_of_coverage cubre TODO input.sources_consulted — nada se oculta. Lo que faltaba (punto #2) era enriquecer el shape por fuente; corregido con mapSourceSummary(), un mapper único reusado por ambos métodos (antes cada uno construía su propio objeto por separado, con el mismo riesgo de divergencia que H-7.2 ya evitó para recommendation_intro). NO se agregaron coverage_percentage/last_updated/reliability_score (sugeridos en la auditoría): ningún stage de este pipeline calcula esos 3 valores — fabricarlos habría sido la misma clase de precisión inexistente que H-6.4/H-6.9/H-7.3/H-7.7 ya rechazaron; se exponen en cambio los 4 campos reales que sí existen. El criterio binario available/no-available para separar los 2 métodos se documentó explícitamente como el mismo piso ISO/IEC 25012:2008 §6.1 que thresholds.json signal_activation._refs.min_source_quality ya cita — reutilización principiada, no un umbral nuevo. Se verificó además que 'partial'/'unknown' (2 de los 5 valores de CoverageStatusEnum) NUNCA aparecen en sources_consulted — los adapters de Stage 1 solo emiten available/out_of_coverage/failed; esos 2 valores adicionales los calcula Stage02/03 sobre validated_sources, un array que Stage 7 no consume — así que available/no-available es una partición COMPLETA del espacio real de valores en sources_consulted, no una colisión binaria de un gradiente más rico que se esté perdiendo.",
      "H-7.12 (documentacion-v2/stage-07, BAJO): execute() era sync mientras StageInterface.execute() (pipeline/shared/stage-interface.js) se declara async — mismo hallazgo que H-6.17 (Stage 6) y H-5.20 (Stage 5) ya corrigieron con el mismo criterio. Corregido agregando 'async' a la firma, sin cambiar ningún comportamiento: el motor real de producción (pipeline/orchestration/engine.js, PipelineEngine.run() — usado por server/climate-v2.js y server-new/server.js) ya hacía 'await stage.execute(stageInput)' genéricamente para todos los stages (funciona igual con una función sync o async), así que este cambio es transparente para el pipeline real — H-7.9 (validateInput) y todos los métodos internos (calculateOverallRisk, buildRecommendations, buildConfidenceNote, getRiskContribution, getSourcesUsed/getSourcesOutOfCoverage/getSignalDetail, mapSourceSummary) permanecen sync: ninguno hace I/O, todos leen config ya cacheada en memoria (config-loader.js) — solo execute() necesitaba el ajuste de firma para satisfacer el contrato de StageInterface, no una cascada de 'async' hacia cada método interno que no lo necesita. Se actualizaron las 2 rutas de llamada directa (no vía PipelineEngine) que invocaban execute() sin await: transition-risks.test.js (2 casos) y los ~17 bloques de test en stage-07-presentation.test.js que llaman a stage.execute() directamente — mismo patrón exacto que H-6.17 aplicó en su momento a stage-06-risk.test.js.",
      "H-7.13 (documentacion-v2/stage-07, BAJO): execute() retorna {view, response}, sin stage/status/evidence_artifact que el contrato (stage-07-presentation.md, versión original) declaraba en el mismo nivel. Investigado y NO corregido agregando esos campos a execute() — corregido el contrato en su lugar, por 3 razones verificadas: (1) NINGÚN stage del pipeline retorna stage/status desde su propio execute() — verificado en Stage 5 (retorna {phenomena, phenomena_not_detected}) y Stage 6 (retorna {assessments, exposure, adaptive_capacity, transition_risks, transition_risk_profile_source}), cuyos contratos (stage-05-phenomena.md, stage-06-risk.md) declaran el MISMO patrón stage/status que Stage 7 — es boilerplate de spec-kit repo-wide anterior a StageInterface, no un descuido específico de Stage 7; agregarlo solo aquí habría creado a Stage 7 como la única excepción en vez de resolver la inconsistencia. (2) StageInterface.wrapArtifact() (pipeline/shared/stage-interface.js) YA agrega el envelope genérico (stage_id, stage_name, status, duration_ms, error) para los 7 stages por igual, vía el motor real (engine.js: 'stage.wrapArtifact(stageInput, result, status, error, stageStart)') — agregar stage/status DENTRO de execute() habría creado una CUARTA representación del 'stage 7' compitiendo con las 3 que ya existen en el código: stage_id=7 (numérico, wrapArtifact), stage_name='Presentation' (legible, wrapArtifact), y stage='presentation' (dominio de error, PresentationError en errors.js — la única de las 3 que coincide en VALOR con lo que el contrato pedía, pero en una capa distinta). (3) evidence_artifact (declarado como INPUT, no output, en la v1 del contrato) es estructuralmente irrecibible por Stage 7: EvidenceArtifactBuilder.build() (pipeline/artifact/builder.js) se invoca DESPUÉS de que el loop de los 7 stages termina (engine.js) — el artefacto que contendría a Stage 7 mismo no existe todavía cuando Stage 7 se ejecuta. Eliminado del Input Contract con esta explicación en vez de dejarlo como un campo aspiracional nunca implementable. El contrato ahora documenta explícitamente las 2 shapes reales (retorno de execute() vs. artefacto envuelto por wrapArtifact()) y por qué NO se unifican en un tercer shape dentro de execute().",
      "G1 (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, ALTA): evaluation_coverage (Stage 06, computeEvaluationCoverage()/H-6.10) declara honestamente, por assessment, que el pipeline evalúa 1 escenario y 1 horizonte en vez de los 2/3 exigidos por el contrato (stage-06-risk.md Behavior §5, meets_contract=false en la práctica actual por HALLAZGO-8 — Open-Meteo CMIP6 sin dimensión SSP). Ese dato llegaba intacto a input.assessments[].evaluation_coverage vía el aplanado de engine.js, pero ningún método de Stage 7 lo leía — un usuario o analista no podía ver que el propio sistema declara no cumplir su contrato de cobertura. Corregido en 2 niveles: (1) risk_calculation (vista analyst) ahora incluye evaluation_coverage completo por assessment; (2) overall_risk.evaluation_coverage_summary (AMBAS vistas, vive en `base`) agrega cuántos assessments no cumplen el contrato y cita la justificación de Stage 6 — sin fabricar un umbral nuevo, solo proyectando lo que Stage 6 ya calcula.",
    ];
  }

  // H-7.9 (documentacion-v2/stage-07, MEDIO): execute() no validaba la forma
  // del input — location.location_name o assessments.length lanzaban
  // TypeError genéricos no controlados si location/assessments faltaban.
  // Corregido validando contra PresentationInputSchema (pipeline/shared/types.js,
  // ver el comentario ahí para las decisiones de alcance: location es el
  // único campo verdaderamente requerido, sector/assessments/phenomena
  // degradan con gracia en vez de fallar — H-7.2/H-7.3/H-7.4 ya construyeron
  // y testearon esa degradación, no tiene sentido convertirla en un error
  // duro aquí). Cualquier fallo de Zod se envuelve en PresentationError
  // (pipeline/shared/errors.js — existía pero ningún stage lo usaba todavía)
  // en vez de dejar propagar un ZodError o un TypeError sin código/detail
  // estructurados — wrapArtifact() (stage-interface.js) ya espera
  // error.code/error.message/error.detail, que un TypeError plano no tiene.
  validateInput(rawInput) {
    const result = PresentationInputSchema.safeParse(rawInput);
    if (!result.success) {
      throw new PresentationError(
        "INVALID_INPUT",
        `Input inválido para Stage 7 (Presentation): ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        { issues: result.error.issues }
      );
    }
    return result.data;
  }

  // H-7.12 (documentacion-v2/stage-07, BAJO): async para consistencia con
  // StageInterface.execute() (async) — mismo criterio que H-6.17/H-5.20 ya
  // aplicaron en Stages 6/5. Ningún método interno hace I/O (config ya
  // cacheada en memoria), así que solo esta firma necesitaba el ajuste.
  async execute(rawInput) {
    const input = this.validateInput(rawInput);
    const { location, sector, assessments, phenomena, transition_risks, view } = input;
    const overallRisk = this.calculateOverallRisk(assessments);

    const base = {
      location: {
        name: location.location_name || `${location.lat}, ${location.lon}`,
        coordinates: { lat: location.lat, lon: location.lon },
      },
      overall_risk: {
        level: overallRisk.level,
        label: RISK_LABELS[overallRisk.level] || "Desconocido",
        color: RISK_COLORS[overallRisk.level] || "gris",
        method: "max-risk (worst-case conservador — COSO ERM 2017 §4.3, ISO 31000:2018 §6.6). Ver risk_composite y risk_count para el contexto de concentración que max-risk no captura por sí solo (H-7.1/H-7.14, thresholds.json overall_risk_consolidation).",
        risk_composite: {
          score: overallRisk.compositeScore,
          level: overallRisk.compositeLevel,
          label: RISK_LABELS[overallRisk.compositeLevel] || "Desconocido",
        },
        risk_count: overallRisk.riskCount,
        // G1 (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, ALTA): visible
        // en AMBAS vistas (executive y analyst, porque vive en `base`) — un
        // usuario final puede ver que el sistema declara honestamente que no
        // cumple su propio contrato de cobertura multi-escenario/horizonte,
        // en vez de que ese dato quede enterrado solo en el detalle analyst
        // de cada assessment (ver evaluation_coverage en risk_calculation).
        evaluation_coverage_summary: overallRisk.evaluationCoverageSummary,
      },
      phenomena: (phenomena || []).map(p => ({
        name: this.formatPhenomenonName(p.name),
        status: this.formatStatus(p.status),
        risk_contribution: this.getRiskContribution(p, assessments),
      })),
      // H-7.2: recommendations se calcula ANTES que executive_summary
      // (invirtiendo el orden anterior) porque recommendation_intro reusa
      // este mismo array — evita una segunda narrativa de recomendación
      // independiente que podría divergir del texto real mostrado abajo.
      // H-7.3: sector y phenomena ahora se pasan para personalizar por
      // fenómeno×sector — antes buildRecommendations() ni siquiera recibía
      // estos parámetros.
      recommendations: this.buildRecommendations(assessments, transition_risks, sector, phenomena),
      // H-7.4: phenomena se pasa para que buildConfidenceNote() pueda leer
      // phenomenon.confidence.combined — antes ni siquiera recibía este
      // parámetro porque usaba assessment.probability.value (magnitud
      // distinta, ver rulesApplied H-7.4).
      confidence_note: this.buildConfidenceNote(assessments, phenomena),
      trace_id: input.execution_id || "",
    };
    base.executive_summary = this.buildExecutiveSummary(
      location,
      overallRisk,
      assessments,
      sector,
      transition_risks,
      phenomena,
      base.recommendations,
      base.trace_id
    );

    if (view === "analyst") {
      return {
        view: "analyst",
        response: {
          ...base,
          sources_used: this.getSourcesUsed(input),
          // H-7.8 (documentacion-v2/stage-07, MEDIO): sources_out_of_coverage
          // y signal_detail eran [] siempre — no porque el dato no exista,
          // sino porque nadie leyó lo que YA llega en `input`. El motor real
          // de producción (pipeline/orchestration/engine.js, PipelineEngine.run(),
          // usado por server/climate-v2.js — NO pipeline/orchestration/orchestrator.js,
          // que no se instancia en ningún punto del código, ver H-7.9)
          // aplana el output de CADA stage anterior en pipelineState y lo
          // reenvía completo a cada stage siguiente — input.sources_consulted
          // (Stage 1) e input.signals (Stage 4) sobreviven intactos hasta
          // Stage 7 (verificado: ningún stage intermedio reutiliza esas 2
          // claves). Ver rulesApplied H-7.8 para el detalle completo.
          sources_out_of_coverage: this.getSourcesOutOfCoverage(input),
          signal_detail: this.getSignalDetail(input, phenomena),
          risk_calculation: assessments.map(a => ({
            phenomenon_id: a.phenomenon_id,
            risk_score_raw: a.risk_score_raw,
            probability: a.probability,
            impact: a.impact,
            adaptive_capacity: a.adaptive_capacity,
            // G1 (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, ALTA):
            // evaluation_coverage ya lo calcula Stage 06
            // (computeEvaluationCoverage(), H-6.10) y llegaba intacto vía el
            // aplanado de engine.js, pero ningún método de Stage 7 lo
            // proyectaba — un analista no podía ver, por assessment, si
            // cumplía la cobertura de escenarios/horizontes exigida por el
            // contrato (stage-06-risk.md Behavior §5).
            evaluation_coverage: a.evaluation_coverage ?? null,
          })),
          transition_risks: (transition_risks || []).map(r => ({
            type: r.type,
            description: r.description,
            severity: r.severity,
            timeframe: r.timeframe,
            signal_strength: r.signal_strength,
          })),
        },
      };
    }

    return { view: "executive", response: base };
  }

  // H-7.1/H-7.14 (documentacion-v2/stage-07, MEDIO): overall_risk.level sigue
  // siendo max-risk (enfoque conservador worst-case, ver rulesApplied y
  // thresholds.json overall_risk_consolidation para la justificación
  // completa y la comparación con alternativas). Lo que cambia es que
  // max-risk ya no es la ÚNICA señal expuesta: risk_composite (promedio
  // simple de risk_score_raw, ponderación igual/Laplace — mismo criterio que
  // H-6.16 en Stage 6) y risk_count (tally por nivel) dan el contexto de
  // concentración que un solo max no puede dar por construcción — un
  // comité puede ver "level=alto, risk_composite.level=bajo, risk_count:
  // {bajo:9, alto:1}" y entender de inmediato que es 1 fenómeno aislado, no
  // una condición generalizada.
  calculateOverallRisk(assessments) {
    const riskCount = { bajo: 0, medio: 0, alto: 0, catastrofico: 0 };
    if (!assessments || assessments.length === 0) {
      return {
        level: "bajo",
        compositeScore: 0,
        compositeLevel: "bajo",
        riskCount,
        driverPhenomenonId: null,
        evaluationCoverageSummary: this.summarizeEvaluationCoverage([]),
      };
    }
    const order = { bajo: 0, medio: 1, alto: 2, catastrofico: 3 };
    const max = assessments.reduce(
      (m, a) => (order[a.risk_level] > order[m.risk_level] ? a : m),
      assessments[0]
    );
    for (const a of assessments) {
      riskCount[a.risk_level] = (riskCount[a.risk_level] ?? 0) + 1;
    }
    const compositeScore =
      assessments.reduce((sum, a) => sum + (a.risk_score_raw ?? 0), 0) / assessments.length;
    return {
      level: max.risk_level,
      compositeScore,
      compositeLevel: this.classifyCompositeRisk(compositeScore),
      riskCount,
      // H-7.2: expuesto para que buildExecutiveSummary() nombre el MISMO
      // fenómeno que determina overall_risk.level, en vez de un fenómeno
      // arbitrario — ver rulesApplied H-7.2.
      driverPhenomenonId: max.phenomenon_id ?? null,
      // G1 (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, ALTA): Stage 06
      // calcula evaluation_coverage por assessment (cuántos escenarios/
      // horizontes se evaluaron realmente vs. los exigidos por el contrato
      // stage-06-risk.md, H-6.10) y lo declara honestamente con
      // meets_contract=false en la práctica actual (HALLAZGO-8: Open-Meteo
      // CMIP6 no expone dimensión SSP). Ese dato llegaba intacto a
      // input.assessments[].evaluation_coverage (el aplanado de engine.js no
      // lo descarta) pero ningún método de Stage 7 lo leía — se perdía entre
      // Stage 6 y la respuesta HTTP sin que ninguna vista lo mostrara.
      evaluationCoverageSummary: this.summarizeEvaluationCoverage(assessments),
    };
  }

  // G1 (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, ALTA): agrega
  // evaluation_coverage de todos los assessments en un resumen apto para la
  // vista executive (donde no se proyecta cada assessment individual). No
  // fabrica un nuevo umbral: solo cuenta cuántos assessments cumplen
  // meets_contract (ya calculado en Stage 06) y expone la razón del primero
  // que no cumple como muestra representativa — todos los assessments de una
  // misma ejecución comparten la misma causa estructural (HALLAZGO-8), así
  // que citar una sola justificación no pierde información real.
  summarizeEvaluationCoverage(assessments) {
    const withCoverage = (assessments || []).filter(a => a.evaluation_coverage != null);
    if (withCoverage.length === 0) {
      return {
        meets_contract: null,
        assessments_evaluated: 0,
        assessments_not_meeting_contract: 0,
        reason: "Sin assessments con evaluation_coverage disponible (Stage 06 no reportó cobertura de evaluación).",
      };
    }
    const notMeeting = withCoverage.filter(a => a.evaluation_coverage.meets_contract === false);
    return {
      meets_contract: notMeeting.length === 0,
      assessments_evaluated: withCoverage.length,
      assessments_not_meeting_contract: notMeeting.length,
      reason:
        notMeeting.length > 0
          ? notMeeting[0].evaluation_coverage.justification
          : "Todos los assessments cumplen la cobertura de escenarios/horizontes exigida por el contrato (stage-06-risk.md Behavior §5).",
    };
  }

  // H-7.1: reusa low_max/medium_max de thresholds.json risk_classification —
  // la MISMA partición que Stage06Risk.classifyRisk() usa para un score
  // individual (ISO 31000:2018 §6.6, ver thresholds.json risk_classification
  // _refs), no una segunda escala inventada para el composite. A propósito
  // NUNCA retorna 'catastrofico': esa categoría en Stage 6 es un
  // "consequence override" disparado por impact.value de UN fenómeno
  // específico (H-6.14), no una propiedad de un promedio de portafolio —
  // aplicarla aquí mezclaría dos semánticas distintas (severidad de un
  // evento vs. concentración de un portafolio).
  classifyCompositeRisk(score) {
    const rc = getThresholds()?.risk_classification ?? { low_max: 2, medium_max: 4 };
    if (score <= rc.low_max) return "bajo";
    if (score <= rc.medium_max) return "medio";
    return "alto";
  }

  // H-7.6 (documentacion-v2/stage-07, BAJO): el mapa hardcodeado aquí solo
  // cubría 7 de las 9 entradas de PhenomenonNameEnum (pipeline/shared/types.js)
  // — deslizamiento y huayco faltaban por completo — y ningún nombre citaba
  // una fuente. Movido a phenomenon-definitions.json display_names (fuente
  // única de verdad para metadatos de fenómeno, cubre las 9 entradas del
  // enum, cada una con su fuente — WMO/SENAMHI/INDECI/INGEMMET/NOAA según
  // corresponda). Ningún fenómeno actualmente activo (Stage 5 solo emite
  // los 6 de phenomenon-definitions.json `phenomena`) debería caer nunca al
  // fallback; el fallback existe solo para robustez si el enum se extiende
  // antes de que display_names se actualice — capitaliza cada palabra en
  // vez del fallback anterior (name.replace(/_/g," "), que producía
  // minúsculas inconsistentes con el resto del mapa, hallazgo punto #4).
  formatPhenomenonName(name) {
    const displayNames = getPhenomenonDefinitions()?.display_names;
    const entry = displayNames?.[name];
    if (entry?.es) return entry.es;
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  formatStatus(status) {
    const map = {
      active: "Activo",
      projected: "Proyectado",
      historical: "Histórico",
      not_detected: "No detectado",
    };
    return map[status] || status;
  }

  // H-7.7 (documentacion-v2/stage-07, BAJO): risk_score_raw se retornaba
  // como número sin escala — "3.5" no dice nada sin saber que el rango
  // posible es [0.2, 25] (fórmula (P×I)/CA, P,I,CA∈[1,5] Likert; ver
  // thresholds.json formula_source) o hasta 37.5 si catastrophic_multiplier
  // (H-6.14) se aplicó. score_scale expone ese rango y la fórmula junto al
  // número, en vez de dejar al consumidor adivinar la escala — mismo
  // principio que H-7.1 (risk_composite) y H-7.4 (confidence_to_probability)
  // ya aplican: nunca presentar un número crudo sin su derivación.
  //
  // El fallback score=0 para un fenómeno sin assessment era técnicamente
  // imposible bajo la fórmula real (el mínimo alcanzable es 0.2, con
  // P=1,I=1,CA=5) — fabricaba un valor que ningún cálculo real produce.
  // Corregido a score=null (alternativa explícita de la auditoría): null
  // significa honestamente "sin assessment para este fenómeno", mismo
  // criterio que CA=null en Stage 6 (H-6.2, null≠0 — semánticas distintas).
  // level se mantiene en "bajo" para este caso (no forma parte de este
  // hallazgo; cambiar esa semántica es una decisión aparte).
  //
  // score se redondea a 2 decimales — P/I/CA son enteros Likert 1-5, así
  // que risk_score_raw es siempre un cociente de enteros pequeños; más de 2
  // decimales implicaría una precisión que los insumos ordinales no
  // sustentan (mismo espíritu que rulesApplied regla 1: traducir a
  // categoría/precisión razonable antes de mostrar).
  getRiskContribution(phenomenon, assessments) {
    const thresholds = getThresholds();
    const rc = thresholds?.risk_classification ?? {};
    const catastrophicMultiplier = rc.catastrophic_multiplier ?? 1.5;
    const scoreScale = {
      min: 0.2,
      max: Math.round(25 * catastrophicMultiplier * 100) / 100,
      formula: "(Probabilidad × Impacto) / Capacidad Adaptativa, ×catastrophic_multiplier si catastrophic_assessment.flagged — ISO 31000:2018 §6.6 (ver thresholds.json formula_source, risk_classification, H-6.1, H-6.14)",
    };
    const assessment = (assessments || []).find(a => a.phenomenon_id === phenomenon.phenomenon_id);
    if (!assessment) return { level: "bajo", score: null, score_scale: scoreScale };
    return {
      level: assessment.risk_level,
      score: Math.round(assessment.risk_score_raw * 100) / 100,
      score_scale: scoreScale,
    };
  }

  // H-7.2 (documentacion-v2/stage-07, MEDIO): implementa literalmente el
  // template del contrato (stage-07-presentation.md, Narrative Template):
  // "{location} presenta exposición {level} a fenómeno {phenomenon_name}
  // {status}. {confidence_note}. {evidence_summary}. {recommendation_intro}"
  // — la versión anterior generaba una narrativa distinta que omitía
  // phenomenon_name, status, confidence_note, evidence_summary y
  // recommendation_intro, y no enlazaba trace_id (contrato Rules Applied
  // §2: "toda afirmación en la narrativa ejecutiva tiene un enlace interno
  // al artefacto de evidencia").
  //
  // El template es singular ("a fenómeno X"), pero Stage 7 recibe N
  // assessments — se nombra el fenómeno 'driver' (mismo assessment con
  // risk_level máximo que ya determina overall_risk.level, H-7.1) en vez de
  // uno arbitrario, para que el semáforo mostrado y el fenómeno nombrado en
  // la narrativa nunca diverjan.
  buildExecutiveSummary(location, risk, assessments, sector, transitionRisks, phenomena, recommendations, traceId) {
    const locName = location.location_name || `${location.lat}, ${location.lon}`;
    // H-7.2: sector sin validar producía "para el sector undefined" cuando
    // el input no lo incluía — alternativa de la auditoría adoptada tal
    // cual.
    const sectorLabel = typeof sector === "string" && sector.trim() ? sector.trim() : "no especificado";
    const levelLabel = RISK_LABELS[risk.level] || risk.level;

    const driverPhenomenon = (phenomena || []).find(p => p.phenomenon_id === risk.driverPhenomenonId);
    const phenomenonName = driverPhenomenon ? this.formatPhenomenonName(driverPhenomenon.name) : "ninguno identificado";
    const status = driverPhenomenon ? this.formatStatus(driverPhenomenon.status) : "sin datos";

    const confidenceNote = this.buildConfidenceNote(assessments, phenomena);

    // evidence_summary: cuenta verificable (fenómenos con riesgo relevante /
    // total evaluados, riesgos de transición) + enlace explícito a
    // trace_id + phenomenon_id del driver, cumpliendo el requisito de
    // trazabilidad del contrato en vez de una referencia genérica.
    const relevantCount = (assessments || []).filter(a => a.risk_level !== "bajo").length;
    const totalCount = (assessments || []).length;
    const trCount = (transitionRisks || []).length;
    const transitionClause = trCount > 0 ? ` y ${trCount} riesgo(s) de transición` : "";
    const evidenceSummary =
      `${relevantCount} de ${totalCount} fenómeno(s) evaluado(s) presentan riesgo relevante${transitionClause}` +
      ` (evidencia completa en trace_id=${traceId || "N/D"}` +
      (risk.driverPhenomenonId ? `, phenomenon_id=${risk.driverPhenomenonId})` : ")");

    // recommendation_intro reusa el array recommendations YA calculado por
    // buildRecommendations() (ver execute()) en vez de fabricar una segunda
    // narrativa de recomendación independiente que podría divergir del
    // texto realmente mostrado en response.recommendations.
    const recommendationIntro =
      recommendations && recommendations.length > 0
        ? `Se recomienda: "${recommendations[0]}"${recommendations.length > 1 ? ` (${recommendations.length - 1} recomendación(es) adicional(es) a continuación)` : ""}`
        : "Sin recomendaciones adicionales en este momento";

    // H-7.2: el template del contrato no tiene un slot {sector}, pero el
    // hallazgo #3 exige validar sector ANTES de interpolarlo (evitando
    // "para el sector undefined") — se conserva la cláusula de sector como
    // extensión deliberada del template (contexto de negocio relevante para
    // el lector, ya presente en el diseño original), ahora validada en vez
    // de eliminada.
    return (
      `${locName} presenta exposición ${levelLabel} a fenómeno ${phenomenonName} ${status} ` +
      `en el sector ${sectorLabel}. ${confidenceNote} ${evidenceSummary}. ${recommendationIntro}.`
    );
  }

  // H-7.3 (documentacion-v2/stage-07, MEDIO): reemplaza los 2 textos
  // estáticos hardcodeados por recomendaciones derivadas de
  // adaptation-measures.json (fuente: Anexo 10.2 Catálogo de Riesgos y
  // Medidas de Adaptación), personalizadas por fenómeno×sector y
  // tipo×sector, priorizadas por la magnitud real del riesgo
  // (risk_score_raw / signal_strength) en vez de solo la categoría
  // discreta, y capadas para que "priorizadas" (contrato Behavior §1) sea
  // literal. Distingue "sin datos" de "datos pero todo bajo" (hallazgo #2).
  buildRecommendations(assessments, transitionRisks, sector, phenomena) {
    if (assessments == null) {
      return ["Sin datos suficientes para generar recomendaciones — no se recibieron fenómenos evaluados."];
    }

    const catalog = getAdaptationMeasures();
    const recs = [];

    if (assessments.length === 0) {
      recs.push(
        "No se identificaron fenómenos climáticos evaluables para esta ubicación/sector — sin recomendaciones específicas aplicables."
      );
    } else {
      // H-7.3 punto #5: se ordena por risk_score_raw (continuo, fórmula
      // ISO 31000 P×I/CA de Stage 6) en vez de solo por risk_level
      // (ordinal) — un "medio" con score alto por alta probabilidad se
      // prioriza sobre un "alto" con score menor, información que la
      // categoría discreta por sí sola pierde.
      const relevant = assessments
        .filter(a => a.risk_level !== "bajo")
        .sort((a, b) => (b.risk_score_raw ?? 0) - (a.risk_score_raw ?? 0));

      if (relevant.length === 0) {
        recs.push(
          `Los ${assessments.length} fenómeno(s) evaluado(s) presentan riesgo bajo — mantener monitoreo regular de las condiciones climáticas.`
        );
      } else {
        const seen = new Set();
        for (const a of relevant) {
          if (recs.length >= MAX_PHYSICAL_RECOMMENDATIONS) break;
          const phenomenon = (phenomena || []).find(p => p.phenomenon_id === a.phenomenon_id);
          const hazardName = phenomenon?.name;
          const measure = this.lookupPhysicalMeasure(catalog, hazardName, sector);
          if (!measure) continue;
          const dedupeKey = `${hazardName}:${measure.measure}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          const hazardLabel = hazardName ? this.formatPhenomenonName(hazardName) : "fenómeno sin identificar";
          const genericTag = measure.measure_source === "sector_catalog" ? "" : " (medida genérica — sin catálogo sectorial específico)";
          recs.push(
            `[${RISK_LABELS[a.risk_level] || a.risk_level}] ${hazardLabel}: ${measure.measure} — ${measure.description}${genericTag} (fuente: ${measure.source}).`
          );
        }
      }
    }

    const relevantTransition = (transitionRisks || [])
      .filter(r => r.severity === "alta" || r.severity === "catastrofica")
      .sort((a, b) => (b.signal_strength ?? 0) - (a.signal_strength ?? 0));
    let transitionRecsAdded = 0;
    for (const r of relevantTransition) {
      if (transitionRecsAdded >= MAX_TRANSITION_RECOMMENDATIONS) break;
      const measure = this.lookupTransitionMeasure(catalog, r.type, sector);
      if (!measure) continue;
      const typeLabel = (TRANSITION_TYPE_LABELS[r.type] || r.type).toLowerCase();
      const genericTag = measure.measure_source === "sector_catalog" ? "" : " (medida genérica — sin catálogo sectorial específico)";
      recs.push(`Riesgo de transición (${typeLabel}): ${measure.text}${genericTag} (fuente: ${measure.source}).`);
      transitionRecsAdded += 1;
    }

    return recs;
  }

  // H-7.3: sector_catalog (fila específica de Anexo 10.2 para este
  // fenómeno×sector) tiene prioridad sobre generic_measures etiquetada para
  // este hazard, que a su vez tiene prioridad sobre el catch-all "any"
  // (BCP) — nunca retorna null si adaptation-measures.json tiene al menos
  // una entrada "any" en generic_measures.
  lookupPhysicalMeasure(catalog, hazardName, sector) {
    const sectorSpecific = catalog.measures_by_hazard_sector?.[hazardName]?.sector_specific?.[sector];
    if (sectorSpecific && sectorSpecific.length > 0) {
      return { ...sectorSpecific[0], measure_source: "sector_catalog" };
    }
    const hazardTagged = (catalog.generic_measures || []).find(
      m => Array.isArray(m.applicable_hazards) && m.applicable_hazards.includes(hazardName)
    );
    if (hazardTagged) return { ...hazardTagged, measure_source: "generic_hazard_tagged" };
    const anyGeneric = (catalog.generic_measures || []).find(m => m.applicable_hazards === "any");
    return anyGeneric ? { ...anyGeneric, measure_source: "generic_any" } : null;
  }

  // H-7.3: mismo orden de prioridad que lookupPhysicalMeasure —
  // sector_catalog (Anexo 10.2 Cat. Riesgos, columna de recomendación, para
  // este tipo×sector) antes que el fallback genérico. El fallback genérico
  // NO intenta un segundo nivel de matching por tipo (regulatory vs.
  // market vs. ...) entre las 3 entradas de generic_transition_measures —
  // documentado como catch-all único (la primera entrada) en vez de una
  // tabla tipo→índice sin base real para justificar cada asignación.
  lookupTransitionMeasure(catalog, type, sector) {
    const sectorSpecific = catalog.transition_measures_by_type_sector?.[type]?.sector_specific?.[sector];
    if (sectorSpecific) return { ...sectorSpecific, measure_source: "sector_catalog" };
    const generic = (catalog.generic_transition_measures || [])[0];
    return generic ? { ...generic, measure_source: "generic_any" } : null;
  }

  // H-7.4 (documentacion-v2/stage-07, MEDIO): la versión anterior promediaba
  // assessment.probability.value/5 — la PROBABILIDAD del fenómeno (que
  // además, cuando source="external"/H-6.9, viene de GRI Oxford y no tiene
  // relación alguna con la calidad de la evaluación) — bajo un nombre
  // (avgSQ) que sugería 'source quality' sin serlo ni conceptual ni
  // aritméticamente. Corregido para leer phenomenon.confidence.combined
  // (Stage 05: geometric mean de source_quality × signal_strength — la
  // medida de confianza epistémica REAL ya calculada aguas arriba, H-5.13),
  // cruzando assessment.phenomenon_id contra el array `phenomena` recibido
  // (mismo patrón de cross-reference que H-7.2 ya usa para driverPhenomenon).
  //
  // Cada confidence.combined (0-1) se mapea a un ordinal 1-5 con la MISMA
  // tabla confidence_to_probability.mapping que Stage 6 ya usa para
  // convertir esta exacta variable (H-5.13, H-6.7) — no un umbral 0.7/0.4
  // inventado para una escala distinta (el hallazgo señalaba que esos
  // números eran una reutilización sin relación de otro umbral). Los
  // ordinales resultantes se promedian entre fenómenos (igual peso —
  // Laplace, mismo criterio que risk_composite en H-7.1) y el promedio se
  // clasifica en 3 categorías igual que risk_classification.low_max_medium_max
  // ya hace con la escala 1-5 de IPCC AR6 WGII Fig.SPM.1 (5 niveles
  // colapsados a 3): [1,3)→baja, [3,4)→media, [4,5]→alta.
  buildConfidenceNote(assessments, phenomena) {
    if (!assessments || assessments.length === 0) return "Sin datos suficientes para evaluar confianza.";

    const thresholds = getThresholds();
    const mapping = thresholds.confidence_to_probability?.mapping ?? DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING;

    const ordinals = [];
    for (const a of assessments) {
      const phenomenon = (phenomena || []).find(p => p.phenomenon_id === a.phenomenon_id);
      const combined = phenomenon?.confidence?.combined;
      // H-5.6 (Stage 05, mismo criterio): confidence.combined ausente/no-finito
      // se EXCLUYE del promedio, no se trata como 0 — 0 significaría
      // "confianza mínima confirmada", que es una afirmación distinta de
      // "dato no disponible para este fenómeno".
      if (Number.isFinite(combined)) {
        let ordinal = 1;
        for (const [threshold, value] of mapping) {
          if (combined >= threshold) ordinal = value;
        }
        ordinals.push(ordinal);
      }
    }

    if (ordinals.length === 0) {
      return "Confianza no evaluable — no se encontró confidence.combined para los fenómenos evaluados.";
    }

    const avgOrdinal = ordinals.reduce((sum, v) => sum + v, 0) / ordinals.length;
    if (avgOrdinal >= 4) return "Confianza alta en los resultados presentados.";
    if (avgOrdinal >= 3) return "Confianza media — verificar fuentes para mayor precisión.";
    return "Confianza baja — los resultados son indicativos y requieren validación adicional.";
  }

  // H-7.10 (documentacion-v2/stage-07, BAJO): mapper compartido por
  // getSourcesUsed() y getSourcesOutOfCoverage() — antes cada uno construía
  // su propio objeto {name, domain, status} por separado, y ninguno incluía
  // authority_level/spatial_distance_km/resolution_native/duration_ms pese
  // a que RawSourceResponseSchema (pipeline/shared/types.js, el shape real
  // de cada entrada de sources_consulted) ya los trae. NO se agregan
  // coverage_percentage/last_updated/reliability_score (sugeridos en la
  // auditoría como alternativa): ningún stage de este pipeline calcula esos
  // 3 valores — Stage 1 (adapters/registry.js) y Stage 2 (validation) nunca
  // producen un porcentaje de cobertura, una fecha de última actualización
  // de la fuente, ni un score de confiabilidad agregado. Fabricarlos habría
  // sido la misma clase de precisión inexistente que H-6.4/H-6.9/H-7.3 ya
  // rechazaron — se exponen en cambio los 4 campos reales que sí describen
  // la calidad/idoneidad de una fuente para esta consulta específica:
  // authority_level (primary vs. complementary, registry.js), duration_ms
  // (latencia real de la respuesta), spatial_distance_km y resolution_native
  // (representatividad espacial, ya usados por getSourcesOutOfCoverage antes
  // de H-7.10 solo dentro de `reason`, nunca como campos propios).
  mapSourceSummary(s) {
    return {
      name: s.source_name,
      domain: s.source_domain,
      status: s.coverage_status,
      authority_level: s.authority_level ?? null,
      spatial_distance_km: s.spatial_distance_km ?? null,
      resolution_native: s.resolution_native ?? null,
      duration_ms: s.duration_ms ?? null,
    };
  }

  // H-7.10 (documentacion-v2/stage-07, BAJO): el criterio binario
  // available/no-available para separar sources_used de
  // sources_out_of_coverage (H-7.8) refleja el PISO operativo de calidad ya
  // citado en este mismo pipeline para decisiones de inclusión de fuente —
  // ISO/IEC 25012:2008 (Data Quality) §6.1, la MISMA norma que
  // thresholds.json signal_activation._refs.min_source_quality ya cita para
  // el piso de min_source_quality (0.30): por debajo del piso, la fuente se
  // descarta como no confiable para el análisis, no se presenta como
  // 'usada' con una advertencia — un source_quality parcial YA está
  // penalizado matemáticamente aguas arriba (Stage 04 confidence.js), no
  // necesita una tercera categoría de presentación aquí.
  //
  // NO existe una categoría 'partial' que se esté ocultando: CoverageStatusEnum
  // (pipeline/shared/types.js) declara 5 valores (available/partial/
  // out_of_coverage/unknown/failed), pero los ADAPTERS de Stage 1
  // (registry.js, cada adapters/*.js) solo emiten 3 —
  // available/out_of_coverage/failed (comentario explícito en
  // CoverageStatusEnum: "partial"/"unknown" son valores exclusivos de
  // Stage02/Stage03, calculados sobre validated_sources, un array DISTINTO
  // que Stage 7 no consume). sources_used (available) y
  // sources_out_of_coverage (H-7.8: todo lo demás — out_of_coverage +
  // failed) son, por tanto, una partición COMPLETA y EXHAUSTIVA del espacio
  // real de valores en sources_consulted — no una colisión binaria de un
  // gradiente más rico que se esté perdiendo.
  getSourcesUsed(input) {
    const sources = input.sources_consulted || [];
    return sources.filter(s => s.coverage_status === "available").map(s => this.mapSourceSummary(s));
  }

  // H-7.8 (documentacion-v2/stage-07, MEDIO): complemento exacto de
  // getSourcesUsed() sobre la MISMA input.sources_consulted (Stage 1) —
  // un source con coverage_status!=="available" ("out_of_coverage" o
  // "failed", pipeline/stages/01-acquisition/index.js/registry.js) es
  // "fuera de cobertura" en el sentido que el contrato pide. reason cita
  // source.error cuando existe (siempre presente para "failed" —
  // registry.js:55, mensaje de la promesa rechazada); para
  // "out_of_coverage" no hay un campo de error dedicado en los adapters
  // (supabase.js/gri-oxford.js simplemente no encuentran datos), así que se
  // construye una razón legible a partir de spatial_distance_km cuando está
  // presente, o un texto genérico honesto cuando no hay más detalle que dar
  // — nunca se inventa una razón más específica que la que el dato soporta.
  getSourcesOutOfCoverage(input) {
    const sources = input.sources_consulted || [];
    return sources
      .filter(s => s.coverage_status !== "available")
      .map(s => ({
        ...this.mapSourceSummary(s),
        reason:
          s.error ??
          (s.spatial_distance_km != null
            ? `Distancia espacial (${s.spatial_distance_km}km) excede el máximo de representatividad de esta fuente/variable.`
            : "Sin datos disponibles para esta ubicación en esta fuente (sin más detalle reportado por el adaptador)."),
      }));
  }

  // H-7.8: input.signals (Stage 4, pipeline/stages/04-signals/index.js) trae
  // exactamente source_quality.score y signal_strength.score por señal —
  // los 2 campos que el contrato (Behavior §2: "Señales con source_quality y
  // signal_strength") pide y que Stage 7 nunca leyó. Solo incluye señales
  // que Stage 4 conservó (pasaron min_signal_strength) — las descartadas
  // viven en Stage 4 signals_discarded[], que NO sobrevive hasta Stage 7
  // (Stage05Phenomena.execute() no lo reenvía en su output, y el
  // orchestrator solo aplana lo que cada stage devuelve) y por tanto no se
  // puede incluir aquí sin fabricar datos que este stage no tiene — vacío
  // declarado, no oculto. contributing_to cruza phenomenon.contributing_signals
  // (Stage 5) para mostrar a qué fenómeno(s) alimentó cada señal — dato
  // derivado, no fabricado, de lo que Stage 5 ya calculó.
  getSignalDetail(input, phenomena) {
    const signals = input.signals || [];
    return signals.map(s => ({
      signal_id: s.signal_id,
      name: s.name,
      type: s.type,
      source_quality: s.source_quality?.score ?? null,
      signal_strength: s.signal_strength?.score ?? null,
      contributing_to: (phenomena || [])
        .filter(p => (p.contributing_signals || []).includes(s.signal_id))
        .map(p => p.name),
    }));
  }
}
