import { Elysia } from "elysia";
import { ensureMongoConnected } from "../../models/db/connection.js";
import { OAuthClientModel } from "../../models/db/client.js";
import { OAuthAuthorizationRequestModel } from "../../models/db/auth_request.js";
import { OAuthTokenModel } from "../../models/db/token.js";
import {
    generateOpaqueToken,
    getOAuthAccessTokenTtlSeconds,
    getOAuthRefreshTokenTtlSeconds,
    hashTokenValue,
    parseBasicAuthorizationHeader,
    serializeScope,
    verifyClientSecret,
} from "../../utils/oauth.js";
import { buildIdToken, resolveIssuer } from "../../utils/oidc.js";
import {
    oauthTokenBodySchema,
    oauthTokenErrorSchema,
    oauthTokenSuccessSchema,
} from "../../models/router/oauth/token.js";

function oauthErrorResponse(
    set: any,
    status: number,
    error: string,
    errorDescription: string,
    withWwwAuthenticate: boolean = false,
) {
    set.status = status;
    if (withWwwAuthenticate) {
        set.headers["www-authenticate"] = `Basic realm=\"oauth\", error=\"${error}\"`;
    }

    return {
        error,
        error_description: errorDescription,
    };
}

async function issueTokens(params: {
    issuer: string;
    clientId: string;
    userId: string;
    scope: string[];
    groupId?: string;
    requestId?: string;
    nickname?: string;
    card?: string;
    avatar?: string;
    nonce?: string;
    authTimeSeconds?: number;
    rotatedFrom?: string;
}) {
    const accessTokenTtlSeconds = getOAuthAccessTokenTtlSeconds();
    const refreshTokenTtlSeconds = getOAuthRefreshTokenTtlSeconds();

    const accessToken = generateOpaqueToken(32);
    const refreshToken = generateOpaqueToken(48);

    const now = Date.now();
    const accessExpiresAt = new Date(now + accessTokenTtlSeconds * 1000);
    const refreshExpiresAt = new Date(now + refreshTokenTtlSeconds * 1000);

    await OAuthTokenModel.create({
        clientId: params.clientId,
        userId: params.userId,
        scope: params.scope,
        groupId: params.groupId,
        requestId: params.requestId,
        nickname: params.nickname,
        card: params.card,
        avatar: params.avatar,
        accessTokenHash: hashTokenValue(accessToken),
        refreshTokenHash: hashTokenValue(refreshToken),
        accessExpiresAt,
        refreshExpiresAt,
        rotatedFrom: params.rotatedFrom,
    });

    const response: {
        token_type: "Bearer";
        access_token: string;
        expires_in: number;
        refresh_token: string;
        scope?: string;
        id_token?: string;
    } = {
        token_type: "Bearer" as const,
        access_token: accessToken,
        expires_in: accessTokenTtlSeconds,
        refresh_token: refreshToken,
        scope: serializeScope(params.scope),
    };

    if (params.scope.includes("openid")) {
        response.id_token = buildIdToken({
            issuer: params.issuer,
            audience: params.clientId,
            userId: params.userId,
            scope: params.scope,
            expiresInSeconds: accessTokenTtlSeconds,
            nickname: params.nickname,
            card: params.card,
            avatar: params.avatar,
            nonce: params.nonce,
            authTimeSeconds: params.authTimeSeconds,
        });
    }

    return response;
}

function parseTokenBody(rawBody: unknown): {
    grant_type: string;
    client_id?: string;
    client_secret?: string;
    code?: string;
    redirect_uri?: string;
    refresh_token?: string;
    scope?: string;
} {
    if (typeof rawBody === "string") {
        const parsed = Object.fromEntries(new URLSearchParams(rawBody).entries());
        return parsed as {
            grant_type: string;
            client_id?: string;
            client_secret?: string;
            code?: string;
            redirect_uri?: string;
            refresh_token?: string;
            scope?: string;
        };
    }

    return (rawBody ?? {}) as {
        grant_type: string;
        client_id?: string;
        client_secret?: string;
        code?: string;
        redirect_uri?: string;
        refresh_token?: string;
        scope?: string;
    };
}

