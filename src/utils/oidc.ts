import { createHmac } from "node:crypto";

export const OIDC_DEFAULT_SCOPES = ["openid", "profile", "email"] as const;

function toBase64Url(value: string): string {
    return Buffer.from(value, "utf-8").toString("base64url");
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function hasScope(scope: string[], expected: string): boolean {
    return scope.includes(expected);
}

export function resolveIssuer(request: Request): string {
    const configured = (process.env.OAUTH_ISSUER ?? "").trim();
    if (configured) {
        return trimTrailingSlash(configured);
    }

    const url = new URL(request.url);
    return trimTrailingSlash(`${url.protocol}//${url.host}`);
}

export function buildStandardUserClaims(params: {
    userId: string;
    scope: string[];
    nickname?: string;
    card?: string;
    avatar?: string;
}): Record<string, unknown> {
    const sub = String(params.userId);
    const claims: Record<string, unknown> = {
        sub,
    };

    if (hasScope(params.scope, "profile")) {
        const displayName = params.card?.trim() || params.nickname?.trim() || sub;
        claims.name = displayName;
        claims.nickname = params.nickname?.trim() || displayName;
        claims.preferred_username = sub;
        if (params.avatar?.trim()) {
            claims.picture = params.avatar.trim();
        }
        claims.updated_at = Math.floor(Date.now() / 1000);
    }

    if (hasScope(params.scope, "email")) {
        claims.email = `${sub}@qq.com`;
        claims.email_verified = true;
    }

    return claims;
}

export function buildIdToken(params: {
    issuer: string;
    audience: string;
    userId: string;
    scope: string[];
    expiresInSeconds: number;
    nickname?: string;
    card?: string;
    avatar?: string;
    nonce?: string;
    authTimeSeconds?: number;
}): string {
    const now = Math.floor(Date.now() / 1000);

    const payload: Record<string, unknown> = {
        iss: params.issuer,
        sub: String(params.userId),
        aud: params.audience,
        iat: now,
        exp: now + params.expiresInSeconds,
        auth_time: params.authTimeSeconds ?? now,
        ...buildStandardUserClaims({
            userId: params.userId,
            scope: params.scope,
            nickname: params.nickname,
            card: params.card,
            avatar: params.avatar,
        }),
    };

    if (params.nonce) {
        payload.nonce = params.nonce;
    }

    const header = {
        alg: "HS256",
        typ: "JWT",
    };

    const encodedHeader = toBase64Url(JSON.stringify(header));
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    const secret = process.env.SECRET_KEY || "fallback-secret-key";
    const signature = createHmac("sha256", secret).update(unsignedToken).digest("base64url");

    return `${unsignedToken}.${signature}`;
}
