import { describe, it } from "node:test";
import assert from "node:assert";
import { Stage07Presentation } from "../../../pipeline/stages/07-presentation/index.js";
import { PhenomenonNameEnum } from "../../../pipeline/shared/types.js";
import { getPhenomenonDefinitions } from "../../../pipeline/orchestration/config-loader.js";

describe("Stage07 - Presentation", () => {
  it("should produce executive view without technical details", async () => {
    const stage = new Stage07Presentation();
    const result = await stage.execute({
      location: { lat: -11.8996, lon: -76.67358, location_name: "Ricardo Palma" },
      sector: "retail",
      phenomena: [{ phenomenon_id: "id-1", name: "ola_de_calor", status: "active" }],
      assessments: [
        {
          phenomenon_id: "id-1",
          risk_level: "alto",
          risk_score_raw: 3.5,
          probability: { value: 3, source: "calculated" },
          impact: { value: 3, components: { exposure: 3, sensitivity: 3, adaptive_capacity: 3 } },
          adaptive_capacity: { score: 3, indicators_used: [] },
        },
      ],
      view: "executive",
    });
    assert.equal(result.view, "executive");
    assert.ok(result.response.executive_summary);
    assert.ok(result.response.recommendations.length > 0);
    assert.ok(result.response.overall_risk);
    assert.ok(!result.response.sources_used);
  });

  // H-7.5: catastrofico must not collapse onto the same color as alto — the
  // visual semaphore should distinguish a consequence-override (H-6.14) from
  // an ordinary high-risk reading, not just the textual label.
  it("gives catastrofico a distinct color from alto (H-7.5)", async () => {
    const stage = new Stage07Presentation();
    const altoResult = await stage.execute({
      location: { lat: -11.8996, lon: -76.67358 },
      sector: "retail",
      phenomena: [{ phenomenon_id: "p1", name: "ola_de_calor", status: "active" }],
      assessments: [{ phenomenon_id: "p1", risk_level: "alto", risk_score_raw: 5 }],
      view: "executive",
    });
    const catastroficoResult = await stage.execute({
      location: { lat: -11.8996, lon: -76.67358 },
      sector: "retail",
      phenomena: [{ phenomenon_id: "p1", name: "ola_de_calor", status: "active" }],
      assessments: [{ phenomenon_id: "p1", risk_level: "catastrofico", risk_score_raw: 20 }],
      view: "executive",
    });
    assert.notEqual(altoResult.response.overall_risk.color, catastroficoResult.response.overall_risk.color);
    assert.equal(catastroficoResult.response.overall_risk.color, "morado");
  });

  it("should extend executive with analyst details", async () => {
    const stage = new Stage07Presentation();
    const result = await stage.execute({
      location: { lat: -11.8996, lon: -76.67358 },
      sector: "retail",
      phenomena: [],
      assessments: [],
      view: "analyst",
    });
    assert.equal(result.view, "analyst");
    assert.ok(result.response.sources_used);
    assert.ok(result.response.risk_calculation);
  });

  // H-7.1/H-7.14: calculateOverallRisk() must keep max-risk as
  // overall_risk.level (worst-case conservador, COSO ERM §4.3), but expose
  // risk_composite/risk_count so a single dominant phenomenon can be told
  // apart from a generalized condition.
  describe("calculateOverallRisk (H-7.1/H-7.14)", () => {
    it("empty assessments default to bajo with zeroed composite/count", () => {
      const stage = new Stage07Presentation();
      const result = stage.calculateOverallRisk([]);
      assert.equal(result.level, "bajo");
      assert.equal(result.compositeScore, 0);
      assert.equal(result.compositeLevel, "bajo");
      assert.deepEqual(result.riskCount, { bajo: 0, medio: 0, alto: 0, catastrofico: 0 });
    });

    it("a single catastrophic phenomenon among many low ones still drives level, but composite dilutes it", () => {
      const stage = new Stage07Presentation();
      const assessments = [
        ...Array.from({ length: 9 }, (_, i) => ({
          phenomenon_id: `low-${i}`,
          risk_level: "bajo",
          risk_score_raw: 1,
        })),
        { phenomenon_id: "catastrophic-1", risk_level: "catastrofico", risk_score_raw: 20 },
      ];
      const result = stage.calculateOverallRisk(assessments);
      assert.equal(result.level, "catastrofico");
      assert.equal(result.riskCount.catastrofico, 1);
      assert.equal(result.riskCount.bajo, 9);
      // composite = (9*1 + 20) / 10 = 2.9 -> "medio" (low_max=2, medium_max=4),
      // strictly below the dominant "catastrofico" level -> proves the max
      // does not silently claim the whole portfolio is catastrophic.
      assert.equal(result.compositeScore, 2.9);
      assert.equal(result.compositeLevel, "medio");
    });

    it("distinguishes 1-of-5 'alto' from 5-of-5 'alto' even though level is identical (H-7.14)", () => {
      const stage = new Stage07Presentation();
      const oneHigh = stage.calculateOverallRisk([
        { phenomenon_id: "a", risk_level: "alto", risk_score_raw: 5 },
        ...Array.from({ length: 4 }, (_, i) => ({
          phenomenon_id: `low-${i}`,
          risk_level: "bajo",
          risk_score_raw: 1,
        })),
      ]);
      const fiveHigh = stage.calculateOverallRisk(
        Array.from({ length: 5 }, (_, i) => ({
          phenomenon_id: `high-${i}`,
          risk_level: "alto",
          risk_score_raw: 5,
        }))
      );
      assert.equal(oneHigh.level, "alto");
      assert.equal(fiveHigh.level, "alto");
      // Same level, but risk_composite and risk_count expose the difference
      // in concentration that max-risk alone collapses.
      assert.ok(oneHigh.compositeScore < fiveHigh.compositeScore);
      assert.equal(oneHigh.compositeLevel, "bajo");
      assert.equal(fiveHigh.compositeLevel, "alto");
      assert.equal(oneHigh.riskCount.alto, 1);
      assert.equal(fiveHigh.riskCount.alto, 5);
    });
  });

  // H-7.2: buildExecutiveSummary() must implement the contract's literal
  // template (phenomenon_name, status, confidence_note, evidence_summary
  // with trace_id, recommendation_intro), name the same "driver" phenomenon
  // that determines overall_risk.level, and validate sector instead of
  // interpolating "undefined".
  describe("buildExecutiveSummary (H-7.2)", () => {
    const baseInput = {
      location: { lat: -11.8996, lon: -76.67358, location_name: "Ricardo Palma" },
      phenomena: [
        { phenomenon_id: "id-low", name: "ola_de_frio", status: "active" },
        { phenomenon_id: "id-high", name: "inundacion", status: "projected" },
      ],
      assessments: [
        { phenomenon_id: "id-low", risk_level: "bajo", risk_score_raw: 1, probability: { value: 1 } },
        { phenomenon_id: "id-high", risk_level: "alto", risk_score_raw: 5, probability: { value: 4 } },
      ],
      view: "executive",
    };

    it("names the driver phenomenon (same one behind overall_risk.level), not an arbitrary one", async () => {
      const stage = new Stage07Presentation();
      const result = await stage.execute({ ...baseInput, sector: "retail" });
      assert.equal(result.response.overall_risk.level, "alto");
      // "inundacion" is the driver (risk_level=alto), not "ola_de_frio" (bajo).
      assert.match(result.response.executive_summary, /Inundación/);
      assert.match(result.response.executive_summary, /Proyectado/);
      assert.doesNotMatch(result.response.executive_summary, /Ola de frío/);
    });

    it("includes confidence_note, evidence with trace_id, and a recommendation_intro drawn from recommendations[0]", async () => {
      const stage = new Stage07Presentation();
      const result = await stage.execute({ ...baseInput, sector: "retail", execution_id: "trace-abc-123" });
      const summary = result.response.executive_summary;
      assert.ok(summary.includes(result.response.confidence_note));
      assert.match(summary, /trace_id=trace-abc-123/);
      assert.match(summary, /phenomenon_id=id-high/);
      assert.ok(summary.includes(result.response.recommendations[0]));
    });

    it("falls back to 'no especificado' instead of interpolating undefined sector", async () => {
      const stage = new Stage07Presentation();
      const result = await stage.execute({ ...baseInput, sector: undefined });
      assert.match(result.response.executive_summary, /sector no especificado/);
      assert.doesNotMatch(result.response.executive_summary, /sector undefined/);
    });

    it("handles empty assessments without crashing and without naming a phantom phenomenon", async () => {
      const stage = new Stage07Presentation();
      const result = await stage.execute({
        location: { lat: -11.8996, lon: -76.67358 },
        sector: "retail",
        phenomena: [],
        assessments: [],
        view: "executive",
      });
      assert.match(result.response.executive_summary, /ninguno identificado/);
    });
  });

  // H-7.3: buildRecommendations() must derive personalized, sourced text from
  // adaptation-measures.json (fenómeno×sector / tipo×sector) instead of the 2
  // static hardcoded strings, prioritize by risk_score_raw/signal_strength
  // (not just the discrete category), distinguish "no data" from "data but
  // all low", and fall back to a generic (non-sector-specific) measure when
  // the sector has no catalog coverage.
  describe("buildRecommendations (H-7.3)", () => {
    it("distinguishes null assessments from empty assessments from all-bajo assessments", () => {
      const stage = new Stage07Presentation();
      const noData = stage.buildRecommendations(null, [], "retail", []);
      const emptyData = stage.buildRecommendations([], [], "retail", []);
      const allLow = stage.buildRecommendations(
        [{ phenomenon_id: "p1", risk_level: "bajo", risk_score_raw: 1 }],
        [],
        "retail",
        [{ phenomenon_id: "p1", name: "sequia", status: "active" }]
      );
      assert.equal(noData.length, 1);
      assert.match(noData[0], /Sin datos suficientes/);
      assert.equal(emptyData.length, 1);
      assert.match(emptyData[0], /No se identificaron fenómenos climáticos evaluables/);
      assert.equal(allLow.length, 1);
      assert.match(allLow[0], /riesgo bajo/);
      // All 3 must be textually distinct — this is the point of H-7.3 #2.
      assert.notEqual(noData[0], emptyData[0]);
      assert.notEqual(emptyData[0], allLow[0]);
    });

    it("prioritizes by risk_score_raw, not just the discrete risk_level (H-7.3 #5)", () => {
      const stage = new Stage07Presentation();
      const recs = stage.buildRecommendations(
        [
          { phenomenon_id: "heat", risk_level: "alto", risk_score_raw: 4.5 },
          { phenomenon_id: "flood", risk_level: "medio", risk_score_raw: 6.0 },
        ],
        [],
        "retail",
        [
          { phenomenon_id: "heat", name: "ola_de_calor", status: "active" },
          { phenomenon_id: "flood", name: "inundacion", status: "projected" },
        ]
      );
      // "flood" (medio, score=6.0) outranks "heat" (alto, score=4.5) because
      // risk_score_raw already encodes probability×impact/CA — a coarser
      // bajo/medio/alto/catastrofico sort would have put heat first.
      assert.match(recs[0], /Inundación/);
      assert.match(recs[1], /Ola de calor/);
    });

    it("uses sector-specific catalog measures for retail/finance and tags generic fallback for uncovered sectors", () => {
      const stage = new Stage07Presentation();
      const phenomena = [{ phenomenon_id: "p1", name: "ola_de_calor", status: "active" }];
      const assessments = [{ phenomenon_id: "p1", risk_level: "alto", risk_score_raw: 5 }];

      const retailRecs = stage.buildRecommendations(assessments, [], "retail", phenomena);
      assert.match(retailRecs[0], /Techos fríos/);
      assert.doesNotMatch(retailRecs[0], /medida genérica/);

      const agricultureRecs = stage.buildRecommendations(assessments, [], "agriculture", phenomena);
      assert.match(agricultureRecs[0], /medida genérica — sin catálogo sectorial específico/);
    });

    it("caps and sorts transition recommendations by signal_strength, citing the catalog source", () => {
      const stage = new Stage07Presentation();
      const recs = stage.buildRecommendations(
        [],
        [
          { type: "regulatory", severity: "alta", signal_strength: 0.3 },
          { type: "market", severity: "alta", signal_strength: 0.9 },
          { type: "reputational", severity: "catastrofica", signal_strength: 0.6 },
        ],
        "retail",
        []
      );
      // recs[0] is the "no phenomena evaluable" fallback; transition recs follow.
      const transitionRecs = recs.filter(r => r.includes("transición"));
      assert.equal(transitionRecs.length, 2); // MAX_TRANSITION_RECOMMENDATIONS=2, caps out the 3rd
      assert.match(transitionRecs[0], /mercado/); // signal_strength=0.9, highest
      assert.match(transitionRecs[1], /reputacional/); // signal_strength=0.6, second
      assert.match(transitionRecs[0], /fuente: Anexo 10\.2/);
    });
  });

  // H-7.4: buildConfidenceNote() must use phenomenon.confidence.combined
  // (epistemic confidence — source_quality × signal_strength from Stage 05),
  // not assessment.probability.value (which can come from an external hazard
  // source, H-6.9, and has nothing to do with evaluation quality).
  describe("buildConfidenceNote (H-7.4)", () => {
    it("uses confidence.combined, not probability.value — a high-probability/low-confidence phenomenon reads as low confidence", () => {
      const stage = new Stage07Presentation();
      const note = stage.buildConfidenceNote(
        // probability.value=5 (max) would have driven the OLD implementation
        // to "Confianza alta". confidence.combined=0.1 (low epistemic
        // confidence) must drive the NEW implementation to "baja" instead.
        [{ phenomenon_id: "p1", risk_level: "alto", probability: { value: 5 } }],
        [{ phenomenon_id: "p1", name: "inundacion", confidence: { combined: 0.1 } }]
      );
      assert.match(note, /Confianza baja/);
    });

    it("classifies high confidence.combined as alta regardless of probability.value", () => {
      const stage = new Stage07Presentation();
      const note = stage.buildConfidenceNote(
        [{ phenomenon_id: "p1", risk_level: "bajo", probability: { value: 1 } }],
        [{ phenomenon_id: "p1", name: "sequia", confidence: { combined: 0.9 } }]
      );
      assert.match(note, /Confianza alta/);
    });

    it("excludes phenomena with missing/non-finite confidence.combined from the average instead of treating them as 0", () => {
      const stage = new Stage07Presentation();
      const note = stage.buildConfidenceNote(
        [
          { phenomenon_id: "p1", risk_level: "alto" },
          { phenomenon_id: "p2", risk_level: "alto" },
        ],
        [
          { phenomenon_id: "p1", name: "inundacion", confidence: { combined: 0.9 } },
          { phenomenon_id: "p2", name: "sequia" }, // no confidence field at all
        ]
      );
      // Average over the ONE valid combined=0.9 (ordinal 5) -> "alta", not
      // diluted by treating p2's missing value as 0.
      assert.match(note, /Confianza alta/);
    });

    it("returns a distinct 'no evaluable' message when no assessment has a matching confidence.combined", () => {
      const stage = new Stage07Presentation();
      const note = stage.buildConfidenceNote(
        [{ phenomenon_id: "p1", risk_level: "alto" }],
        [{ phenomenon_id: "p1", name: "inundacion" }] // no confidence field
      );
      assert.match(note, /no evaluable/);
    });
  });

  // H-7.6: formatPhenomenonName() must cover every value PhenomenonNameEnum
  // declares (pipeline/shared/types.js) — not just the 7 the old hardcoded
  // map happened to list — and capitalize its fallback for anything outside
  // the enum.
  describe("formatPhenomenonName (H-7.6)", () => {
    it("display_names in phenomenon-definitions.json covers every PhenomenonNameEnum value exactly (config completeness)", () => {
      const displayNames = getPhenomenonDefinitions().display_names;
      const configuredNames = Object.keys(displayNames).filter(k => !k.startsWith("_"));
      for (const name of PhenomenonNameEnum.options) {
        assert.ok(configuredNames.includes(name), `PhenomenonNameEnum has '${name}' but display_names does not — this is exactly the gap H-7.6 closed (deslizamiento/huayco were missing from the old hardcoded map)`);
      }
      assert.equal(configuredNames.length, PhenomenonNameEnum.options.length, "display_names has entries not in PhenomenonNameEnum, or vice versa");
    });

    it("formatPhenomenonName resolves every enum value to a non-empty sourced name", () => {
      const stage = new Stage07Presentation();
      for (const name of PhenomenonNameEnum.options) {
        const formatted = stage.formatPhenomenonName(name);
        assert.ok(formatted && formatted.length > 0, `no display name for '${name}'`);
      }
    });

    it("uses the sourced 'Huaico' spelling (INDECI/SENAMHI), not the internal 'huayco' identifier reformatted", () => {
      const stage = new Stage07Presentation();
      assert.equal(stage.formatPhenomenonName("huayco"), "Huaico");
    });

    it("covers deslizamiento, missing entirely from the old hardcoded map", () => {
      const stage = new Stage07Presentation();
      assert.equal(stage.formatPhenomenonName("deslizamiento"), "Deslizamiento");
    });

    it("capitalizes the fallback for names outside the enum, instead of returning lowercase", () => {
      const stage = new Stage07Presentation();
      assert.equal(stage.formatPhenomenonName("tormenta_electrica"), "Tormenta Electrica");
    });
  });

  // H-7.7: getRiskContribution() must attach score_scale (range + formula) to
  // every score instead of returning a bare number, and must use score=null
  // (not the formula-impossible 0) when no assessment matches the phenomenon.
  describe("getRiskContribution (H-7.7)", () => {
    it("attaches score_scale with the real (P×I)/CA range to a found assessment, rounded to 2 decimals", () => {
      const stage = new Stage07Presentation();
      const contribution = stage.getRiskContribution(
        { phenomenon_id: "p1", name: "sequia" },
        [{ phenomenon_id: "p1", risk_level: "medio", risk_score_raw: 3.456789 }]
      );
      assert.equal(contribution.level, "medio");
      assert.equal(contribution.score, 3.46);
      assert.equal(contribution.score_scale.min, 0.2);
      assert.equal(contribution.score_scale.max, 37.5); // 25 * catastrophic_multiplier (1.5)
      assert.match(contribution.score_scale.formula, /Probabilidad.*Impacto.*Capacidad Adaptativa/);
    });

    it("returns score=null (not the formula-impossible 0) when no assessment matches the phenomenon", () => {
      const stage = new Stage07Presentation();
      const contribution = stage.getRiskContribution({ phenomenon_id: "missing", name: "sequia" }, []);
      assert.equal(contribution.level, "bajo");
      assert.equal(contribution.score, null);
      // score_scale is still attached even without a matching assessment —
      // it describes the scale itself, not a specific measurement.
      assert.equal(contribution.score_scale.min, 0.2);
    });
  });

  // H-7.8: sources_out_of_coverage and signal_detail must be populated from
  // data that already flows through the orchestrator's flattened
  // pipelineState (input.sources_consulted from Stage 1, input.signals from
  // Stage 4), not left as permanent empty arrays.
  describe("analyst view: sources_out_of_coverage / signal_detail (H-7.8)", () => {
    it("getSourcesOutOfCoverage() is the exact complement of getSourcesUsed() over sources_consulted", () => {
      const stage = new Stage07Presentation();
      const input = {
        sources_consulted: [
          { source_name: "weatherapi", source_domain: "observation_meteo", coverage_status: "available" },
          { source_name: "supabase_climate_cells", source_domain: "precomputed_grid", coverage_status: "out_of_coverage", spatial_distance_km: null },
          { source_name: "gri_oxford", source_domain: "hazard_risk_gri", coverage_status: "failed", error: "HTTP 503" },
        ],
      };
      const used = stage.getSourcesUsed(input);
      const outOfCoverage = stage.getSourcesOutOfCoverage(input);
      assert.equal(used.length, 1);
      assert.equal(used[0].name, "weatherapi");
      assert.equal(outOfCoverage.length, 2);
      const byName = Object.fromEntries(outOfCoverage.map(s => [s.name, s]));
      assert.equal(byName.gri_oxford.reason, "HTTP 503");
      assert.match(byName.supabase_climate_cells.reason, /Sin datos disponibles/);
    });

    it("getSignalDetail() reads source_quality/signal_strength from input.signals and cross-references contributing_to", () => {
      const stage = new Stage07Presentation();
      const input = {
        signals: [
          {
            signal_id: "sig-1",
            name: "temperatura_actual_anomaly",
            type: "anomaly",
            source_quality: { score: 0.8 },
            signal_strength: { score: 0.65 },
          },
        ],
      };
      const phenomena = [
        { phenomenon_id: "p1", name: "ola_de_calor", contributing_signals: ["sig-1"] },
      ];
      const detail = stage.getSignalDetail(input, phenomena);
      assert.equal(detail.length, 1);
      assert.equal(detail[0].source_quality, 0.8);
      assert.equal(detail[0].signal_strength, 0.65);
      assert.deepEqual(detail[0].contributing_to, ["ola_de_calor"]);
    });

    it("execute() with view='analyst' populates both fields end-to-end instead of leaving them permanently []", async () => {
      const stage = new Stage07Presentation();
      const result = await stage.execute({
        location: { lat: -11.8996, lon: -76.67358 },
        sector: "retail",
        phenomena: [{ phenomenon_id: "p1", name: "sequia", status: "active", contributing_signals: ["sig-1"] }],
        assessments: [{ phenomenon_id: "p1", risk_level: "medio", risk_score_raw: 3 }],
        sources_consulted: [
          { source_name: "weatherapi", source_domain: "observation_meteo", coverage_status: "available" },
          { source_name: "world_bank", source_domain: "socioeconomic", coverage_status: "out_of_coverage" },
        ],
        signals: [
          { signal_id: "sig-1", name: "precipitacion_projection", type: "projected", source_quality: { score: 0.7 }, signal_strength: { score: 0.5 } },
        ],
        view: "analyst",
      });
      assert.equal(result.response.sources_out_of_coverage.length, 1);
      assert.equal(result.response.sources_out_of_coverage[0].name, "world_bank");
      assert.equal(result.response.signal_detail.length, 1);
      assert.deepEqual(result.response.signal_detail[0].contributing_to, ["sequia"]);
    });
  });

  // H-7.9: execute() must convert malformed/incomplete input into a typed
  // PresentationError (with .code/.detail) instead of letting a raw
  // TypeError propagate, while NOT hard-failing on fields that already have
  // a tested graceful degradation (sector, assessments, phenomena).
  describe("input validation (H-7.9)", () => {
    it("throws PresentationError (not a raw TypeError) when location is missing", async () => {
      const stage = new Stage07Presentation();
      await assert.rejects(
        () => stage.execute({ sector: "retail", assessments: [], phenomena: [], view: "executive" }),
        err => {
          assert.equal(err.name, "PresentationError");
          assert.equal(err.code, "INVALID_INPUT");
          assert.equal(err.stage, "presentation");
          return true;
        }
      );
    });

    it("throws PresentationError when location is outside Peru (same LocationSchema the pipeline entry point uses)", async () => {
      const stage = new Stage07Presentation();
      await assert.rejects(
        () => stage.execute({ location: { lat: 40.7, lon: -74.0 }, sector: "retail", assessments: [], phenomena: [], view: "executive" }),
        { name: "PresentationError", code: "INVALID_INPUT" }
      );
    });

    it("does NOT throw when sector/assessments/phenomena are missing — degrades gracefully instead (H-7.2/H-7.3 behavior preserved)", async () => {
      const stage = new Stage07Presentation();
      const result = await stage.execute({ location: { lat: -11.8996, lon: -76.67358 }, view: "executive" });
      assert.equal(result.view, "executive");
      assert.match(result.response.executive_summary, /no especificado/);
      assert.match(result.response.recommendations[0], /No se identificaron fenómenos/);
    });

    it("accepts extra pipelineState fields (canonical_variables, etc.) without rejecting the call", async () => {
      const stage = new Stage07Presentation();
      const result = await stage.execute({
        location: { lat: -11.8996, lon: -76.67358 },
        sector: "retail",
        assessments: [],
        phenomena: [],
        canonical_variables: [{ name: "poverty_rate", value: 0.2 }],
        source_decisions: { foo: "bar" },
        view: "executive",
      });
      assert.equal(result.view, "executive");
    });
  });

  // H-7.10: getSourcesUsed()/getSourcesOutOfCoverage() must (a) enrich each
  // source with the real fields RawSourceResponseSchema provides
  // (authority_level, spatial_distance_km, resolution_native, duration_ms),
  // via one shared mapper so the two never diverge, and (b) together cover
  // every entry in sources_consulted — nothing hidden.
  describe("getSourcesUsed / mapSourceSummary (H-7.10)", () => {
    const source = {
      source_name: "weatherapi",
      source_domain: "observation_meteo",
      coverage_status: "available",
      authority_level: "primary",
      spatial_distance_km: 12.5,
      resolution_native: "point",
      duration_ms: 340,
    };

    it("enriches sources_used with authority_level/spatial_distance_km/resolution_native/duration_ms", () => {
      const stage = new Stage07Presentation();
      const [used] = stage.getSourcesUsed({ sources_consulted: [source] });
      assert.equal(used.authority_level, "primary");
      assert.equal(used.spatial_distance_km, 12.5);
      assert.equal(used.resolution_native, "point");
      assert.equal(used.duration_ms, 340);
    });

    it("getSourcesUsed and getSourcesOutOfCoverage share the same base shape via mapSourceSummary", () => {
      const stage = new Stage07Presentation();
      const outOfCoverage = { ...source, coverage_status: "failed", error: "timeout" };
      const [used] = stage.getSourcesUsed({ sources_consulted: [source] });
      const [failed] = stage.getSourcesOutOfCoverage({ sources_consulted: [outOfCoverage] });
      for (const field of ["name", "domain", "authority_level", "spatial_distance_km", "resolution_native", "duration_ms"]) {
        assert.ok(field in used, `sources_used missing '${field}'`);
        assert.ok(field in failed, `sources_out_of_coverage missing '${field}'`);
      }
    });

    it("sources_used ∪ sources_out_of_coverage covers every entry in sources_consulted (nothing hidden)", () => {
      const stage = new Stage07Presentation();
      const input = {
        sources_consulted: [
          { ...source, source_name: "a", coverage_status: "available" },
          { ...source, source_name: "b", coverage_status: "out_of_coverage" },
          { ...source, source_name: "c", coverage_status: "failed", error: "500" },
        ],
      };
      const usedNames = stage.getSourcesUsed(input).map(s => s.name);
      const outNames = stage.getSourcesOutOfCoverage(input).map(s => s.name);
      assert.deepEqual([...usedNames, ...outNames].sort(), ["a", "b", "c"]);
    });
  });

  // H-7.11: rulesApplied must be programmatically true, not just declared.
  // Each test here corresponds 1:1 to one of the 4 base rules in the
  // constructor — if any of these ever fails, the corresponding rulesApplied
  // string is lying about the implementation, exactly the problem H-7.11
  // flagged.
  describe("rulesApplied compliance (H-7.11)", () => {
    const fullInput = {
      location: { lat: -11.8996, lon: -76.67358, location_name: "Ricardo Palma" },
      sector: "retail",
      phenomena: [{ phenomenon_id: "p1", name: "inundacion", status: "active", contributing_signals: [] }],
      assessments: [
        {
          phenomenon_id: "p1",
          risk_level: "alto",
          risk_score_raw: 5,
          probability: { value: 4 },
        },
      ],
      execution_id: "trace-rules-1",
      view: "analyst",
      sources_consulted: [
        { source_name: "weatherapi", source_domain: "observation_meteo", coverage_status: "available", response: { raw: "should never leak" } },
      ],
      signals: [
        { signal_id: "sig-1", name: "precipitacion_projection", type: "projected", source_quality: { score: 0.7 }, signal_strength: { score: 0.6 } },
      ],
    };

    it("rule 1: every numeric value in the response is paired with its semantic category", async () => {
      const stage = new Stage07Presentation();
      const { response } = await stage.execute(fullInput);
      // overall_risk: numeric risk_composite.score always ships with level/label.
      assert.ok(response.overall_risk.level);
      assert.ok(response.overall_risk.risk_composite.level);
      assert.equal(typeof response.overall_risk.risk_composite.score, "number");
      // phenomena[].risk_contribution: score never appears without level/score_scale.
      const [contribution] = response.phenomena.map(p => p.risk_contribution);
      assert.ok(contribution.level);
      assert.ok(contribution.score_scale);
    });

    it("rule 2: executive_summary always links trace_id (+ phenomenon_id when a driver exists)", async () => {
      const stage = new Stage07Presentation();
      const { response } = await stage.execute(fullInput);
      assert.match(response.executive_summary, /trace_id=trace-rules-1/);
      assert.match(response.executive_summary, /phenomenon_id=p1/);
    });

    it("rule 3: analyst view projects fields, never leaks source.response (raw external API JSON)", async () => {
      const stage = new Stage07Presentation();
      const { response } = await stage.execute(fullInput);
      const serialized = JSON.stringify(response);
      assert.doesNotMatch(serialized, /should never leak/);
    });

    it("rule 4: buildExecutiveSummary is deterministic (same input -> same output, no AI-style variability)", async () => {
      const stage = new Stage07Presentation();
      const first = (await stage.execute(fullInput)).response.executive_summary;
      const second = (await stage.execute(fullInput)).response.executive_summary;
      assert.equal(first, second);
    });
  });

  // H-7.12: execute() must return a Promise, consistent with
  // StageInterface.execute() being declared async — same check H-6.17
  // already added for Stage 6.
  it("execute() returns a Promise, consistent with StageInterface.execute() being async (H-7.12)", async () => {
    const stage = new Stage07Presentation();
    const returned = stage.execute({ location: { lat: -11.8996, lon: -76.67358 }, sector: "retail", assessments: [], phenomena: [], view: "executive" });
    assert.ok(returned instanceof Promise, "execute() should return a Promise");
    await returned;
  });

  // H-7.13: execute()'s return value and StageInterface.wrapArtifact()'s
  // envelope are 2 distinct, deliberately separate shapes — execute() never
  // includes stage/status/evidence_artifact itself; wrapArtifact() is what
  // adds the generic stage_id/stage_name/status envelope, uniformly for all
  // 7 stages, at the orchestration layer (pipeline/orchestration/engine.js).
  describe("execute() return shape (H-7.13)", () => {
    const minimalInput = { location: { lat: -11.8996, lon: -76.67358 }, sector: "retail", assessments: [], phenomena: [], view: "executive" };

    it("execute() returns exactly {view, response} — no stage/status/evidence_artifact", async () => {
      const stage = new Stage07Presentation();
      const result = await stage.execute(minimalInput);
      assert.deepEqual(Object.keys(result).sort(), ["response", "view"]);
    });

    it("wrapArtifact() — not execute() — is what adds stage_id/stage_name/status, uniformly with the other 6 stages", async () => {
      const stage = new Stage07Presentation();
      const startTime = Date.now();
      const result = await stage.execute(minimalInput);
      const artifact = stage.wrapArtifact(minimalInput, result, "success", null, startTime);
      assert.equal(artifact.stage_id, 7);
      assert.equal(artifact.stage_name, "Presentation");
      assert.equal(artifact.status, "success");
      assert.deepEqual(artifact.output, result);
    });
  });
});