export const oauthTokenRouter = new Elysia({ prefix: "/oauth" }).post(
    "/token",
    async ({ body, headers, set, request }) => {
        const input = parseTokenBody(body);
        const issuer = resolveIssuer(request);

        set.headers["cache-control"] = "no-store";
        set.headers.pragma = "no-cache";

        await ensureMongoConnected();

        const authorizationHeader =
            typeof headers.authorization === "string" ? headers.authorization : undefined;
        const parsedBasic = parseBasicAuthorizationHeader(authorizationHeader);
        const clientId = parsedBasic.clientId || input.client_id;
        const clientSecret = parsedBasic.clientSecret || input.client_secret;

        if (!clientId) {
            return oauthErrorResponse(set, 401, "invalid_client", "Missing client_id", true);
        }

        const client = await OAuthClientModel.findOne({
            clientId,
            active: true,
        });

        if (!client) {
            return oauthErrorResponse(set, 401, "invalid_client", "Unknown client", true);
        }

        if (!verifyClientSecret(client.clientSecretHash, clientSecret)) {
            return oauthErrorResponse(set, 401, "invalid_client", "Invalid client_secret", true);
        }

        if (input.grant_type === "authorization_code") {
            if (!input.code) {
                return oauthErrorResponse(set, 400, "invalid_request", "Missing code");
            }

            const authorizationRequest = await OAuthAuthorizationRequestModel.findOne({
                clientId: client.clientId,
                code: input.code,
            });

            if (!authorizationRequest) {
                return oauthErrorResponse(set, 400, "invalid_grant", "Authorization code not found");
            }

            if (authorizationRequest.codeExpiresAt.getTime() <= Date.now()) {
                authorizationRequest.status = "expired";
                await authorizationRequest.save();
                return oauthErrorResponse(set, 400, "invalid_grant", "Authorization code expired");
            }

            if (
                input.redirect_uri &&
                authorizationRequest.redirectUri &&
                input.redirect_uri !== authorizationRequest.redirectUri
            ) {
                return oauthErrorResponse(set, 400, "invalid_grant", "redirect_uri mismatch");
            }

            if (authorizationRequest.status === "pending") {
                return oauthErrorResponse(
                    set,
                    400,
                    "authorization_pending",
                    "Authorization is not approved yet",
                );
            }

            if (authorizationRequest.status !== "approved") {
                return oauthErrorResponse(set, 400, "invalid_grant", "Authorization code already used");
            }

            if (!authorizationRequest.user?.userId) {
                return oauthErrorResponse(
                    set,
                    400,
                    "invalid_grant",
                    "Authorization code has no approved user",
                );
            }

            const tokenResponse = await issueTokens({
                issuer,
                clientId: client.clientId,
                userId: authorizationRequest.user.userId,
                scope: authorizationRequest.scope,
                groupId: authorizationRequest.groupId,
                requestId: authorizationRequest.requestId,
                nickname: authorizationRequest.user.nickname,
                card: authorizationRequest.user.card,
                avatar: authorizationRequest.user.avatar,
                nonce: authorizationRequest.nonce,
                authTimeSeconds: authorizationRequest.approvedAt
                    ? Math.floor(authorizationRequest.approvedAt.getTime() / 1000)
                    : undefined,
            });

            authorizationRequest.status = "consumed";
            authorizationRequest.consumedAt = new Date();
            await authorizationRequest.save();

            return tokenResponse;
        }

        if (input.grant_type === "refresh_token") {
            if (!input.refresh_token) {
                return oauthErrorResponse(set, 400, "invalid_request", "Missing refresh_token");
            }

            const refreshTokenHash = hashTokenValue(input.refresh_token);
            const tokenDoc = await OAuthTokenModel.findOne({
                refreshTokenHash,
                revokedAt: { $exists: false },
            });

            if (!tokenDoc) {
                return oauthErrorResponse(set, 400, "invalid_grant", "Invalid refresh_token");
            }

            if (tokenDoc.clientId !== client.clientId) {
                return oauthErrorResponse(set, 400, "invalid_grant", "refresh_token client mismatch");
            }

            if (tokenDoc.refreshExpiresAt.getTime() <= Date.now()) {
                tokenDoc.revokedAt = new Date();
                await tokenDoc.save();
                return oauthErrorResponse(set, 400, "invalid_grant", "refresh_token expired");
            }

            tokenDoc.revokedAt = new Date();
            await tokenDoc.save();

            const tokenResponse = await issueTokens({
                issuer,
                clientId: tokenDoc.clientId,
                userId: tokenDoc.userId,
                scope: tokenDoc.scope,
                groupId: tokenDoc.groupId,
                requestId: tokenDoc.requestId,
                nickname: tokenDoc.nickname,
                card: tokenDoc.card,
                avatar: tokenDoc.avatar,
                rotatedFrom: tokenDoc._id.toString(),
            });

            return tokenResponse;
        }

        return oauthErrorResponse(
            set,
            400,
            "unsupported_grant_type",
            "grant_type must be authorization_code or refresh_token",
        );
    },
    {
        body: oauthTokenBodySchema,
        response: {
            200: oauthTokenSuccessSchema,
            400: oauthTokenErrorSchema,
            401: oauthTokenErrorSchema,
        },
    },
);
