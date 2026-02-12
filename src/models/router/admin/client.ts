import { t } from "elysia";
import { withDoc } from "@elysiajs/openapi";

export const adminClientCreateSchema = withDoc(
    t.Object({
        clientId: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        clientSecret: t.Optional(t.String()),
        picture: t.Optional(t.String()),
        description: t.Optional(t.String()),
        redirectUris: t.Union([t.Array(t.String()), t.String()]),
        scopes: t.Optional(t.Union([t.Array(t.String()), t.String()])),
        groupId: t.Optional(t.String()),
        active: t.Optional(t.Boolean()),
    }),
    {
        description: "Admin API payload to create OAuth client.",
    },
);

export const adminClientPatchSchema = withDoc(
    t.Object({
        name: t.Optional(t.String()),
        clientSecret: t.Optional(t.String()),
        picture: t.Optional(t.String()),
        description: t.Optional(t.String()),
        redirectUris: t.Optional(t.Union([t.Array(t.String()), t.String()])),
        scopes: t.Optional(t.Union([t.Array(t.String()), t.String()])),
        groupId: t.Optional(t.String()),
        active: t.Optional(t.Boolean()),
    }),
    {
        description: "Admin API payload to update OAuth client.",
    },
);

export const adminCommonErrorSchema = withDoc(
    t.Object({
        error: t.String(),
        error_description: t.Optional(t.String()),
    }),
    {
        description: "Common admin API error payload.",
    },
);
