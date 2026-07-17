# PASO-4 — Clasificación de Señales (Taxonomía Declarativa)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `classifySignal(variable)` — função que mapeia variável canônica → nome/tipo de sinal |
| **Localização** | `pipeline/stages/04-signals/index.js:276-296` |
| **Stage** | Stage 04 — Signals (ID: 4) |
| **Versão do documento** | 1.0.0 |
| **Data** | 2026-07-15 |
| **Propósito** | Documentação do mapeamento declarativo de taxonomia de sinais via `signal-taxonomy.json` |

---

## 1. Resumo Executivo

A classificação de sinais mapeia cada variável canônica para um par `{signal_name, signal_type}` usando um arquivo JSON declarativo. Isso substitui a heurística baseada em substrings que anteriormente classificava incorretamente "preciptation_sum" como `projected` quando era na verdade `anomaly`.

**Regra fundamental**: O `signal_type` do JSON é o padrão, mas `signal_type_overrides_by_source` permite que fontes específicas usem um tipo diferente.

---

## 2. Fluxo de Cálculo

```
classifySignal(variable)                                     // index.js:276
  │
  ├── carregar signal-taxonomy.json
  │
  ├── procurar taxonomy.variables[variable.name]
  │   ├── encontrado → signal_name, signal_type
  │   │   ├── verificar overrides_by_source[variable.source]
  │   │   │   └── se existir → usar signal_type do override
  │   │   └── caso contrário → usar signal_type padrão
  │   │
  │   └── não encontrado → "unknown" / "unknown"
  │
  └── retornar { signalName, signalType }
```

---

## 3. Taxonomia Declarativa

### 3.1 Variáveis

| Variável Canônica | signal_name | signal_type | Notas |
|-------------------|-------------|-------------|-------|
| `air_temperature_current` | `temperatura_actual_anomaly` | `anomaly` | Observação atual vs baseline climatológica |
| `precipitation_sum` | `precipitacion_projection` | `projected` | Padrão: projeção. Override para nasa_power: `anomaly` |
| `wind_speed` | `viento_actual_anomaly` | `anomaly` | Observação atual vs baseline climatológica |
| `surface_pressure` | `presion_actual_anomaly` | `anomaly` | Observação atual vs baseline climatológica |
| `relative_humidity` | `humedad_actual_anomaly` | `anomaly` | Observação atual vs baseline climatológica |
| `elevation` | `elevacion_terreno` | `static` | Valor constante, sem anomalia/projeção |
| `oni_index` | `oni_current_phase` | `categorical` | El Niño / La Niña / Neutro |
| `cc_tas` | `temperatura_baseline_historical` | `static` | Dados climatológicos de referência |
| `cc_pr` | `precipitacion_baseline_historical` | `static` | Dados climatológicos de referência |
| `cc_tas_historical` | `temperatura_baseline_historical` | `static` | Histórico |
| `cc_pr_historical` | `precipitacion_baseline_historical` | `static` | Histórico |
| `poverty_rate` | `indicador_desarrollo` | `static` | Indicador socioeconômico |
| `gdp_per_capita` | `indicador_desarrollo` | `static` | Indicador socioeconômico |
| `water_access` | `indicador_desarrollo` | `static` | Indicador socioeconômico |
| `urban_population` | `indicador_desarrollo` | `static` | Indicador socioeconômico |

### 3.2 Overrides por Fonte

| Variável | Fonte | signal_type override | Razão |
|----------|-------|---------------------|-------|
| `precipitation_sum` | `nasa_power` | `anomaly` | NASA POWER fornece precipitação acumulada, não projeção CMIP6 |

### 3.3 Tipos de Sinal

| signal_type | Descrição | Detector | Exemplo |
|-------------|-----------|----------|---------|
| `anomaly` | Desvio de linha base climatológica (1991-2020) | AnomalyDetector | temperatura_atual_anomaly |
| `projected` | Projeção CMIP6 vs histórico | ProjectionDetector | precipitacion_projection |
| `categorical` | Estado categórico (El Niño, La Niña, Neutro) | CategoricalDetector | oni_current_phase |
| `static` | Valor constante/sem variação temporal | baseline_or_static | elevacion_terreno |

---

## 4. Regras de Classificação

1. **JSON declarativo**: O arquivo `signal-taxonomy.json` é a fonte única de verdade.
2. **Overrides por fonte**: `signal_type_overrides_by_source` permite que variáveis tenham tipos diferentes dependendo da fonte.
3. **Fallback**: Variáveis não catalogadas retornam `"unknown"` e são descartadas.
4. **Regra de negócio**: `signal_type` afeta quais componentes de signal_strength são calculados (H-07).

---

## 5. Trazabilidade

| Referência | Achado | Resolução |
|------------|--------|-----------|
| H-07 (ALTO) | signalName/signalType usava substrings ("anomaly" se contém "_anomaly", senão "projected") | Reemplazado por signal-taxonomy.json declarativo |
| H-09 (ALTO) | "precipitation_sum" classificada como projected incorretamente | Corrigido para anomaly com override para nasa_power |
