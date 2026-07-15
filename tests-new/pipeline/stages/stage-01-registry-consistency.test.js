import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage01Acquisition } from "../../../pipeline/stages/01-acquisition/index.js";
import { getAuthoritativeSources } from "../../../pipeline/orchestration/config-loader.js";

describe("Stage01 - SourceRegistry consistency", () => {
  it("every authoritative source in JSON has a registered adapter", () => {
    const stage = new Stage01Acquisition();
    const registry = getAuthoritativeSources();
    const adapters = stage.registry._adapters;

    for (const [key, src] of Object.entries(registry.sources)) {
      const hasAdapter =
        adapters.has(src.authoritative) || adapters.has(key);
      assert.ok(
        hasAdapter,
        `domain "${key}" authoritative="${src.authoritative}" — no adapter registered`
      );
    }
  });

  it("every complementary source in JSON either has a registered adapter or is documented as missing", () => {
    const stage = new Stage01Acquisition();
    const registry = getAuthoritativeSources();
    const adapters = stage.registry._adapters;

    for (const [key, src] of Object.entries(registry.sources)) {
      for (const compName of (src.complementary ?? [])) {
        assert.ok(
          adapters.has(compName),
          `domain "${key}" complementary="${compName}" listed in JSON but no adapter registered — either implement or remove from JSON`
        );
      }
    }
  });

  it("every registered adapter is reachable from JSON (no orphan adapters)", () => {
    const stage = new Stage01Acquisition();
    const registry = getAuthoritativeSources();
    const adapters = stage.registry._adapters;

    const reachable = new Set();
    for (const [key, src] of Object.entries(registry.sources)) {
      reachable.add(src.authoritative);
      reachable.add(key);
      for (const comp of (src.complementary ?? [])) reachable.add(comp);
    }

    for (const name of adapters.keys()) {
      assert.ok(
        reachable.has(name),
        `adapter "${name}" is registered but not referenced in authoritative-sources.json`
      );
    }
  });

  it("getAdapters returns one entry per authoritative domain plus one per reachable complementary", () => {
    const stage = new Stage01Acquisition();
    const registry = getAuthoritativeSources();
    const adapters = stage.registry._adapters;

    let expected = 0;
    for (const [key, src] of Object.entries(registry.sources)) {
      const hasAuth = adapters.has(src.authoritative) || adapters.has(key);
      if (hasAuth) expected++;
      for (const comp of (src.complementary ?? [])) {
        if (adapters.has(comp)) expected++;
      }
    }

    const entries = stage.registry.getAdapters();
    assert.equal(
      entries.length,
      expected,
      `Expected ${expected} adapter entries, got ${entries.length}`
    );
  });
});
