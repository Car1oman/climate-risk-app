import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { PipelineEngine } from "../pipeline/orchestration/engine.js";
import { createClimateRouter } from "./routes/climate-v2.js";
import { traceLogger } from "./middleware/trace-logger.js";
import { Stage01Acquisition } from "../pipeline/stages/01-acquisition/index.js";
import { Stage02Validation } from "../pipeline/stages/02-validation/index.js";
import { Stage03Normalization } from "../pipeline/stages/03-normalization/index.js";
import { Stage04Signals } from "../pipeline/stages/04-signals/index.js";
import { Stage05Phenomena } from "../pipeline/stages/05-phenomena/index.js";
import { Stage06Risk } from "../pipeline/stages/06-risk/index.js";
import { Stage07Presentation } from "../pipeline/stages/07-presentation/index.js";

const app = express();
const PORT = process.env.CLIMATE_V2_PORT || process.env.PORT || 4001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(traceLogger);

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

app.use("/api/v2", createClimateRouter(engine));

app.use((err, req, res, next) => {
  console.error("[server-v2] Unhandled:", err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
});

app.listen(PORT, () => {
  console.log(`[server-v2] Climate Risk API v2 running on port ${PORT}`);
  console.log(`[server-v2] Stages registered: ${engine.stages.size}`);
});

export default app;
