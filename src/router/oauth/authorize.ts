import { Elysia, t } from "elysia";
import { withDoc } from "@elysiajs/openapi";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ensureMongoConnected } from "../../models/db/connection.js";
import { OAuthClientModel } from "../../models/db/client.js";
import { OAuthAuthorizationRequestModel } from "../../models/db/auth_request.js";
import {
    generateAuthorizationCode,
    generateRequestId,
    getOAuthCodeTtlSeconds,
    normalizeScope,
} from "../../utils/oauth.js";
import {
    oauthAuthorizeErrorSchema,
    oauthAuthorizeQuerySchema,
} from "../../models/router/oauth/authorize.js";

let authorizeTemplateCache: string | null = null;

function escapeHtml(raw: string): string {
    return raw
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

async function getAuthorizeTemplate(): Promise<string> {
    if (authorizeTemplateCache) {
        return authorizeTemplateCache;
    }

    const templatePath = path.resolve(process.cwd(), "src/templete/authorize.eta");
    authorizeTemplateCache = await readFile(templatePath, "utf-8");
    return authorizeTemplateCache;
}

async function renderAuthorizeTemplate(payload: Record<string, string>): Promise<string> {
    const template = await getAuthorizeTemplate();

    // The current template has one setup block at the top; remove it for lightweight interpolation.
    const body = template.replace(/^<%[\s\S]*?%>\s*/, "");

    return body.replace(/<%=\s*([A-Z_]+)\s*%>/g, (_fullMatch, key: string) => {
        return escapeHtml(payload[key] ?? "");
    });
}

function oauthErrorResponse(status: number, error: string, errorDescription: string): Response {
    return new Response(
        JSON.stringify({
            error,
            error_description: errorDescription,
        }),
        {
            status,
            headers: {
                "content-type": "application/json; charset=utf-8",
            },
        },
    );
}

async function generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = generateAuthorizationCode(6);
        const exists = await OAuthAuthorizationRequestModel.exists({
            code,
            status: { $in: ["pending", "approved"] },
            codeExpiresAt: { $gt: new Date() },
        });

        if (!exists) {
            return code;
        }
    }

    throw new Error("Failed to generate unique authorization code");
}

export const oauthAuthorizeRouter = new Elysia({ prefix: "/oauth" }).get(
    "/authorize",
    async ({ query }) => {
        if (query.response_type !== "code") {
            return oauthErrorResponse(
                400,
                "unsupported_response_type",
                "Only response_type=code is supported",
            );
        }

        await ensureMongoConnected();

        const client = await OAuthClientModel.findOne({
            clientId: query.client_id,
            active: true,
        }).lean();

        if (!client) {
            return oauthErrorResponse(400, "invalid_client", "Unknown or inactive client_id");
        }

        let redirectUri = query.redirect_uri;
        if (!redirectUri && client.redirectUris.length === 1) {
            redirectUri = client.redirectUris[0];
        }

        if (!redirectUri) {
            return oauthErrorResponse(400, "invalid_request", "redirect_uri is required");
        }

        if (!client.redirectUris.includes(redirectUri)) {
            return oauthErrorResponse(400, "invalid_request", "redirect_uri is not registered");
        }

        const requestedScope = normalizeScope(query.scope);
        if (requestedScope.some((scopeItem) => !client.scopes.includes(scopeItem))) {
            return oauthErrorResponse(400, "invalid_scope", "Requested scope is not allowed");
        }

        const scope = requestedScope.length > 0 ? requestedScope : client.scopes;
        const groupId = query.group_id || client.groupId;
        if (!groupId) {
            return oauthErrorResponse(
                400,
                "invalid_request",
                "group_id is required (query.group_id or client.groupId)",
            );
        }

        const code = await generateUniqueCode();
        const requestId = generateRequestId();
        const codeTtlSeconds = getOAuthCodeTtlSeconds();
        const codeExpiresAt = new Date(Date.now() + codeTtlSeconds * 1000);

        await OAuthAuthorizationRequestModel.create({
            requestId,
            clientId: client.clientId,
            redirectUri,
            state: query.state,
            scope,
            groupId,
            code,
            codeExpiresAt,
            status: "pending",
        });

        const html = await renderAuthorizeTemplate({
            REQUEST_ID: requestId,
            CODE: code,
            CLIENTNAME: client.name,
            CLIENTPICTURE: client.picture || "https://placehold.co/96x96/png",
            CLIENT_DESCRIPTION: client.description || "No description",
            GROUP_ID: String(groupId),
        });

        return new Response(html, {
            headers: {
                "content-type": "text/html; charset=utf-8",
            },
        });
    },
    {
        query: oauthAuthorizeQuerySchema,
        response: {
            400: oauthAuthorizeErrorSchema,
            200: withDoc(t.String(), {
                description: "Authorization page HTML.",
                content: {
                    "text/html": {
                        schema: {
                            type: "string",
                        },
                    },
                },
                headers: {
                    "content-type": t.String({ minLength: 1 }),
                },
            }),
        },
    },
);
