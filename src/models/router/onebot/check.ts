import { t } from "elysia";
import { withDoc } from "@elysiajs/openapi";

export const onebotCheckBodySchema = withDoc(
    t.Object({
        request_id: t.String({ minLength: 1 }),
    }),
    {
        description: "Check OneBot group history by request_id and try to approve authorization code.",
    },
);

export const onebotCheckResponseSchema = withDoc(
    t.Object({
        ok: t.Boolean(),
        done: t.Boolean(),
        request_id: t.String(),
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        user_id: t.Optional(t.String()),
        nickname: t.Optional(t.String()),
        card: t.Optional(t.String()),
        redirect_to: t.Optional(t.String()),
        message: t.Optional(t.String()),
        error: t.Optional(t.String()),
        error_description: t.Optional(t.String()),
    }),
    {
        description: "OneBot check result. done=true means authorization is approved or already approved.",
    },
);
