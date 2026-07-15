import { describe, it } from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync } from "fs";

describe("ExecutiveDashboard — file structure", () => {
  it("ExecutiveDashboard/index.jsx should export ExecutiveDashboard", () => {
    const content = readFileSync("src-new/components/ExecutiveDashboard/index.jsx", "utf-8");
    assert.ok(content.includes("export function ExecutiveDashboard"));
    assert.ok(content.includes("RiskSummary"));
    assert.ok(content.includes("PhenomenonCard"));
    assert.ok(content.includes("RecommendationsList"));
  });

  it("RiskSummary.jsx should export RiskSummary with level colors", () => {
    const content = readFileSync("src-new/components/ExecutiveDashboard/RiskSummary.jsx", "utf-8");
    assert.ok(content.includes("export function RiskSummary"));
    assert.ok(content.includes("LEVEL_COLORS"));
    assert.ok(content.includes("overallRisk"));
  });

  it("PhenomenonCard.jsx should export PhenomenonCard with icons", () => {
    const content = readFileSync("src-new/components/ExecutiveDashboard/PhenomenonCard.jsx", "utf-8");
    assert.ok(content.includes("export function PhenomenonCard"));
    assert.ok(content.includes("LEVEL_STYLES"));
    assert.ok(content.includes("riskContribution"));
  });

  it("RecommendationsList.jsx should export RecommendationsList", () => {
    const content = readFileSync("src-new/components/ExecutiveDashboard/RecommendationsList.jsx", "utf-8");
    assert.ok(content.includes("export function RecommendationsList"));
    assert.ok(content.includes("recommendations"));
  });

  it("RiskAnalysis.jsx should integrate dashboard + trace", () => {
    const content = readFileSync("src-new/pages/RiskAnalysis.jsx", "utf-8");
    assert.ok(content.includes("export function RiskAnalysis"));
    assert.ok(content.includes("ExecutiveDashboard"));
    assert.ok(content.includes("TraceInspector"));
  });

  it("useClimateRisk.js should export createClimateRiskFetcher", () => {
    const content = readFileSync("src-new/hooks/useClimateRisk.js", "utf-8");
    assert.ok(content.includes("export function createClimateRiskFetcher"));
  });

  it("All ExecutiveDashboard component files exist", () => {
    const files = [
      "src-new/components/ExecutiveDashboard/index.jsx",
      "src-new/components/ExecutiveDashboard/RiskSummary.jsx",
      "src-new/components/ExecutiveDashboard/PhenomenonCard.jsx",
      "src-new/components/ExecutiveDashboard/RecommendationsList.jsx",
      "src-new/hooks/useClimateRisk.js",
      "src-new/pages/RiskAnalysis.jsx",
    ];
    for (const f of files) {
      assert.ok(existsSync(f), `Missing: ${f}`);
    }
  });
});
