import { StageInterface } from "../../shared/stage-interface.js";
import { SourceRegistry } from "./registry.js";
import { weatherapiAdapter } from "./adapters/weatherapi.js";
import { nasaPowerAdapter } from "./adapters/nasa-power.js";
import { openmeteoAdapter } from "./adapters/openmeteo.js";
import { opentopodataAdapter } from "./adapters/opentopodata.js";

import { worldbankAdapter } from "./adapters/worldbank.js";

import { noaaOniAdapter } from "./adapters/noaa-oni.js";
import { supabaseAdapter } from "./adapters/supabase.js";
import { openElevationAdapter } from "./adapters/open-elevation.js";
import { noaaEnsoAdapter } from "./adapters/noaa-enso.js";
import { griOxfordAdapter } from "./adapters/gri-oxford.js";

export class Stage01Acquisition extends StageInterface {
  constructor() {
    super(1, "Acquisition");
    this.registry = new SourceRegistry();
    this.registry.registerAdapter("weatherapi", weatherapiAdapter);
    this.registry.registerAdapter("nasa_power", nasaPowerAdapter);
    this.registry.registerAdapter("openmeteo_cmip6", openmeteoAdapter);
    this.registry.registerAdapter("opentopodata_srtm30m", opentopodataAdapter);
    this.registry.registerAdapter("world_bank", worldbankAdapter);

    this.registry.registerAdapter("noaa_cpc_oni", noaaOniAdapter);
    this.registry.registerAdapter("supabase_climate_cells", supabaseAdapter);
    this.registry.registerAdapter("open_elevation", openElevationAdapter);
    this.registry.registerAdapter("noaa_enso_discussion", noaaEnsoAdapter);
    this.registry.registerAdapter("gri_oxford", griOxfordAdapter);
    this.rulesApplied = [
      "Cada fuente se consulta con timeout individual (default 30s)",
      "Si una fuente falla, se registra el error y se continúa",
      "La respuesta cruda se conserva COMPLETA en raw_response",
      "No hay transformación de datos en esta etapa — solo adquisición",
      "Si location.elevation no fue provisto por el caller, se enriquece desde la fuente de elevación disponible (opentopodata / open-elevation)",
    ];
  }

  async execute(input) {
    const { location } = input;
    const results = await this.registry.executeAll(location);

    if (location.elevation == null) {
      const elevationCandidates = results.filter(
        r => r.source_domain === "elevation" && r.coverage_status === "available"
      );
      // Preferir explícitamente la fuente autoritativa (authority_level="primary")
      // sobre la complementaria, sin depender del orden en que getAdapters() las listó.
      const elevationResult =
        elevationCandidates.find(r => r.authority_level === "primary") ??
        elevationCandidates[0];
      if (elevationResult) {
        const elev = elevationResult.response?.results?.[0]?.elevation;
        if (elev != null) {
          location.elevation = elev;
        } else {
          console.warn(
            `[Stage01Acquisition] source="${elevationResult.source_name}" coverage_status="available" but no parseable elevation at response.results[0].elevation`
          );
        }
      }
    }

    const successful = results.filter(r =>
      r.coverage_status === "available" || r.coverage_status === "out_of_coverage"
    );
    const failed = results.filter(r => r.coverage_status === "failed");
    const outOfCoverage = results.filter(r => r.coverage_status === "out_of_coverage");
    return {
      sources_consulted: results,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        out_of_coverage: outOfCoverage.length,
        // Suma de duración individual de cada fuente (compute work total).
        // No es el tiempo transcurrido real del stage — los adapters corren en
        // paralelo vía Promise.allSettled. El tiempo real de wall-clock está en
        // el duration_ms del artifact (wrapArtifact(), stage-interface.js).
        sum_of_durations_ms: results.reduce((sum, r) => sum + r.duration_ms, 0),
      },
    };
  }
}
