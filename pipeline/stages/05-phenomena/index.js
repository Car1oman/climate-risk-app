import { v4 as uuid } from "uuid";
import { StageInterface } from "../../shared/stage-interface.js";
import { getPhenomenonDefinitions, getThresholds } from "../../orchestration/config-loader.js";
import { combineConfidence } from "./combine-confidence.js";
import { aggregateSignals } from "./aggregate-signals.js";
import { SIGNAL_METADATA, inferHorizon, inferStatus, inferScenario } from "./signal-metadata.js";

/**
 * H-5.12: Validate a single signal for the fields required by Stage 5.
 *
 * Required fields (accessed in execute() and aggregate-signals.js):
 * - name: string — used for matching against phenomenon definitions
 * - source_quality: { score: number | null } — aggregated for SQ average (null excluded per H-5.6)
 * - signal_strength: { score: number } — aggregated for SS average and activation threshold
 *
 * Optional but used when present:
 * - signal_id: UUID — emitted as contributing_signals
 * - value: any — used for categorical activation (matchValue comparison)
 * - anomaly_value: number | null — used for directional activation (sign comparison)
 *
 * @param {any} s - signal object to validate
 * @param {number} index - position in the signals array (for error messages)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSignal(s, index) {
  const errors = [];
  const label = `Señal[${index}]${s?.name ? `(${s.name})` : ""}`;

  if (typeof s !== "object" || s === null) {
    return { valid: false, errors: [`${label}: no es un objeto válido`] };
  }

  if (typeof s.name !== "string" || s.name.trim() === "") {
    errors.push(`${label}: campo 'name' ausente o vacío`);
  }

  if (s.source_quality == null || typeof s.source_quality !== "object") {
    errors.push(`${label}: campo 'source_quality' ausente o no es objeto`);
  } else if (typeof s.source_quality.score !== "number" && s.source_quality.score !== null) {
    errors.push(`${label}: source_quality.score no es número ni null (recibido: ${typeof s.source_quality.score})`);
  }

  if (s.signal_strength == null || typeof s.signal_strength !== "object") {
    errors.push(`${label}: campo 'signal_strength' ausente o no es objeto`);
  } else if (typeof s.signal_strength.score !== "number") {
    errors.push(`${label}: signal_strength.score no es número (recibido: ${typeof s.signal_strength.score})`);
  }

  return { valid: errors.length === 0, errors };
}

export class Stage05Phenomena extends StageInterface {
  constructor() {
    super(5, "Phenomena");
    this.rulesApplied = [
      "H-5.1 (documentacion-v2/stage-05, ALTO): fenómenos y sus señales contribuyentes vienen de pipeline/config/phenomenon-definitions.json (una entrada por fenómeno, con scientific_reference y notes por inclusión/exclusión) — no de un mapa hardcodeado sin justificación. Forma según contrato stage-05-phenomena.md (config.phenomenon_definitions).",
      "Un fenómeno se considera solo si al menos una señal de su required_signals está presente en la entrada (contrato stage-05-phenomena.md Rule 1); optional_signals reforzarían la confianza combinada sin activar el fenómeno por sí solas, pero ninguna definición activa usa optional_signals hoy (ver phenomenon-definitions.json _methodology.required_vs_optional)",
      "H-5.3 (documentacion-v2/stage-05, MEDIO): confianza combinada ahora respeta config.confidence_combination de thresholds.json en lugar de hardcodear geometric_mean. Soporta 'min', 'weighted' y 'geometric_mean' (contrato stage-05-phenomena.md:17). Pesos para 'weighted' se configuran en thresholds.json signal_activation.confidence_weights.",
      "H-5.4 (documentacion-v2/stage-05, MEDIO): agregación de source_quality y signal_strength sobre señales contribuyentes ahora es configurable via thresholds.json signal_activation.signal_aggregation. Soporta 'arithmetic_mean' (default, media simple), 'geometric_mean' (penaliza desequilibrios entre señales, OECD/JRC §6.3) y 'required_first' (required×1.0 + optional×0.5, alineado con contrato stage-05-phenomena.md). Pesos para 'required_first' en signal_activation.signal_aggregation_weights.",
      "H-5.5 (documentacion-v2/stage-05, MEDIO): geometric_mean como default de confidence_combination es una decisión explícita documentada en thresholds.json _refs.confidence_combination. SQ y SS son dimensiones no sustituibles (HDI/ND-GAIN precedent); la penalización por desbalance (√(sq×ss) ≤ min(sq,ss)) es la propiedad deseada, no un efecto secundario. Para SQ=0.8, SS=0.6: geometric_mean=0.693 (13% reducción), weighted(50/50)=0.70, min=0.60. Si se desea ausencia de penalización → weighted; si se desea el piso absoluto → min. Ver análisis completo en thresholds.json.",
      "H-5.6 (documentacion-v2/stage-05, MEDIO): source_quality.score=null se excluye del promedio de SQ (no se trata como 0), consistente con confidence.js:312-316 que excluye componentes null del weighted average. Null significa 'calidad desconocida', no 'calidad = 0' (H-14: 'nunca se fuerza a 0'). SQ=0.8 + SQ=null → promedio=0.8 (1 señal conocida), no 0.4 (2 señales). Todas null → avgSQ=0 → excluido por minConfidence. Documentado en thresholds.json _refs.null_source_quality.",
      "H-5.7 (documentacion-v2/stage-05, MEDIO): fenómenos numéricos usan min_phenomenon_activation (umbral separado de min_signal_strength) para activación. min_signal_strength filtra señales individuales en Stage 4; min_phenomenon_activation determina si el fenómeno tiene suficiente evidencia (decisiones conceptualmente distintas). Default = min_signal_strength (0.40) para compatibilidad hacia atrás. some() se mantiene porque el contrato (Rule 1) establece que una señal requerida es suficiente. Documentado en thresholds.json _refs.min_phenomenon_activation.",
      "Un fenómeno requiere confianza de fuente (source_quality) promedio >= min_confidence de su definición, o el piso global thresholds.json signal_activation.min_source_quality si la definición no fija uno propio",
      "Fenómenos categóricos (el_nino/la_nina) se activan por coincidencia exacta de valor (matchValue); fenómenos numéricos direccionales (ola_de_calor/ola_de_frio, sequia/inundacion) se activan por signal_strength.score >= min_phenomenon_activation Y signo de anomaly_value consistente con la dirección física declarada en 'sign' (H-5.1: sin este filtro, un exceso y un déficit de la misma variable activarían el mismo fenómeno; H-5.7: umbral separado de min_signal_strength, que filtra señales en Stage 4)",
      "H-5.8 (documentacion-v2/stage-05, BAJO): activación categórica usa comparación exacta (s.value === matchValue), sin normalización de caso. Si allowedValues está definido en la definición del fenómeno, se valida que s.value sea un valor permitido antes de comparar — valores no permitidos se ignoran (no activan). enso-classification.js produce exactamente 3 valores: 'el_nino', 'la_nina', 'neutral' (enum cerrado). La comparación exacta es intencional: normalizar caso (toLowerCase) enmascararía bugs upstream donde un valor inesperado llegaría al pipeline. Documentado en phenomenon-definitions.json allowedValues.",
      "H-5.9 (documentacion-v2/stage-05, MEDIO): status y horizon se infieren de las señales contribuyentes, no se hardcodean. Status: 'projected' solo cuando TODAS las señales son de tipo projected (futuro puro); 'active' cuando alguna señal es anomaly o categorical (observado/actual). Horizon: se extrae del sufijo del nombre de la señal (_corto/_mediano/_largo) via signal-metadata.js, que mapea signal_name → {type, horizon} derivado de signal-taxonomy.json. Prioridad: largo > mediano > corto. Categorical (ENSO) → horizon=null (estado discreto, sin banda temporal). Documentado en pipeline/stages/05-phenomena/signal-metadata.js.",
      "H-5.10 (documentacion-v2/stage-05, MEDIO): phenomena_not_detected se produce con {name, reason, evidence} para cada fenómeno que no se activa, cumpliendo el contrato stage-05-phenomena.md (regla 3). Cuatro puntos de captura: (1) sin señales en la entrada, (2) señales presentes pero ninguna requerida, (3) SQ promedio < minConfidence, (4) señales presentes pero sin activación (SS < umbral o valor categórico no coincide). Cada registro incluye evidencia cuantitativa (valores SQ/SS por señal, umbral, método de agregación) para que un auditor pueda determinar exactamente por qué no se detectó.",
      "H-5.11 (documentacion-v2/stage-05, MEDIO; revisado — auditoría de transformación de datos, hallazgo P2): scenario se infiere via inferScenario() leyendo signal.scenario directamente de cada señal contribuyente (propagado desde Stage 03/04, nunca inferido en Stage 05). Sigue siendo null para: (1) señales anomaly de observación actual (no aplica escenario), (2) señales projected de openmeteo_cmip6 (HALLAZGO-8: ensemble HighResMIP sin parámetro SSP), (3) señales categóricas ENSO (estado discreto). Ya NO es null para señales projected de supabase_climate_cells (cc_tasmax_corto/mediano, cc_pr_corto/mediano) — esa fuente sí publica bloques ensemble-all-sspXXX reales, extraídos por Stage 03 según el parámetro `scenario` de la consulta. Stage 6 sigue usando fallback 'not_scenario_specific' solo cuando ningún signal.scenario real llegó.",
      "H-5.12 (documentacion-v2/stage-05, BAJO): validación defensiva de entrada en execute(). validateSignal() verifica campos requeridos por Stage 5: name (string), source_quality.score (number|null), signal_strength.score (number). Señales que no pasan la validación se excluyen del procesamiento y se registran como phenomena_not_detected con razón 'Señal malformada' y errores específicos. Si signals no es array, se retorna { phenomena: [], phenomena_not_detected: [] } sin error. Riesgo BAJO porque Stage 4 siempre produce señales correctas (Zod schema en ClimateSignalSchema), pero la validación defensiva hace el stage autónomo y auditable — no depende de que la validación upstream funcione correctamente. Verificado: ningún otro stage valida entrada (Stage 4 y 6 tienen el mismo patrón de destructuring sin guard).",
      "H-5.16 (documentacion-v2/stage-05, MEDIO): cobertura de tests completada con 46 tests (stage-05-phenomena.test.js, 723 líneas) + 22 tests (aggregate-signals.test.js) + 20 tests (combine-confidence.test.js) + 17 tests (signal-metadata.test.js). Cada rama de decisión tiene al menos un test: activación categórica (exact match, case mismatch, allowedValues), activación numérica (direccional, umbral SS), gating SQ (below threshold), gating required signals (missing required), exclusión de fenómenos, propagación scenario/horizon, validación de entrada (malformed, empty, null), y phenomena_not_detected (4 razones de skip). Edge cases: SQ=null, empty signals array, mixed valid+malformed, unknown sector, not_detected status.",
      "H-5.17 (documentacion-v2/stage-05, BAJO): rulesApplied actualizado con todas las reglas implementadas. Lista completa: (1) fenómenos desde phenomenon-definitions.json, (2) al menos una señal requerida (Rule 1), (3) confidence_combination configurable, (4) signal_aggregation configurable, (5) geometric_mean penalization documentada, (6) null SQ exclusion, (7) min_phenomenon_activation separado de min_signal_strength, (8) SQ threshold por fenómeno, (9) activación categórica vs numérica vs direccional, (10) exact comparison con allowedValues, (11) status/horizon inference, (12) phenomena_not_detected con razones cuantitativas, (13) scenario inference, (14) validación defensiva de entrada, (15) cobertura de tests. Un auditor puede reconstruir todas las decisiones desde rulesApplied + thresholds.json + phenomenon-definitions.json.",
      "H-5.18 (documentacion-v2/stage-05, BAJO): PhenomenonNameEnum en types.js valida que name pertenece a un conjunto finito de 9 fenómenos (ola_de_calor, ola_de_frio, sequia, inundacion, el_nino, la_nina, vientos_fuertes, deslizamiento, huayco). Previene typos silenciosos en PHENOMENA_MAP. ClimatePhenomenonSchema.name usa PhenomenonNameEnum en lugar de z.string(). Fuente única de verdad: pipeline/config/phenomenon-definitions.json.",
      "H-5.19 (documentacion-v2/stage-05, MEDIO): agregación type_weighted pondera por tipo de señal — anomaly=1.0 (evidencia observada), categorical=0.8 (estado discreto), projected=0.5 (evidencia modelada). Refleja la distinción epistemológica: 'sabemos que está pasando' vs 'los modelos predicen que pasará'. Método disponible como opt-in via signal_aggregation='type_weighted' en thresholds.json; default sigue siendo arithmetic_mean para compatibilidad hacia atrás. Configuración en thresholds.json signal_activation.type_weights.",
      "H-5.20 (documentacion-v2/stage-05, BAJO): execute() es async para consistencia con StageInterface.execute() (async). JavaScript permite que una función sync satisfaga una interfaz async, pero es inconsistencia de diseño. Si en el futuro Stage 5 necesita I/O (leer archivos de configuración dinámica, fuentes externas), ya está preparado. Tests actualizados con async/await.",
    ];
  }

  async execute(input) {
    // H-5.12: validación defensiva de entrada. Si signals no es array,
    // retornar resultado vacío sin error — el stage es autónomo.
    const rawSignals = input?.signals;
    if (!Array.isArray(rawSignals)) {
      return { phenomena: [], phenomena_not_detected: [] };
    }

    // H-5.12: filtrar señales malformadas, registrar en phenomena_not_detected.
    const validationErrors = [];
    const signals = [];
    for (let i = 0; i < rawSignals.length; i++) {
      const { valid, errors } = validateSignal(rawSignals[i], i);
      if (valid) {
        signals.push(rawSignals[i]);
      } else {
        validationErrors.push(...errors);
      }
    }
    const { phenomena: definitions } = getPhenomenonDefinitions();
    const thresholds = getThresholds();
    const globalMinSourceQuality = thresholds.signal_activation.min_source_quality;
    const minSignalStrength = thresholds.signal_activation.min_signal_strength;
    const minPhenomenonActivation = thresholds.signal_activation.min_phenomenon_activation ?? minSignalStrength;
    const confidenceMethod = thresholds.signal_activation.confidence_combination ?? "geometric_mean";
    const confidenceWeights = thresholds.signal_activation.confidence_weights;
    const aggregationMethod = thresholds.signal_activation.signal_aggregation ?? "arithmetic_mean";
    const aggregationWeights = thresholds.signal_activation.signal_aggregation_weights;
    const typeWeights = thresholds.signal_activation.type_weights;
    const phenomena = [];
    const phenomenaNotDetected = [];

    for (const entry of definitions) {
      const candidateNames = [...entry.required_signals, ...entry.optional_signals];
      const matchingSignals = signals.filter(s => candidateNames.includes(s.name));

      // H-5.10: cada fenómeno que no se agrega a phenomena[] se registra en
      // phenomena_not_detected con razón específica y evidencia, para que un
      // auditor pueda determinar por qué no se detectó.
      if (matchingSignals.length === 0) {
        phenomenaNotDetected.push({
          name: entry.name,
          reason: "Sin señales requeridas disponibles en la entrada",
          evidence: `Señales requeridas esperadas: [${entry.required_signals.join(", ")}]. Señales opcionales: [${entry.optional_signals.join(", ")}]. Señales recibidas en total: ${signals.length}.`,
        });
        continue;
      }

      // Contrato stage-05-phenomena.md Rule 1: al menos una señal REQUERIDA
      // (no solo opcional) debe estar presente para considerar el fenómeno.
      const hasRequiredSignal = matchingSignals.some(s => entry.required_signals.includes(s.name));
      if (!hasRequiredSignal) {
        const matchingNames = matchingSignals.map(s => s.name);
        phenomenaNotDetected.push({
          name: entry.name,
          reason: "Ninguna señal requerida presente en la entrada",
          evidence: `Señales que coinciden con el patrón: [${matchingNames.join(", ")}]. Señales requeridas: [${entry.required_signals.join(", ")}]. Ninguna de las requeridas está presente.`,
        });
        continue;
      }

      // H-5.4: agregación configurable de source_quality y signal_strength
      // sobre las señales contribuyentes, en lugar de media aritmética simple.
      // H-5.19: signalRoles incluye type_map para agregación type_weighted.
      const signalRoles = {
        required: entry.required_signals,
        optional: entry.optional_signals,
        type_map: Object.fromEntries(
          matchingSignals.map(s => [s.name, SIGNAL_METADATA[s.name]?.type ?? "projected"])
        ),
      };
      const aggWeights = { ...aggregationWeights, type_weights: typeWeights };
      const sqAgg = aggregateSignals(matchingSignals, signalRoles, aggregationMethod, "source_quality", aggWeights);
      const ssAgg = aggregateSignals(matchingSignals, signalRoles, aggregationMethod, "signal_strength", aggWeights);
      const avgSQ = sqAgg.avg;
      const avgSS = ssAgg.avg;

      const minConfidence = entry.min_confidence ?? globalMinSourceQuality;
      if (avgSQ < minConfidence) {
        const sqDetails = matchingSignals.map(s => {
          const sq = s.source_quality.score;
          return `${s.name}: SQ=${sq === null ? "null (componentes excluidos)" : sq}`;
        }).join("; ");
        phenomenaNotDetected.push({
          name: entry.name,
          reason: `Calidad de fuente insuficiente (SQ promedio = ${avgSQ.toFixed(4)}, umbral = ${minConfidence})`,
          evidence: `SQ por señal: ${sqDetails}. Método de agregación: ${aggregationMethod}.`,
        });
        continue;
      }

      const combined = combineConfidence(avgSQ, avgSS, confidenceMethod, confidenceWeights);

      // H-5.1: activación categórica (matchValue) vs. numérica direccional
      // (sign) vs. numérica sin dirección declarada (fallback, hoy sin uso —
      // toda definición activa en phenomenon-definitions.json fija matchValue
      // o sign explícitamente).
      // H-5.7: fenómenos numéricos usan minPhenomenonActivation (umbral separado
      // de minSignalStrength). minSignalStrength filtra señales individuales en
      // Stage 4; minPhenomenonActivation determina si el fenómeno tiene suficiente
      // evidencia para activarse (decisiones conceptualmente distintas).
      // H-5.8: activación categórica usa comparación exacta (s.value === matchValue).
      // Si allowedValues está definido, se valida que s.value sea un valor permitido
      // antes de comparar — valores no permitidos se ignoran (no activan el fenómeno),
      // documentando explícitamente qué valores son legítimos para la señal.
      let active;
      let activationEvidence;
      if (entry.matchValue != null) {
        active = matchingSignals.some(s => {
          if (entry.allowedValues && !entry.allowedValues.includes(s.value)) {
            return false;
          }
          return s.value === entry.matchValue;
        });
        const signalValues = matchingSignals.map(s => `${s.name}="${s.value}"`).join(", ");
        activationEvidence = `Comparación categórica: matchValue="${entry.matchValue}". Valores de señales: [${signalValues}]. ${entry.allowedValues ? `Valores permitidos: [${entry.allowedValues.join(", ")}].` : ""}`;
      } else if (entry.sign != null) {
        active = matchingSignals.some(s =>
          s.signal_strength.score >= minPhenomenonActivation &&
          s.anomaly_value != null &&
          (entry.sign === "positive" ? s.anomaly_value > 0 : s.anomaly_value < 0)
        );
        const signalDetails = matchingSignals.map(s =>
          `${s.name}: SS=${s.signal_strength.score}, anomaly=${s.anomaly_value}`
        ).join("; ");
        activationEvidence = `Activación direccional: sign="${entry.sign}", umbral SS=${minPhenomenonActivation}. Detalle por señal: ${signalDetails}.`;
      } else {
        active = matchingSignals.some(s => s.signal_strength.score >= minPhenomenonActivation);
        const signalDetails = matchingSignals.map(s =>
          `${s.name}: SS=${s.signal_strength.score}`
        ).join("; ");
        activationEvidence = `Activación numérica: umbral SS=${minPhenomenonActivation}. Detalle por señal: ${signalDetails}.`;
      }

      if (!active) {
        phenomenaNotDetected.push({
          name: entry.name,
          reason: "Señales presentes pero sin evidencia de activación",
          evidence: activationEvidence,
        });
      }

      phenomena.push({
        phenomenon_id: uuid(),
        name: entry.name,
        status: active ? inferStatus(matchingSignals.map(s => s.name)) : "not_detected",
        confidence: {
          source_quality: avgSQ,
          signal_strength: avgSS,
          combined,
        },
        contributing_signals: matchingSignals.map(s => s.signal_id),
        // Auditoría de transformación de datos, hallazgo P2: inferScenario()
        // ahora lee signal.scenario directamente de cada señal (propagado
        // desde Stage 03/04) en vez de una tabla estática por nombre — ver
        // signal-metadata.js para el razonamiento completo.
        scenario: inferScenario(matchingSignals),
        horizon: active ? inferHorizon(matchingSignals.map(s => s.name)) : null,
      });
    }

    // H-5.12: registrar errores de validación como phenomena_not_detected
    // individuales (una entrada por señal malformada) para trazabilidad completa.
    for (const err of validationErrors) {
      phenomenaNotDetected.push({
        name: "señal_malformada",
        reason: "Señal malformada excluida del procesamiento",
        evidence: err,
      });
    }

    return { phenomena, phenomena_not_detected: phenomenaNotDetected };
  }
}
