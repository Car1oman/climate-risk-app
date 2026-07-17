/**
 * Agrega source_quality (o signal_strength) de múltiples señales contribuyentes
 * a un fenómeno en un solo valor representativo.
 *
 * H-5.4 (documentacion-v2/stage-05, MEDIO): la media aritmética simple no
 * distingue entre señales requeridas y opcionales, ni penaliza desequilibrios
 * entre señales. Este módulo hace la agregación configurable.
 *
 * H-5.6 (documentacion-v2/stage-05, MEDIO): source_quality.score puede ser
 * null cuando todos los componentes de SQ fueron excluidos (H-01: sin
 * componentes calculables). Null se excluye del promedio (no se trata como 0),
 * siguiendo el mismo patrón que confidence.js:312-316 para componentes
 * excluidos del weighted average de SQ. Razón: null significa "calidad
 * desconocida", no "calidad = 0" — son semánticas distintas. Si todas las
 * señales tienen SQ=null, el conjunto queda vacío y avg=0, lo que activa la
 * exclusión por minConfidence.
 *
 * H-5.19 (documentacion-v2/stage-05, MEDIO): promedio simple de señales ignora
 * la distinción epistemológica entre anomaly (observación actual, dato empírico)
 * y projected (proyección modelo, dato simulado). "type_weighted" pondera por
 * tipo de señal: anomaly > categorical > projected, reflejando que la evidencia
 * observada tiene mayor certeza que la evidencia modelada. Para un sistema de
 * evaluación de riesgo climático, la distinción es relevante: "sabemos que está
 * pasando" (anomaly) vs "los modelos predicen que pasará" (projected). Los pesos
 * por defecto (1.0/0.8/0.5) son Laplace, sin calibración AHP — documentados
 * en thresholds.json signal_activation.type_weights.
 *
 * Métodos soportados (thresholds.json signal_activation.signal_aggregation):
 *
 * - "arithmetic_mean": media aritmética simple — cada señal pesa igual.
 *   Justificación: todas las señales son evidencia independiente del mismo
 *   fenómeno; sin razón documentada para ponderar unas más que otras.
 *
 * - "geometric_mean": media geométrica — penaliza desequilibrios entre
 *   señales. Si una señal tiene SQ=0.1 y otra SQ=0.9, la media geométrica
 *   (0.30) refleja mejor la debilidad de la peor que la aritmética (0.50).
 *   OECD/JRC §6.3: "geometric mean is recommended when dimensions are not
 *   perfectly substitutable."
 *
 * - "required_first": required_signals pesan 1.0, optional_signals pesan
 *   0.5. Alineado con el contrato stage-05-phenomena.md que distingue
 *   "señales que deben estar presentes" de "señales que refuerzan".
 *   Las señales requeridas son evidencia primaria; las opcionales son
 *   corroboración secundaria que no debería dominar el promedio.
 *
 * - "type_weighted": pondera por tipo de señal (H-5.19). anomaly/categorical
 *   (evidencia observada) pesa más que projected (evidencia modelada). Refleja
 *   la distinción epistemológica entre "sabemos que está pasando" y "los
 *   modelos predicen que pasará". Pesos configurables en type_weights.
 *
 * @param {Array<{source_quality: {score: number|null}, signal_strength: {score: number}}>} signals
 *   Señales contribuyentes al fenómeno.
 * @param {{ required: string[], optional: string[] }} signalRoles
 *   Nombres de señales requeridas y opcionales según la definición del fenómeno.
 * @param {string} method - "arithmetic_mean" | "geometric_mean" | "required_first" | "type_weighted"
 * @param {"source_quality" | "signal_strength"} dimension - qué componente promediar
 * @param {{ required_weight?: number, optional_weight?: number, type_weights?: Record<string, number> }} [weights] - pesos para "required_first" o "type_weighted"
 * @returns {{ avg: number, n: number, method: string }} valor promedio, cantidad de señales con valor conocido, método usado
 */
export function aggregateSignals(signals, signalRoles, method, dimension, weights) {
  if (signals.length === 0) {
    return { avg: 0, n: 0, method };
  }

  // H-5.6: extract raw score. For source_quality, null means "quality unknown"
  // (not "quality = 0") — null values are excluded from the average, consistent
  // with confidence.js:312-316 which excludes null components from the weighted
  // average. For signal_strength, score is always present (Stage 04 guarantees it).
  const getScore = (s) => {
    if (dimension === "source_quality") {
      return s.source_quality.score ?? null;
    }
    return s.signal_strength.score;
  };

  const rawScores = signals.map(getScore);

  // H-5.6: filter out null scores before averaging. The returned `n` reflects
  // only signals with known values, not total matching signals — this makes
  // the count semantically meaningful for downstream consumers.
  const validScores = rawScores.filter(s => s !== null);
  const n = validScores.length;

  if (n === 0) {
    return { avg: 0, n: 0, method };
  }

  switch (method) {
    case "geometric_mean": {
      // Geometric mean of scores — penalizes imbalance between signals.
      // If any score is 0, the product is 0 (conservative: a completely
      // uninformative signal brings the whole average down).
      const product = validScores.reduce((acc, s) => acc * s, 1);
      return { avg: Math.pow(product, 1 / n), n, method };
    }

    case "required_first": {
      const wRequired = weights?.required_weight ?? 1.0;
      const wOptional = weights?.optional_weight ?? 0.5;
      let totalWeight = 0;
      let weightedSum = 0;
      for (let i = 0; i < signals.length; i++) {
        if (rawScores[i] === null) continue; // H-5.6: skip null, don't weight at 0
        const isRequired = signalRoles.required.includes(signals[i].name);
        const w = isRequired ? wRequired : wOptional;
        weightedSum += w * rawScores[i];
        totalWeight += w;
      }
      return { avg: totalWeight > 0 ? weightedSum / totalWeight : 0, n, method };
    }

    case "type_weighted": {
      // H-5.19: weight by signal type. anomaly/categorical (observed evidence)
      // weights more than projected (modeled evidence). Default weights:
      // anomaly=1.0, categorical=0.8, projected=0.5. These are Laplace defaults
      // without AHP calibration — documented in thresholds.json type_weights.
      const typeWeights = weights?.type_weights ?? { anomaly: 1.0, categorical: 0.8, projected: 0.5 };
      let totalWeight = 0;
      let weightedSum = 0;
      for (let i = 0; i < signals.length; i++) {
        if (rawScores[i] === null) continue; // H-5.6: skip null
        const signalType = signalRoles.type_map?.[signals[i].name] ?? "projected";
        const w = typeWeights[signalType] ?? 0.5;
        weightedSum += w * rawScores[i];
        totalWeight += w;
      }
      return { avg: totalWeight > 0 ? weightedSum / totalWeight : 0, n, method };
    }

    case "arithmetic_mean":
    default: {
      const sum = validScores.reduce((a, b) => a + b, 0);
      return { avg: sum / n, n, method };
    }
  }
}
