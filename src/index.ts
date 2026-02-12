import express from "express";
import { Elysia } from "elysia";
import { validateEnv } from "./utils/check_env.js";
import { router } from "./router/router.js";
import { adminPanelRouter } from "./router/admin/panel.js";
import { wellKnownRouter } from "./router/well-known.js";
import { Logger, type LoggerType } from "./utils/logger.js";
import { init } from "./server.js";
import { openapi, fromTypes } from "@elysiajs/openapi";
import "./utils/env.js";

const app: express.Express = express();
const elysia = new Elysia();

const logger = new Logger("app") as LoggerType;
logger.info("Hello from Ampex!")

elysia
  .use(adminPanelRouter)
  .use(wellKnownRouter)
  .use(router)
  .use(openapi({
    references: fromTypes() 
  }))

logger.info("Validating environment variables...")
validateEnv(process.env)

init(app, elysia, process.argv[1] === new URL(import.meta.url).pathname)

export default app;
