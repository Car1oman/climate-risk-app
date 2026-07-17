# PASO-5 — Detección de Riesgos de Transición

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `detectTransitionRisk(variable, sector, source)` |
| **Localização** | `pipeline/stages/04-signals/detectors/transition-risk-detector.js` |
| **Stage** | Stage 04 — Signals (ID: 4) |
| **Versão do documento** | 1.0.0 |
| **Data** | 2026-07-15 |
| **Propósito** | Documentação do detector de riscos de transição climática baseado em setores |

---

## 1. Resumo Executivo

O detector de riscos de transição verifica se uma variável representa um risco de transição para o setor analisado, usando o perfil setorial (`sector-profiles.json`). O risco é classificado por severidade (`high`, `medium`, `low`) e tipo (`transition_physical`, `stranded_asset`, `regulatory`, `market`, `reputational`).

**Regra fundamental**: O detector é **binário** — ou detecta um risco (`is_active: true`) ou não (`is_active: false`). Não há scores intermediários.

---

## 2. Fluxo de Cálculo

```
detectTransitionRisk(variable, sector, source)                   // transition-risk-detector.js
  │
  ├── carregar sector-profiles.json
  │
  ├── procurar profiles.sectors[sector] ou profiles.default
  │
  ├── procurar transition_risks[] no perfil do setor
  │
  ├── para cada risk no perfil:
  │   ├── verificar se variable.name está em risk.variables[]
  │   │   ├── sim → risk é relevante para esta variável
  │   │   └── não → ignorar este risk
  │   │
  │   ├── calcular risk_score:
  │   │   ├── severity_score: 1.0 (high), 0.6 (medium), 0.3 (low)
  │   │   ├── sensitivity: transition_sensitivity do setor (0-1)
  │   │   └── risk_score = severity_score × sensitivity
  │   │
  │   ├── classificar risk_level:
  │   │   ├── risk_score >= 0.7 → "high"
  │   │   ├── risk_score >= 0.4 → "medium"
  │   │   └── risk_score < 0.4 → "low"
  │   │
  │   └── retornar risk object
  │
  └── retornar array de risks detectados
```

---

## 3. Perfil Setorial

### 3.1 Estrutura

```json
{
  "sectors": {
    "agriculture": {
      "transition_risks": [
        {
          "type": "transition_physical",
          "description": "Mudanças nos padrões de precipitação afetam produtividade agrícola",
          "variables": ["precipitation_sum", "air_temperature_current"],
          "timeframe": "2030-2050",
          "severity": "high"
        }
      ],
      "transition_sensitivity": 0.8
    }
  }
}
```

### 3.2 Setores

| Setor | transition_sensitivity | Riscos de transição |
|-------|----------------------|---------------------|
| `agriculture` | 0.8 | Precipitação, temperatura |
| `coastal_infrastructure` | 0.9 | Nível do mar, precipitação |
| `energy` | 0.7 | Velocidade do vento, temperatura |
| `tourism` | 0.6 | Temperatura, precipitação, vento |
| `default` | 0.5 | (fallback) |

### 3.3 Tipos de Risco

| Tipo | Descrição |
|------|-----------|
| `transition_physical` | Impactos físicos diretos da transição climática |
| `stranded_asset` | Ativos que perdem valor devido à transição |
| `regulatory` | Mudanças regulatórias (impostos de carbono, proibições) |
| `market` | Mudanças de demanda e preferências do consumidor |
| `reputational` | Riscos reputacionais associados à inação climática |

---

## 4. Severidade

| Severidade | score | Exemplo |
|------------|-------|---------|
| `high` | 1.0 | Perda significativa de produtividade, danos infraestrutura |
| `medium` | 0.6 | Mudanças moderadas, adaptáveis |
| `low` | 0.3 | Impactos menores, custos de adaptação baixos |

**Fórmula**: `risk_score = severity_score × transition_sensitivity`

---

## 5. Integração com Stage 04

O detector de riscos de transição é chamado em `index.js:262-270`:

```javascript
// pipeline/stages/04-signals/index.js:262-270
const transitionRisks = detectTransitionRisk(v, input.sector, sourceInput);
if (transitionRisks.length > 0) {
  signalOutput.transition_risks = transitionRisks;
}
```

**Regras**:
1. Risks são detectados **após** a classificação da sinal (PASO-4)
2. Risks são **adicionados** ao objeto de saída se existirem
3. Não afetam o cálculo de source_quality ou signal_strength
4. São usados downstream em stages posteriores (impact assessment)

---

## 6. Trazabilidade

| Referência | Achado | Resolução |
|------------|--------|-----------|
| H-18 (ALTO) | sector-profiles.json não incluía infrastructure | Adicionado setor "coastal_infrastructure" com 5 riscos |
| H-19 (MEDIO) | Detector retornava array vazio para setores não catalogados | Agora usa "default" profile como fallback |
