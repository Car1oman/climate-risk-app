/**
 * Layer 3 — Business Risk Engine
 * Mapea señales climáticas a impactos operacionales por sector,
 * calcula exposure_level, sensitivity_level y financial_impact_range.
 */

// ─── Tabla de impactos operacionales por señal × sector ─────────────────────
// Basada en catálogo documental de análisis de riesgo climático para Intercorp Retail
const OPERATIONAL_IMPACTS = {
  extreme_heat: {
    retail:         ['↑ consumo energético refrigeración', 'Riesgo productos perecederos', 'Confort cliente reducido', 'Presión sobre HVAC'],
    educacion:      ['Confort aulas comprometido', 'Cancelación de clases', 'Riesgo salud estudiantes'],
    salud:          ['Presión cadena frío medicamentos', 'Riesgo para pacientes vulnerables', '↑ demanda servicios de urgencia'],
    entretenimiento:['Reducción afluencia en espacios abiertos', '↑ costos climatización', 'Cancelación de eventos'],
    otros:          ['↑ costos operativos energéticos', 'Riesgo confort y productividad laboral'],
  },
  severe_heat: {
    retail:         ['Riesgo crítico cadena frío', 'Posible cierre temporal por normativa', '↑ costos energéticos extremos'],
    educacion:      ['Suspensión de clases obligatoria', 'Riesgo salud crítico para menores'],
    salud:          ['Colapso potencial cadena frío crítica', 'Incremento mortalidad pacientes de riesgo'],
    entretenimiento:['Cierre de instalaciones al aire libre', 'Cancelación masiva de eventos'],
    otros:          ['Riesgo laboral crítico', 'Posible paralización operativa'],
  },
  drought: {
    retail:         ['Presión hídrica en operaciones', 'Riesgo cadena suministro agrícola', '↑ costos insumos alimentarios'],
    educacion:      ['Restricción uso de agua en instalaciones', 'Impacto en servicios sanitarios'],
    salud:          ['Riesgo esterilización y limpieza clínica', 'Presión sobre suministro de agua potable'],
    entretenimiento:['Restricción uso de agua en instalaciones recreativas', 'Impacto en áreas verdes'],
    otros:          ['Restricción hídrica operativa', 'Riesgo en procesos que requieren agua'],
  },
  extreme_rain: {
    retail:         ['Inundación de almacenes y tiendas', 'Interrupción logística', 'Daño a inventario'],
    educacion:      ['Daño a infraestructura educativa', 'Suspensión de clases', 'Riesgo acceso a instalaciones'],
    salud:          ['Interrupción acceso a centros de salud', 'Daño a equipos médicos', 'Riesgo contaminación'],
    entretenimiento:['Cancelación de eventos', 'Daño a instalaciones', 'Riesgo para visitantes'],
    otros:          ['Interrupción operativa por lluvia extrema', 'Daño a infraestructura'],
  },
  temp_increase: {
    retail:         ['↑ costos energéticos sostenidos', 'Cambio en patrones de consumo', 'Presión sobre cadena frío'],
    educacion:      ['Necesidad de climatización permanente', '↑ costos operativos'],
    salud:          ['↑ demanda servicios por enfermedades relacionadas al calor', 'Presión sobre cadena frío'],
    entretenimiento:['Cambio en temporadas de demanda', '↑ costos climatización'],
    otros:          ['↑ costos energéticos estructurales', 'Adaptación de procesos operativos'],
  },
  flood_risk: {
    retail:         ['Interrupción operativa por inundación', 'Daño a infraestructura y equipos', 'Riesgo logístico y de acceso'],
    educacion:      ['Daño estructural a instalaciones', 'Interrupción del servicio educativo'],
    salud:          ['Interrupción crítica de servicios de salud', 'Daño a equipos médicos de alto valor'],
    entretenimiento:['Daño a instalaciones recreativas', 'Cancelación prolongada de operaciones'],
    otros:          ['Interrupción operativa', 'Daño a infraestructura', 'Riesgo logístico'],
  },
};

