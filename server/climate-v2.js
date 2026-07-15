import { PipelineEngine } from "../pipeline/orchestration/engine.js";
import { createClimateRouter } from "../server-new/routes/climate-v2.js";
import { Stage01Acquisition } from "../pipeline/stages/01-acquisition/index.js";
import { Stage02Validation } from "../pipeline/stages/02-validation/index.js";
import { Stage03Normalization } from "../pipeline/stages/03-normalization/index.js";
import { Stage04Signals } from "../pipeline/stages/04-signals/index.js";
import { Stage05Phenomena } from "../pipeline/stages/05-phenomena/index.js";
import { Stage06Risk } from "../pipeline/stages/06-risk/index.js";
import { Stage07Presentation } from "../pipeline/stages/07-presentation/index.js";

const engine = new PipelineEngine({
  stages: [
    new Stage01Acquisition(),
    new Stage02Validation(),
    new Stage03Normalization(),
    new Stage04Signals(),
    new Stage05Phenomena(),
    new Stage06Risk(),
    new Stage07Presentation(),
  ],
});

export function mountV2(app) {
  app.use("/api/v2", createClimateRouter(engine));
  console.log("[v2] Pipeline routes mounted at /api/v2");
}
