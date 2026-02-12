import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const DEFAULT_CODE_TTL_SECONDS = 300;
const DEFAULT_ACCESS_TTL_SECONDS = 3600;
const DEFAULT_REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;

export function getPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

export function getOAuthCodeTtlSeconds(): number {
    return getPositiveIntEnv("OAUTH_CODE_TTL_SECONDS", DEFAULT_CODE_TTL_SECONDS);
}

export function getOAuthAccessTokenTtlSeconds(): number {
    return getPositiveIntEnv("OAUTH_ACCESS_TOKEN_TTL_SECONDS", DEFAULT_ACCESS_TTL_SECONDS);
}

export function getOAuthRefreshTokenTtlSeconds(): number {
    return getPositiveIntEnv("OAUTH_REFRESH_TOKEN_TTL_SECONDS", DEFAULT_REFRESH_TTL_SECONDS);
}

export function generateAuthorizationCode(length: number = 6): string {
    const max = 10 ** length;
    return randomInt(0, max).toString().padStart(length, "0");
}

export function generateRequestId(): string {
    return randomBytes(16).toString("hex");
}

export function generateOpaqueToken(bytes: number = 32): string {
    return randomBytes(bytes).toString("base64url");
}

function getTokenHashSecret(): string {
    return process.env.SECRET_KEY || "fallback-secret-key";
}

export function hashTokenValue(token: string): string {
    return createHmac("sha256", getTokenHashSecret()).update(token).digest("hex");
}

export function normalizeScope(scope: string | string[] | undefined): string[] {
    if (!scope) {
        return [];
    }

    if (Array.isArray(scope)) {
        return scope.map((item) => item.trim()).filter(Boolean);
    }

    return scope
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function serializeScope(scope: string[]): string | undefined {
    const normalized = Array.from(new Set(scope.map((item) => item.trim()).filter(Boolean)));
    return normalized.length > 0 ? normalized.join(" ") : undefined;
}

function safeCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
        return false;
    }

    return timingSafeEqual(aBuf, bBuf);
}

export function verifyClientSecret(storedValue: string | undefined, providedSecret: string | undefined): boolean {
    if (!storedValue) {
        return true;
    }

    if (!providedSecret) {
        return false;
    }

    if (storedValue.startsWith("sha256:")) {
        const expected = createHash("sha256").update(providedSecret).digest("hex");
        return safeCompare(storedValue.slice("sha256:".length), expected);
    }

    return safeCompare(storedValue, providedSecret);
}

export function parseBasicAuthorizationHeader(authHeader: string | undefined): {
    clientId?: string;
    clientSecret?: string;
} {
    if (!authHeader || !authHeader.startsWith("Basic ")) {
        return {};
    }

    const encoded = authHeader.slice("Basic ".length).trim();
    if (!encoded) {
        return {};
    }

    try {
        const decoded = Buffer.from(encoded, "base64").toString("utf-8");
        const separatorIndex = decoded.indexOf(":");
        if (separatorIndex === -1) {
            return {};
        }

        const clientId = decoded.slice(0, separatorIndex);
        const clientSecret = decoded.slice(separatorIndex + 1);
        return { clientId, clientSecret };
    } catch {
        return {};
    }
}