// ─── Rangos de impacto financiero (USD/año) por señal × sector ───────────────
// Estimaciones basadas en benchmarks de riesgo climático para retail latinoamericano
// Fuente: TCFD Guidance for Retail Sector + análisis interno Intercorp
const FINANCIAL_RANGES = {
  extreme_heat: {
    retail:         { min_usd: 85_000,  max_usd: 210_000 },
    educacion:      { min_usd: 20_000,  max_usd: 60_000  },
    salud:          { min_usd: 50_000,  max_usd: 150_000 },
    entretenimiento:{ min_usd: 30_000,  max_usd: 90_000  },
    otros:          { min_usd: 15_000,  max_usd: 50_000  },
  },
  severe_heat: {
    retail:         { min_usd: 150_000, max_usd: 400_000 },
    educacion:      { min_usd: 40_000,  max_usd: 100_000 },
    salud:          { min_usd: 100_000, max_usd: 300_000 },
    entretenimiento:{ min_usd: 60_000,  max_usd: 180_000 },
    otros:          { min_usd: 30_000,  max_usd: 100_000 },
  },
  drought: {
    retail:         { min_usd: 40_000,  max_usd: 120_000 },
    educacion:      { min_usd: 10_000,  max_usd: 30_000  },
    salud:          { min_usd: 30_000,  max_usd: 80_000  },
    entretenimiento:{ min_usd: 15_000,  max_usd: 45_000  },
    otros:          { min_usd: 10_000,  max_usd: 35_000  },
  },
  extreme_rain: {
    retail:         { min_usd: 60_000,  max_usd: 200_000 },
    educacion:      { min_usd: 25_000,  max_usd: 80_000  },
    salud:          { min_usd: 80_000,  max_usd: 250_000 },
    entretenimiento:{ min_usd: 40_000,  max_usd: 120_000 },
    otros:          { min_usd: 20_000,  max_usd: 70_000  },
  },
  temp_increase: {
    retail:         { min_usd: 30_000,  max_usd: 90_000  },
    educacion:      { min_usd: 10_000,  max_usd: 30_000  },
    salud:          { min_usd: 20_000,  max_usd: 60_000  },
    entretenimiento:{ min_usd: 15_000,  max_usd: 45_000  },
    otros:          { min_usd: 8_000,   max_usd: 25_000  },
  },
  flood_risk: {
    retail:         { min_usd: 100_000, max_usd: 500_000 },
    educacion:      { min_usd: 50_000,  max_usd: 200_000 },
    salud:          { min_usd: 150_000, max_usd: 600_000 },
    entretenimiento:{ min_usd: 80_000,  max_usd: 300_000 },
    otros:          { min_usd: 40_000,  max_usd: 150_000 },
  },
};

// ─── Sensibilidad por sector ─────────────────────────────────────────────────
// Refleja cuán dependiente es el sector de condiciones climáticas estables
const SECTOR_SENSITIVITY = {
  retail:         'alto',    // cadena frío, logística, confort cliente
  salud:          'alto',    // cadena frío crítica, pacientes vulnerables
  educacion:      'medio',   // confort, acceso, infraestructura
  entretenimiento:'medio',   // afluencia, eventos al aire libre
  otros:          'bajo',
};

// ─── Sensibilidad adicional por tipo de activo ───────────────────────────────
const ASSET_TYPE_SENSITIVITY_BOOST = {
  supermercado:   'alto',
  farmacia:       'alto',
  hospital:       'alto',
  clinica:        'alto',
  almacen:        'medio',
  tienda:         'medio',
  colegio:        'medio',
  universidad:    'medio',
  cine:           'bajo',
  restaurante:    'medio',
};

/**
 * Normaliza el nombre del sector a una clave interna.
 */
function normalizeSector(sector) {
  const s = (sector || '').toLowerCase().trim();
  if (s.includes('retail') || s.includes('supermercado') || s.includes('tienda')) return 'retail';
  if (s.includes('salud') || s.includes('hospital') || s.includes('clinica') || s.includes('farmacia')) return 'salud';
  if (s.includes('educ') || s.includes('colegio') || s.includes('universidad')) return 'educacion';
  if (s.includes('entret') || s.includes('cine') || s.includes('recreac')) return 'entretenimiento';
  return 'otros';
}

/**
 * Calcula exposure_level basado en cantidad y tipo de señales detectadas.
 */
function calcExposureLevel(signals) {
  const criticalSignals = ['severe_heat', 'flood_risk'];
  const hasCritical = signals.some(s => criticalSignals.includes(s.signalType));
  if (hasCritical || signals.length >= 3) return 'alto';
  if (signals.length >= 1) return 'medio';
  return 'bajo';
}

/**
 * Calcula sensitivity_level combinando sector y asset_type.
 */
function calcSensitivityLevel(sectorKey, asset_type) {
  const sectorSens = SECTOR_SENSITIVITY[sectorKey] ?? 'bajo';
  const assetSens  = ASSET_TYPE_SENSITIVITY_BOOST[(asset_type || '').toLowerCase()] ?? null;

  // Si el activo tiene sensibilidad 'alto', prevalece
  if (assetSens === 'alto') return 'alto';
  return sectorSens;
}

/**
 * Función principal exportada.
 * @param {Object} signalOutput - Output de Layer 2
 * @param {Object} params - { sector, asset_type? }
 * @returns {{ risks: Array, overall_exposure: string }}
 */
export function assessBusinessRisk(signalOutput, { sector, asset_type = null }) {
  const { signals } = signalOutput;
  const sectorKey = normalizeSector(sector);

  const risks = signals.map(signal => {
    const impacts = OPERATIONAL_IMPACTS[signal.signalType]?.[sectorKey]
      ?? OPERATIONAL_IMPACTS[signal.signalType]?.otros
      ?? ['Impacto operacional no especificado'];

    const financialRange = FINANCIAL_RANGES[signal.signalType]?.[sectorKey]
      ?? FINANCIAL_RANGES[signal.signalType]?.otros
      ?? { min_usd: 0, max_usd: 0 };

    return {
      signal,
      operational_impacts:   impacts,
      exposure_level:        calcExposureLevel([signal]),
      sensitivity_level:     calcSensitivityLevel(sectorKey, asset_type),
      financial_impact_range: financialRange,
    };
  });

  return {
    risks,
    overall_exposure: calcExposureLevel(signals),
    sector_key:       sectorKey,
  };
}
