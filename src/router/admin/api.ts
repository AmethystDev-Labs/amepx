import { Elysia } from "elysia";
import { createHash, timingSafeEqual } from "node:crypto";
import { ensureMongoConnected } from "../../models/db/connection.js";
import { OAuthClientModel } from "../../models/db/client.js";
import { OAuthAuthorizationRequestModel } from "../../models/db/auth_request.js";
import { OAuthTokenModel } from "../../models/db/token.js";
import {
    adminClientCreateSchema,
    adminClientPatchSchema,
    adminCommonErrorSchema,
} from "../../models/router/admin/client.js";
import { adminTokenRevokeResponseSchema } from "../../models/router/admin/token.js";

function toStringArray(raw: unknown): string[] {
    if (Array.isArray(raw)) {
        return raw
            .map((item) => String(item).trim())
            .filter(Boolean);
    }

    if (typeof raw === "string") {
        return raw
            .split(/[\n,\s]+/)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
}

function hashClientSecret(secret: string): string {
    const hashed = createHash("sha256").update(secret).digest("hex");
    return `sha256:${hashed}`;
}

function safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
        return false;
    }
    return timingSafeEqual(aBuf, bBuf);
}

function isAdminAuthorized(headers: Record<string, unknown>, set: any): boolean {
    const adminKey = (process.env.ADMIN_KEY ?? "").trim();
    if (!adminKey) {
        set.status = 503;
        return false;
    }

    const provided = typeof headers["x-admin-key"] === "string" ? headers["x-admin-key"].trim() : "";
    if (!provided || !safeEqual(provided, adminKey)) {
        set.status = 401;
        return false;
    }

    return true;
}

function makeError(error: string, errorDescription: string) {
    return {
        error,
        error_description: errorDescription,
    };
}

function mapClient(client: any) {
    return {
        clientId: client.clientId,
        name: client.name,
        picture: client.picture,
        description: client.description,
        redirectUris: client.redirectUris,
        scopes: client.scopes,
        groupId: client.groupId,
        active: client.active,
        hasSecret: Boolean(client.clientSecretHash),
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
    };
}

