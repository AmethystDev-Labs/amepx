import { t } from "elysia";
import { withDoc } from "@elysiajs/openapi";

export const adminTokenRevokeResponseSchema = withDoc(
    t.Object({
        ok: t.Boolean(),
        id: t.String(),
        revokedAt: t.Optional(t.String()),
    }),
    {
        description: "Token revoke response from admin API.",
    },
);
