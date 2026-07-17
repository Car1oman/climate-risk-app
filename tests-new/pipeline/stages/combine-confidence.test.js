import { describe, it } from "node:test";
import assert from "node:assert";
import { combineConfidence } from "../../../pipeline/stages/05-phenomena/combine-confidence.js";

describe("combineConfidence (H-5.3)", () => {
  describe("geometric_mean (default)", () => {
    it("returns √(sq × ss)", () => {
      assert.strictEqual(combineConfidence(0.8, 0.5, "geometric_mean"), Math.sqrt(0.8 * 0.5));
    });

    it("returns 0 when either input is 0", () => {
      assert.strictEqual(combineConfidence(0, 0.5, "geometric_mean"), 0);
      assert.strictEqual(combineConfidence(0.8, 0, "geometric_mean"), 0);
    });

    it("returns 1 when both inputs are 1", () => {
      assert.strictEqual(combineConfidence(1, 1, "geometric_mean"), 1);
    });

    it("is used when method is undefined (default fallback)", () => {
      assert.strictEqual(combineConfidence(0.8, 0.5, undefined), Math.sqrt(0.8 * 0.5));
    });

    it("penalizes imbalance: 0.9×0.5 < 0.7×0.7", () => {
      const imbalanced = combineConfidence(0.9, 0.5, "geometric_mean");
      const balanced = combineConfidence(0.7, 0.7, "geometric_mean");
      assert.ok(imbalanced < balanced);
    });
  });

  describe("min", () => {
    it("returns min(sq, ss)", () => {
      assert.strictEqual(combineConfidence(0.8, 0.5, "min"), 0.5);
      assert.strictEqual(combineConfidence(0.3, 0.9, "min"), 0.3);
    });

    it("returns equal value when both inputs are equal", () => {
      assert.strictEqual(combineConfidence(0.6, 0.6, "min"), 0.6);
    });

    it("is always ≤ geometric_mean for same inputs", () => {
      const minVal = combineConfidence(0.8, 0.5, "min");
      const gmVal = combineConfidence(0.8, 0.5, "geometric_mean");
      assert.ok(minVal <= gmVal);
    });
  });

  describe("weighted", () => {
    it("returns w1*sq + w2*ss normalized by total weight", () => {
      const result = combineConfidence(0.8, 0.5, "weighted", { source_quality: 0.7, signal_strength: 0.3 });
      const expected = (0.7 * 0.8 + 0.3 * 0.5) / (0.7 + 0.3);
      assert.strictEqual(result, expected);
    });

    it("defaults to 50/50 when weights are not provided", () => {
      const result = combineConfidence(0.8, 0.5, "weighted");
      assert.strictEqual(result, (0.5 * 0.8 + 0.5 * 0.5) / 1.0);
    });

    it("defaults to 50/50 when weights object is empty", () => {
      const result = combineConfidence(0.8, 0.5, "weighted", {});
      assert.strictEqual(result, 0.65);
    });

    it("gives more weight to source_quality when configured", () => {
      const result = combineConfidence(0.9, 0.1, "weighted", { source_quality: 0.9, signal_strength: 0.1 });
      // (0.9*0.9 + 0.1*0.1) / 1.0 = 0.82
      assert.ok(result > 0.8);
    });

    it("is equivalent to arithmetic mean when weights are equal", () => {
      const result = combineConfidence(0.6, 0.4, "weighted", { source_quality: 0.5, signal_strength: 0.5 });
      assert.strictEqual(result, 0.5); // (0.5*0.6 + 0.5*0.4) / 1.0
    });
  });

  describe("method comparison", () => {
    const sq = 0.8, ss = 0.5;

    it("min ≤ geometric_mean ≤ weighted (for this input pair with default 50/50)", () => {
      const minVal = combineConfidence(sq, ss, "min");
      const gmVal = combineConfidence(sq, ss, "geometric_mean");
      const wVal = combineConfidence(sq, ss, "weighted");
      assert.ok(minVal <= gmVal, `min(${minVal}) should be ≤ geometric_mean(${gmVal})`);
      assert.ok(gmVal <= wVal, `geometric_mean(${gmVal}) should be ≤ weighted(${wVal})`);
    });
  });

  // H-5.5: análisis explícito de la propiedad de penalización por desbalance
  //
  // Corrección (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, hallazgo
  // encontrado al correr la suite tras el plan de remediación): las 2 pruebas
  // de este describe asumían que la media geométrica de dos valores positivos
  // puede caer POR DEBAJO del menor de los dos (gm < min). Esto es
  // matemáticamente imposible — para cualquier a,b > 0, GM(a,b)=√(a×b) está
  // SIEMPRE en el rango [min(a,b), max(a,b)], igual a min solo cuando a=b, y
  // estrictamente MAYOR que min en cualquier otro caso (desigualdad AM-GM). La
  // "penalización" real de la media geométrica no es "cae por debajo del
  // componente más débil" — es "cae por debajo de lo que el componente MÁS
  // ALTO produciría si ambos coincidieran" (ver el segundo test corregido
  // abajo). Este error de fórmula venía citado también en
  // documentacion-v2/stage-05/AUDITORIA-stage-05-phenomena.md (H-5.5) y se
  // corrige aquí en la fuente.
  describe("H-5.5 - penalization properties", () => {
    it("geometric_mean is strictly between min(sq, ss) and max(sq, ss) for unequal inputs (AM-GM inequality)", () => {
      const gm = combineConfidence(0.8, 0.6, "geometric_mean");
      const minVal = combineConfidence(0.8, 0.6, "min");
      const maxVal = Math.max(0.8, 0.6);
      assert.ok(gm > minVal, `geometric_mean(${gm}) should be > min(${minVal}) for unequal inputs`);
      assert.ok(gm < maxVal, `geometric_mean(${gm}) should be < max(${maxVal}) for unequal inputs`);
    });

    it("geometric_mean equals min(sq, ss) when sq === ss", () => {
      const gm = combineConfidence(0.7, 0.7, "geometric_mean");
      const minVal = combineConfidence(0.7, 0.7, "min");
      assert.strictEqual(gm, minVal);
    });

    it("weighted (50/50) is always ≥ geometric_mean for same inputs", () => {
      const gm = combineConfidence(0.8, 0.5, "geometric_mean");
      const w = combineConfidence(0.8, 0.5, "weighted");
      assert.ok(w >= gm, `weighted(${w}) should be ≥ geometric_mean(${gm})`);
    });

    it("geometric_mean(0.8, 0.6) ≈ 0.693 — 13% reduction vs. the unpenalized case (0.8, 0.8)", () => {
      const gm = combineConfidence(0.8, 0.6, "geometric_mean");
      const expected = Math.sqrt(0.8 * 0.6); // ≈ 0.6928
      assert.ok(Math.abs(gm - expected) < 1e-10);
      // Baseline correcto: cuánto "pierde" el score por el desbalance,
      // comparado con el score que tendría si ss también fuera 0.8 (sin
      // desbalance) — NO comparado con el componente más débil (0.6), que
      // producía una "reducción" negativa (GM=0.693 > 0.6, un aumento, no una
      // reducción — la aserción original nunca podía pasar matemáticamente).
      const unpenalizedBaseline = combineConfidence(0.8, 0.8, "geometric_mean"); // = 0.8
      const reduction = (unpenalizedBaseline - gm) / unpenalizedBaseline;
      assert.ok(reduction > 0.10 && reduction < 0.15, `reduction should be ~13%, got ${(reduction * 100).toFixed(1)}%`);
    });

    it("no method can exceed max(sq, ss)", () => {
      const methods = ["geometric_mean", "min", "weighted"];
      const inputs = [[0.9, 0.1], [0.5, 0.5], [0.3, 0.8]];
      for (const [sq, ss] of inputs) {
        for (const m of methods) {
          const result = combineConfidence(sq, ss, m);
          assert.ok(result <= Math.max(sq, ss), `${m}(${sq},${ss})=${result} should be ≤ max(${Math.max(sq, ss)})`);
        }
      }
    });

    it("all methods return equal value when both inputs are equal", () => {
      const v = 0.65;
      const gm = combineConfidence(v, v, "geometric_mean");
      const minVal = combineConfidence(v, v, "min");
      const w = combineConfidence(v, v, "weighted");
      assert.strictEqual(gm, v);
      assert.strictEqual(minVal, v);
      assert.strictEqual(w, v);
    });
  });
});
