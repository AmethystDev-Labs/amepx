import { t } from "elysia";
import { withDoc } from "@elysiajs/openapi";

export const oauthAuthorizeQuerySchema = withDoc(
    t.Object({
        response_type: t.String({ minLength: 1 }),
        client_id: t.String({ minLength: 1 }),
        redirect_uri: t.Optional(t.String({ minLength: 1 })),
        scope: t.Optional(t.String()),
        state: t.Optional(t.String()),
        group_id: t.Optional(t.String({ minLength: 1 })),
    }),
    {
        description:
            "OAuth2 authorize query parameters. response_type must be 'code'.",
    },
);

export const oauthAuthorizeErrorSchema = withDoc(
    t.Object({
        error: t.String(),
        error_description: t.Optional(t.String()),
    }),
    {
        description: "OAuth2 standard error response for authorization endpoint.",
    },
);
