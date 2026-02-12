import { t } from "elysia";
import { withDoc } from "@elysiajs/openapi";

export const userInfoHeadersSchema = withDoc(
    t.Object({
        authorization: t.String({ minLength: 1 }),
    }),
    {
        description: "Bearer token header. Example: Authorization: Bearer <access_token>",
    },
);

export const userInfoResponseSchema = withDoc(
    t.Object({
        sub: t.String(),
        name: t.Optional(t.String()),
        preferred_username: t.Optional(t.String()),
        picture: t.Optional(t.String()),
        email: t.Optional(t.String()),
        email_verified: t.Optional(t.Boolean()),
        client_id: t.String(),
        group_id: t.Optional(t.String()),
        nickname: t.Optional(t.String()),
        card: t.Optional(t.String()),
        avatar: t.Optional(t.String()),
        scope: t.Array(t.String()),
    }),
    {
        description: "User profile payload resolved from valid OAuth2 access token.",
    },
);

export const userInfoErrorSchema = withDoc(
    t.Object({
        error: t.String(),
        error_description: t.Optional(t.String()),
    }),
    {
        description: "Authentication error payload for user info endpoint.",
        headers: {
            "www-authenticate": t.String({ minLength: 1 }),
        },
    },
);
