import { describe, it } from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync } from "fs";

describe("Transition Risks", () => {
  it("sector-profiles.json should exist and have valid sectors", () => {
    assert.ok(existsSync("pipeline/config/sector-profiles.json"));
    const content = JSON.parse(readFileSync("pipeline/config/sector-profiles.json", "utf-8"));
    assert.ok(content.sectors);
    assert.ok(content.sectors.retail);
    assert.ok(content.sectors.finance);
    assert.ok(Array.isArray(content.sectors.retail.transition_risks));
  });

  it("transition-risk-detector should detect risks for known sectors", async () => {
    const { detectTransitionRisks } = await import("../../../pipeline/stages/04-signals/detectors/transition-risk-detector.js");
    const { profile_source, risks } = detectTransitionRisks("retail");
    assert.equal(profile_source, "sector_specific");
    assert.ok(Array.isArray(risks));
    assert.ok(risks.length > 0);
    assert.ok(risks.every(r => r.type && r.description && r.severity));
    assert.ok(risks.every(r => typeof r.signal_strength === "number"));
  });

  // H-16 (documentacion-v2/stage-04, MEDIO): profile_source hace explícito
  // que este resultado vacío viene de caer en el perfil "default" (sin
  // riesgos configurados), no de haber evaluado "unknown_sector" y encontrar
  // genuinamente cero riesgos — un array vacío por sí solo no distinguía
  // ambos casos.
  it("transition-risk-detector should return empty AND flag profile_source='default' for unknown sectors", async () => {
    const { detectTransitionRisks } = await import("../../../pipeline/stages/04-signals/detectors/transition-risk-detector.js");
    const { profile_source, risks } = detectTransitionRisks("unknown_sector");
    assert.equal(profile_source, "default");
    assert.ok(Array.isArray(risks));
    assert.equal(risks.length, 0);
  });

  it("Stage06Risk should include transition risks in output", async () => {
    const { Stage06Risk } = await import("../../../pipeline/stages/06-risk/index.js");
    const stage = new Stage06Risk();
    const result = stage.execute({
      phenomena: [],
      sector: "retail",
      config: {},
    });
    assert.ok(Array.isArray(result.transition_risks));
    assert.ok(result.transition_risks.length > 0);
    assert.ok(result.transition_risks.every(r => r.type && r.description));
    assert.equal(result.transition_risk_profile_source, "sector_specific");
  });

  it("H-16: Stage06Risk flags transition_risk_profile_source='default' for a sector with no dedicated profile", async () => {
    const { Stage06Risk } = await import("../../../pipeline/stages/06-risk/index.js");
    const stage = new Stage06Risk();
    const result = stage.execute({
      phenomena: [],
      sector: "unknown_sector",
      config: {},
    });
    assert.equal(result.transition_risk_profile_source, "default");
    assert.equal(result.transition_risks.length, 0);
  });

  it("Stage07Presentation analyst view should include transition risks", async () => {
    const { Stage07Presentation } = await import("../../../pipeline/stages/07-presentation/index.js");
    const stage = new Stage07Presentation();
    const result = stage.execute({
      location: { lat: -11.8996, lon: -76.67358 },
      sector: "retail",
      phenomena: [],
      assessments: [],
      transition_risks: [
        { type: "regulatory", description: "Carbon tax", severity: "alta", timeframe: "corto", signal_strength: 0.75 },
      ],
      view: "analyst",
    });
    assert.equal(result.view, "analyst");
    assert.ok(Array.isArray(result.response.transition_risks));
    assert.equal(result.response.transition_risks.length, 1);
    assert.ok(result.response.executive_summary.includes("transición"));
  });

  it("Stage07Presentation executive view should mention transition risks in summary", async () => {
    const { Stage07Presentation } = await import("../../../pipeline/stages/07-presentation/index.js");
    const stage = new Stage07Presentation();
    const result = stage.execute({
      location: { lat: -11.8996, lon: -76.67358, location_name: "Test" },
      sector: "finance",
      phenomena: [],
      assessments: [],
      transition_risks: [
        { type: "market", description: "Asset revaluation", severity: "alta", timeframe: "mediano", signal_strength: 0.8 },
      ],
      view: "executive",
    });
    assert.equal(result.view, "executive");
    assert.ok(result.response.executive_summary.includes("transición"));
    assert.ok(result.response.recommendations.some(r => r.includes("transición")));
  });

  it("H-15: all sector profiles should have transition_sensitivity defined", () => {
    // H-15: transition_sensitivity is now REQUIRED in each sector profile.
    // The old ?? 0.5 fallback was indistinguishable from the default sector's
    // value, making it impossible for an auditor to know if the 0.5 came
    // from the profile or from a silent fallback.
    const content = JSON.parse(readFileSync("pipeline/config/sector-profiles.json", "utf-8"));
    const sectors = Object.keys(content.sectors);
    for (const sector of sectors) {
      const profile = content.sectors[sector];
      assert.ok(
        profile.transition_sensitivity != null,
        `sector '${sector}' must have transition_sensitivity defined (H-15: no silent fallback allowed)`
      );
      assert.ok(
        typeof profile.transition_sensitivity === "number",
        `sector '${sector}' transition_sensitivity must be a number`
      );
      assert.ok(
        profile.transition_sensitivity >= 0 && profile.transition_sensitivity <= 1,
        `sector '${sector}' transition_sensitivity must be between 0 and 1`
      );
    }
  });

  it("H-15: default profile should have transition_sensitivity defined", () => {
    // H-15: the default profile is the fallback for unknown sectors.
    // It MUST have transition_sensitivity to avoid the fallback ?? 0.5.
    const content = JSON.parse(readFileSync("pipeline/config/sector-profiles.json", "utf-8"));
    assert.ok(
      content.default.transition_sensitivity != null,
      "default profile must have transition_sensitivity defined (H-15)"
    );
    assert.strictEqual(
      content.default.transition_sensitivity,
      0.5,
      "default profile transition_sensitivity should be 0.5 (explicit, not fallback)"
    );
  });
});
