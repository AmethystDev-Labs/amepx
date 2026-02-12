import { t } from "elysia";
import { withDoc } from "@elysiajs/openapi";

export const oauthTokenRequestObjectSchema = t.Object({
    grant_type: t.String({ minLength: 1 }),
    client_id: t.Optional(t.String({ minLength: 1 })),
    client_secret: t.Optional(t.String({ minLength: 1 })),
    code: t.Optional(t.String({ minLength: 1 })),
    redirect_uri: t.Optional(t.String({ minLength: 1 })),
    refresh_token: t.Optional(t.String({ minLength: 1 })),
    scope: t.Optional(t.String({ minLength: 1 })),
});

export const oauthTokenBodySchema = withDoc(
    t.Union([oauthTokenRequestObjectSchema, t.String()]),
    {
        description:
            "OAuth2 token request body. Supports application/json and x-www-form-urlencoded payloads.",
    },
);

export const oauthTokenSuccessSchema = withDoc(
    t.Object({
        token_type: t.Literal("Bearer"),
        access_token: t.String(),
        expires_in: t.Number(),
        refresh_token: t.String(),
        id_token: t.Optional(t.String()),
        scope: t.Optional(t.String()),
    }),
    {
        description: "OAuth2 token success response.",
    },
);

export const oauthTokenErrorSchema = withDoc(
    t.Object({
        error: t.String(),
        error_description: t.Optional(t.String()),
    }),
    {
        description: "OAuth2 token endpoint error response.",
    },
);
