import { describe, it } from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync } from "fs";

describe("TraceInspector — file structure", () => {
  it("SourceList.jsx should export SourceList function", () => {
    const content = readFileSync("src-new/components/TraceInspector/SourceList.jsx", "utf-8");
    assert.ok(content.includes("export function SourceList"));
    assert.ok(content.includes("sources_consulted"));
  });

  it("SignalDetail.jsx should export SignalDetail function", () => {
    const content = readFileSync("src-new/components/TraceInspector/SignalDetail.jsx", "utf-8");
    assert.ok(content.includes("export function SignalDetail"));
    assert.ok(content.includes("source_quality"));
    assert.ok(content.includes("signal_strength"));
  });

  it("RulesTimeline.jsx should export RulesTimeline function", () => {
    const content = readFileSync("src-new/components/TraceInspector/RulesTimeline.jsx", "utf-8");
    assert.ok(content.includes("export function RulesTimeline"));
    assert.ok(content.includes("rules_applied"));
  });

  it("TraceInspector/index.jsx should export TraceInspector", () => {
    const content = readFileSync("src-new/components/TraceInspector/index.jsx", "utf-8");
    assert.ok(content.includes("export function TraceInspector"));
    assert.ok(content.includes("SourceList"));
    assert.ok(content.includes("SignalDetail"));
    assert.ok(content.includes("RulesTimeline"));
  });

  it("useTraceInspection.js should export useTraceInspection function", () => {
    const content = readFileSync("src-new/hooks/useTraceInspection.js", "utf-8");
    assert.ok(content.includes("export function useTraceInspection"));
    assert.ok(content.includes("trace"));
    assert.ok(content.includes("loading"));
    assert.ok(content.includes("error"));
  });

  it("All TraceInspector component files exist", () => {
    const files = [
      "src-new/components/TraceInspector/index.jsx",
      "src-new/components/TraceInspector/SourceList.jsx",
      "src-new/components/TraceInspector/SignalDetail.jsx",
      "src-new/components/TraceInspector/RulesTimeline.jsx",
      "src-new/hooks/useTraceInspection.js",
    ];
    for (const f of files) {
      assert.ok(existsSync(f), `Missing: ${f}`);
    }
  });
});
