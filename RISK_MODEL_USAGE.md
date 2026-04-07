# Guía de Uso: Modelo de Scoring de Riesgo Climático

## 📊 Vista General

El modelo de riesgo climático integrado muestra cómo se calcula el nivel de riesgo para cada activo considerando **amenazas**, **exposición** e **impacto financiero**.

## 🔍 Cómo Acceder al Modelo

1. **Navega a un Activo**: En la vista de Assets, haz clic en cualquier tienda o centro de distribución
2. **Desplázate a "Modelo de Riesgo Climático"**: Encontrarás una sección completa con:
   - Fórmula aplicada
   - Scores desglosados
   - Amenazas dominantes
   - Impacto financiero
   - Narrativa de riesgo
   - Recomendaciones de adaptación

## 📐 Entender la Fórmula

```
R = (H × 0.40) + (E × 0.30) + (I × 0.30)
```

- **H (Hazard - 40%)**: Riesgo de 5 amenazas climáticas ponderadas
- **E (Exposure - 30%)**: Vulnerabilidad del activo por tipo, tamaño y condición
- **I (Impact - 30%)**: Estimación de pérdida financiera en caso de evento

## 🎯 Interpretación de Scores

### Risk Score (0-100)

| Rango | Clasificación | Acción Recomendada |
|-------|---------------|--------------------|
| 75-100 | **CRÍTICO** | Atención inmediata, mitigación urgente |
| 50-74 | **ALTO** | Implementar medidas de adaptación |
| 25-49 | **MEDIO** | Monitoreo continuo |
| 0-24 | **BAJO** | Medidas estándar de precaución |

### Scores Individuales (0-100)

- **Hazard Score**: Nivel de amenazas climáticas en la zona
  - Considera: inundación, El Niño, sismo, deslizamiento, sequía
  
- **Exposure Score**: Vulnerabilidad física del activo
  - Considera: área, tipo de tienda, condición
  
- **Impact Score**: Severidad del impacto financiero
  - Considera: pérdida de ventas, costos operativos, rehabilitación

## 🌍 Amenazas Climáticas

El modelo evalúa 5 amenazas principales en escala 0-4:

1. **Inundación Fluvial** (30% del peso)
   - Horizonte: Corto plazo (6-12 meses)
   - Impacto: Alto en zonas bajas

2. **Fenómeno El Niño** (25% del peso)
   - Horizonte: Corto plazo (6-12 meses)
   - Impacto: Disrupción de cadena de suministro

3. **Sismo** (20% del peso)
   - Horizonte: Largo plazo (3+ años)
   - Impacto: Daño estructural severo

4. **Deslizamiento** (15% del peso)
   - Horizonte: Mediano plazo (1-3 años)
   - Impacto: Variable según ubicación

5. **Sequía Hídrica** (10% del peso)
   - Horizonte: Mediano plazo (1-3 años)
   - Impacto: Costo operativo aumentado

## 💰 Impacto Financiero

El modelo estima pérdidas en soles peruanos:

- **Pérdida de Ventas**: Por días de cierre operativo
- **Costo de Staff**: Sueldos durante cierre
- **Costo Logístico**: 15% de ventas perdidas
- **Rehabilitación**: Por m² según amenaza principal

**Ejemplo**: Un supermercado grande con inundación nivel 3 podría perder S/ 2.5M

## 📋 Recomendaciones Personalizadas

Las recomendaciones se generan automáticamente basadas en:

- **Amenaza principal**: Medidas específicas para mitigar
- **Nivel de exposición**: Adaptación según tamaño y tipo
- **Impacto financiero**: Prioridad según magnitud

Cada recomendación incluye:
- Descripción de la acción
- Prioridad (Crítica, Alta, Media)
- Impacto esperado

## 🔧 Funciones Disponibles

### Para Desarrolladores

```javascript
import { 
  getCompleteRiskModel,
  calculateHazardScore,
  calculateExposureScore,
  calculateFinancialImpact,
  getTopHazards,
  generateRiskNarrative
} from '@/lib/riskEngine';

// Obtener modelo completo
const model = getCompleteRiskModel(asset);

// Acceder a componentes específicos
const hazardScore = model.hazardScore;  // 0-1
const topHazards = model.topHazards;    // array
const narrative = model.narrative;      // string
const recommendations = model.recommendations; // array
```

## 📚 Más Información

Ver documentación técnica completa en: `/docs/RISK_MODEL.md`

---

**Última actualización**: Abril 2026
**Versión del modelo**: 1.0