export const adminApiRouter = new Elysia({ prefix: "/admin" })
    .get(
        "/clients",
        async ({ headers, query, set }) => {
        if (!isAdminAuthorized(headers as any, set)) {
            return makeError(
                set.status === 503 ? "admin_disabled" : "unauthorized",
                set.status === 503
                    ? "ADMIN_KEY is not configured"
                    : "x-admin-key is missing or invalid",
            );
        }

        await ensureMongoConnected();

        const input = query as { include_inactive?: string };
        const includeInactive = input.include_inactive === "1" || input.include_inactive === "true";
        const filter = includeInactive ? {} : { active: true };

        const clients = await OAuthClientModel.find(filter).sort({ createdAt: -1 }).lean();
        return {
            items: clients.map(mapClient),
            total: clients.length,
        };
    },
    {
        response: {
            401: adminCommonErrorSchema,
            503: adminCommonErrorSchema,
        },
    },
    )
    .post(
        "/clients",
        async ({ headers, body, set }) => {
        if (!isAdminAuthorized(headers as any, set)) {
            return makeError(
                set.status === 503 ? "admin_disabled" : "unauthorized",
                set.status === 503
                    ? "ADMIN_KEY is not configured"
                    : "x-admin-key is missing or invalid",
            );
        }

        const input = body as {
            clientId?: string;
            clientSecret?: string;
            name?: string;
            picture?: string;
            description?: string;
            redirectUris?: string[] | string;
            scopes?: string[] | string;
            groupId?: string;
            active?: boolean;
        };

        const clientId = input.clientId?.trim();
        const name = input.name?.trim();
        const redirectUris = toStringArray(input.redirectUris);
        const scopes = toStringArray(input.scopes);

        if (!clientId || !name || redirectUris.length === 0) {
            set.status = 400;
            return makeError(
                "invalid_request",
                "clientId, name, redirectUris are required",
            );
        }

        await ensureMongoConnected();

        const exists = await OAuthClientModel.exists({ clientId });
        if (exists) {
            set.status = 409;
            return makeError("conflict", "clientId already exists");
        }

        const created = await OAuthClientModel.create({
            clientId,
            clientSecretHash: input.clientSecret?.trim()
                ? hashClientSecret(input.clientSecret.trim())
                : undefined,
            name,
            picture: input.picture?.trim() || undefined,
            description: input.description?.trim() || undefined,
            redirectUris,
            scopes,
            groupId: input.groupId?.trim() || undefined,
            active: typeof input.active === "boolean" ? input.active : true,
        });

        return {
            ok: true,
            item: mapClient(created.toObject()),
        };
    },
    {
        body: adminClientCreateSchema,
        response: {
            400: adminCommonErrorSchema,
            401: adminCommonErrorSchema,
            409: adminCommonErrorSchema,
            503: adminCommonErrorSchema,
        },
    },
    )
    .patch(
        "/clients/:clientId",
        async ({ headers, params, body, set }) => {
        if (!isAdminAuthorized(headers as any, set)) {
            return makeError(
                set.status === 503 ? "admin_disabled" : "unauthorized",
                set.status === 503
                    ? "ADMIN_KEY is not configured"
                    : "x-admin-key is missing or invalid",
            );
        }

        const p = params as { clientId: string };
        const input = body as {
            name?: string;
            clientSecret?: string;
            picture?: string;
            description?: string;
            redirectUris?: string[] | string;
            scopes?: string[] | string;
            groupId?: string;
            active?: boolean;
        };

        await ensureMongoConnected();

        const updates: Record<string, unknown> = {};
        if (typeof input.name === "string") updates.name = input.name.trim();
        if (typeof input.picture === "string") updates.picture = input.picture.trim() || undefined;
        if (typeof input.description === "string") updates.description = input.description.trim() || undefined;
        if (typeof input.groupId === "string") updates.groupId = input.groupId.trim() || undefined;
        if (typeof input.active === "boolean") updates.active = input.active;

        if (input.redirectUris !== undefined) {
            updates.redirectUris = toStringArray(input.redirectUris);
        }

        if (input.scopes !== undefined) {
            updates.scopes = toStringArray(input.scopes);
        }

        if (typeof input.clientSecret === "string") {
            const secret = input.clientSecret.trim();
            updates.clientSecretHash = secret ? hashClientSecret(secret) : undefined;
        }

        const updated = await OAuthClientModel.findOneAndUpdate(
            { clientId: p.clientId },
            { $set: updates },
            { new: true },
        ).lean();

        if (!updated) {
            set.status = 404;
            return makeError("not_found", "client not found");
        }

        return {
            ok: true,
            item: mapClient(updated),
        };
    },
    {
        body: adminClientPatchSchema,
        response: {
            401: adminCommonErrorSchema,
            404: adminCommonErrorSchema,
            503: adminCommonErrorSchema,
        },
    },
    )
    .delete(
        "/clients/:clientId",
        async ({ headers, params, set }) => {
        if (!isAdminAuthorized(headers as any, set)) {
            return makeError(
                set.status === 503 ? "admin_disabled" : "unauthorized",
                set.status === 503
                    ? "ADMIN_KEY is not configured"
                    : "x-admin-key is missing or invalid",
            );
        }

        const p = params as { clientId: string };
        await ensureMongoConnected();

        const deleted = await OAuthClientModel.findOneAndDelete({ clientId: p.clientId }).lean();
        if (!deleted) {
            set.status = 404;
            return makeError("not_found", "client not found");
        }

        return {
            ok: true,
            clientId: p.clientId,
        };
    },
    {
        response: {
            401: adminCommonErrorSchema,
            404: adminCommonErrorSchema,
            503: adminCommonErrorSchema,
        },
    },
    )
    .get(
        "/requests",
        async ({ headers, query, set }) => {
        if (!isAdminAuthorized(headers as any, set)) {
            return makeError(
                set.status === 503 ? "admin_disabled" : "unauthorized",
                set.status === 503
                    ? "ADMIN_KEY is not configured"
                    : "x-admin-key is missing or invalid",
            );
        }

        await ensureMongoConnected();

        const input = query as { limit?: string; status?: string; client_id?: string };
        const limit = Math.min(Math.max(Number(input.limit || 30) || 30, 1), 200);

        const filter: Record<string, unknown> = {};
        if (input.status) filter.status = input.status;
        if (input.client_id) filter.clientId = input.client_id;

        const items = await OAuthAuthorizationRequestModel.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return {
            items: items.map((item) => ({
                requestId: item.requestId,
                clientId: item.clientId,
                status: item.status,
                code: item.code,
                groupId: item.groupId,
                user: item.user,
                createdAt: item.createdAt,
                approvedAt: item.approvedAt,
                consumedAt: item.consumedAt,
                codeExpiresAt: item.codeExpiresAt,
            })),
            total: items.length,
        };
    },
    {
        response: {
            401: adminCommonErrorSchema,
            503: adminCommonErrorSchema,
        },
    },
    )
    .get(
        "/tokens",
        async ({ headers, query, set }) => {
        if (!isAdminAuthorized(headers as any, set)) {
            return makeError(
                set.status === 503 ? "admin_disabled" : "unauthorized",
                set.status === 503
                    ? "ADMIN_KEY is not configured"
                    : "x-admin-key is missing or invalid",
            );
        }

        await ensureMongoConnected();

        const input = query as {
            limit?: string;
            state?: "active" | "revoked";
            client_id?: string;
            user_id?: string;
        };
        const limit = Math.min(Math.max(Number(input.limit || 30) || 30, 1), 200);

        const filter: Record<string, unknown> = {};
        if (input.client_id) filter.clientId = input.client_id;
        if (input.user_id) filter.userId = input.user_id;
        if (input.state === "active") filter.revokedAt = { $exists: false };
        if (input.state === "revoked") filter.revokedAt = { $exists: true };

        const items = await OAuthTokenModel.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return {
            items: items.map((item: any) => ({
                id: String(item._id),
                clientId: item.clientId,
                userId: item.userId,
                scope: item.scope,
                groupId: item.groupId,
                nickname: item.nickname,
                card: item.card,
                requestId: item.requestId,
                accessExpiresAt: item.accessExpiresAt,
                refreshExpiresAt: item.refreshExpiresAt,
                revokedAt: item.revokedAt,
                createdAt: item.createdAt,
            })),
            total: items.length,
        };
    },
    {
        response: {
            401: adminCommonErrorSchema,
            503: adminCommonErrorSchema,
        },
    },
    )
    .post(
        "/tokens/:id/revoke",
        async ({ headers, params, set }) => {
        if (!isAdminAuthorized(headers as any, set)) {
            return makeError(
                set.status === 503 ? "admin_disabled" : "unauthorized",
                set.status === 503
                    ? "ADMIN_KEY is not configured"
                    : "x-admin-key is missing or invalid",
            );
        }

        const p = params as { id: string };
        await ensureMongoConnected();

        const updated = await OAuthTokenModel.findByIdAndUpdate(
            p.id,
            { $set: { revokedAt: new Date() } },
            { new: true },
        ).lean();

        if (!updated) {
            set.status = 404;
            return makeError("not_found", "token not found");
        }

        return {
            ok: true,
            id: p.id,
            revokedAt: updated.revokedAt?.toISOString(),
        };
    },
    {
        response: {
            401: adminCommonErrorSchema,
            404: adminCommonErrorSchema,
            503: adminCommonErrorSchema,
            200: adminTokenRevokeResponseSchema,
        },
    },
    );
