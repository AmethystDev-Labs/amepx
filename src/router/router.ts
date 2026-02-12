import { Elysia } from "elysia";
import { oauthAuthorizeRouter } from "./oauth/authorize.js";
import { oauthTokenRouter } from "./oauth/token.js";
import { userInfoRouter } from "./user/info.js";
import { onebotCheckRouter } from "./onebot/check.js";
import { adminApiRouter } from "./admin/api.js";

export const router = new Elysia({ prefix: "/api" })
    .get("/health", () => ({
        status: "ok",
    }))
    .use(adminApiRouter)
    .use(oauthAuthorizeRouter)
    .use(oauthTokenRouter)
    .use(userInfoRouter)
    .use(onebotCheckRouter);
