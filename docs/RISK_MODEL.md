// Documentación del Modelo de Scoring de Riesgo Climático
// ========================================================

/**
 * FÓRMULA PRINCIPAL:
 * R = (H × 0.40) + (E × 0.30) + (I × 0.30)
 * 
 * Donde:
 * - H (Hazard Score): Riesgo de amenazas climáticas (peso 40%)
 * - E (Exposure Score): Exposición del activo (peso 30%)
 * - I (Impact Score): Impacto financiero estimado (peso 30%)
 * - R (Risk Score): Score final de riesgo (0-1, normalizado)
 */

// ========================================================
// 1. HAZARD SCORE (Amenaza)
// ========================================================

/**
 * Calcula un score ponderado basado en 5 amenazas principales:
 * 
 * Amenazas:
 * - Inundación Fluvial (30% del peso total)
 * - Fenómeno El Niño (25% del peso total)
 * - Sismo (20% del peso total)
 * - Deslizamiento (15% del peso total)
 * - Sequía Hídrica (10% del peso total)
 * 
 * Cada amenaza tiene un nivel (0-4):
 * - 0: Sin riesgo
 * - 1: Riesgo bajo
 * - 2: Riesgo medio
 * - 3: Riesgo alto
 * - 4: Riesgo crítico
 * 
 * Cálculo:
 * H = Σ(weight_i × (level_i / 4))
 */

// ========================================================
// 2. EXPOSURE SCORE (Exposición)
// ========================================================

/**
 * Evalúa cuán expuesto está el activo basado en:
 * 
 * Variables:
 * - area_m2: Área física del activo
 * - type: Tipo de tienda (supermercado grande, mediano, centro de distribución, express)
 * - condition: Propio o alquilado (afecta costo de rehabilitación)
 * 
 * Factores por tipo:
 * - Supermercado Grande: 1.0 (máxima exposición)
 * - Centro de Distribución: 1.2 (mayor volumen de operación)
 * - Supermercado Mediano: 0.8
 * - Tienda Express: 0.6 (mínima exposición)
 * 
 * Formula: E = (area_m2 / max_area) × type_factor
 * Normalizado a rango 0-1
 */

// ========================================================
// 3. IMPACT SCORE (Impacto Financiero)
// ========================================================

/**
 * Estima el impacto financiero en caso de evento climático
 * 
 * Componentes:
 * 1. Pérdida de Ventas: sales × (closure_days / 30)
 * 2. Costo Staff: employees × 80 × closure_days
 * 3. Costo Logístico: lost_sales × 0.15
 * 4. Costo Rehabilitación: area_m2 × rehab_factor × condition_multiplier
 * 
 * Costos de Rehabilitación por Amenaza (por m²):
 * - El Niño: S/ 150/m²
 * - Sismo: S/ 350/m²
 * - Deslizamiento: S/ 200/m²
 * - Inundación: S/ 120/m²
 * - Sequía: S/ 40/m²
 * 
 * Días de Cierre según Nivel de Riesgo:
 * - Nivel 0: 0 días
 * - Nivel 1: 3 días
 * - Nivel 2: 7 días
 * - Nivel 3: 21 días
 * - Nivel 4: 45 días
 * 
 * Total = L_ventas + C_staff + C_logistico + C_rehab
 * I = total / 20,000,000 (normalizado, capped en 1.0)
 */

// ========================================================
// 4. MAPEO DE RIESGO FINAL
// ========================================================

/**
 * Clasificación por Risk Score:
 * 
 * Crítico:  R ≥ 0.75 (75-100 puntos)
 *   - Requiere atención inmediata
 *   - Acciones de mitigación urgentes
 * 
 * Alto:     R ≥ 0.50 (50-74 puntos)
 *   - Riesgo significativo
 *   - Implementar medidas de adaptación
 * 
 * Medio:    R ≥ 0.25 (25-49 puntos)
 *   - Riesgo moderado
 *   - Monitoreo continuo
 * 
 * Bajo:     R < 0.25 (0-24 puntos)
 *   - Riesgo bajo
 *   - Medidas estándar de precaución
 */

// ========================================================
// 5. HORIZONTES TEMPORALES
// ========================================================

/**
 * Classify risk horizon based on hazard type:
 * 
 * Corto Plazo (6-12 meses):
 * - Inundación Fluvial
 * - Fenómeno El Niño
 * 
 * Mediano Plazo (1-3 años):
 * - Deslizamiento
 * - Sequía Hídrica
 * 
 * Largo Plazo (3+ años):
 * - Sismo (riesgo constante, ocurrencia impredecible)
 */

// ========================================================
// 6. FUNCIONES PRINCIPALES
// ========================================================

/**
 * calculateHazardScore(asset)
 * Retorna: hazard_score (0-1)
 * Uso: Evalúa amenazas climáticas basadas en datos del activo
 */

/**
 * calculateExposureScore(asset, maxArea)
 * Parámetros:
 *   - asset: datos del activo
 *   - maxArea: área máxima de referencia (default 5000 m²)
 * Retorna: exposure_score (0-1)
 * Uso: Evalúa vulnerabilidad física del activo
 */

/**
 * calculateFinancialImpact(asset, elNinoMultiplier)
 * Parámetros:
 *   - asset: datos del activo
 *   - elNinoMultiplier: multiplicador de ciclo El Niño (default 1.0)
 * Retorna: objeto con desglose de costos
 * Uso: Estima impacto económico directo
 */

/**
 * calculateRiskScore(asset, maxArea, elNinoMultiplier)
 * Retorna: objeto completo con H, E, I, R y clasificación
 * Uso: Cálculo integrado de riesgo final
 */

/**
 * getTopHazards(asset)
 * Retorna: array de top 2 amenazas ordenadas por score
 * Uso: Identificación de riesgos principales
 */

/**
 * generateRiskNarrative(asset, scores)
 * Retorna: texto descriptivo alineado al modelo
 * Uso: Comunicar riesgo en lenguaje natural
 */

/**
 * generateRiskRecommendations(asset, scores)
 * Retorna: array de recomendaciones priorizadas
 * Uso: Proporcionar acciones de adaptación específicas
 */

/**
 * getCompleteRiskModel(asset, maxArea, elNinoMultiplier)
 * Retorna: objeto integrado con scores, narrativa y recomendaciones
 * Uso: Vista completa del modelo para UI
 */

// ========================================================
// 7. EJEMPLO DE CÁLCULO
// ========================================================

/**
 * Asset: Supermercado en Miraflores
 * - area_m2: 2500
 * - monthly_sales: 800,000 (S/)
 * - type: supermercado_grande
 * - hazard_flood: 3 (alto)
 * - hazard_elnino: 2 (medio)
 * - hazard_earthquake: 3 (alto)
 * - hazard_landslide: 1 (bajo)
 * - hazard_drought: 0 (sin riesgo)
 * 
 * Cálculos:
 * H = (0.30 × 0.75) + (0.25 × 0.50) + (0.20 × 0.75) + (0.15 × 0.25) + (0.10 × 0) = 0.51
 * E = (2500 / 5000) × 1.0 = 0.50
 * I_total ~ S/ 3,500,000 → I = 0.175
 * R = (0.51 × 0.40) + (0.50 × 0.30) + (0.175 × 0.30) = 0.204 + 0.150 + 0.053 = 0.407
 * 
 * Clasificación: MEDIO (0.407 está entre 0.25 y 0.50)
 * Riesgos Principales: Inundación (3/4) y Sismo (3/4)
 * Top Hazard: Inundación Fluvial
 */

export default "Risk Model Documentation";
