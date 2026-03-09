import {
    createHash,
    createPrivateKey,
    createPublicKey,
    generateKeyPairSync,
    sign,
    type KeyObject,
} from "node:crypto";

export const OIDC_DEFAULT_SCOPES = ["openid", "profile", "email"] as const;
export const DEFAULT_OAUTH_ISSUER = "https://amepx.0xd3ac.dev";
const OIDC_ID_TOKEN_SIGNING_ALG = "RS256";

type OidcJwk = {
    kty: "RSA";
    use: "sig";
    alg: typeof OIDC_ID_TOKEN_SIGNING_ALG;
    kid: string;
    n: string;
    e: string;
};

type OidcSigningKeyMaterial = {
    kid: string;
    privateKey: KeyObject;
    publicKey: KeyObject;
    publicJwk: OidcJwk;
};

let signingKeyMaterialCache: OidcSigningKeyMaterial | null = null;

function toBase64Url(value: string): string {
    return Buffer.from(value, "utf-8").toString("base64url");
}

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function hasScope(scope: string[], expected: string): boolean {
    return scope.includes(expected);
}

function normalizePem(value: string): string {
    return value.replace(/\\n/g, "\n").trim();
}

function normalizeIssuer(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        const url = new URL(trimmed);
        return trimTrailingSlash(url.toString());
    } catch {
        return null;
    }
}

function buildOidcKeyMaterial(
    privateKey: KeyObject,
    publicKey: KeyObject,
    configuredKid?: string,
): OidcSigningKeyMaterial {
    const exported = publicKey.export({ format: "jwk" }) as JsonWebKey;
    if (exported.kty !== "RSA" || typeof exported.n !== "string" || typeof exported.e !== "string") {
        throw new Error("OIDC signing public key must be an RSA key");
    }

    const publicDer = publicKey.export({ type: "spki", format: "der" });
    const kid =
        configuredKid?.trim() ||
        createHash("sha256").update(publicDer).digest("base64url").slice(0, 16);

    return {
        kid,
        privateKey,
        publicKey,
        publicJwk: {
            kty: "RSA",
            use: "sig",
            alg: OIDC_ID_TOKEN_SIGNING_ALG,
            kid,
            n: exported.n,
            e: exported.e,
        },
    };
}

function getOidcSigningKeyMaterial(): OidcSigningKeyMaterial {
    if (signingKeyMaterialCache) {
        return signingKeyMaterialCache;
    }

    const privateKeyPem = normalizePem(process.env.OIDC_PRIVATE_KEY_PEM ?? "");
    const publicKeyPem = normalizePem(process.env.OIDC_PUBLIC_KEY_PEM ?? "");
    const configuredKid = (process.env.OIDC_KEY_ID ?? "").trim() || undefined;

    if (privateKeyPem) {
        const privateKey = createPrivateKey(privateKeyPem);
        const publicKey = publicKeyPem
            ? createPublicKey(publicKeyPem)
            : createPublicKey(privateKey);
        signingKeyMaterialCache = buildOidcKeyMaterial(privateKey, publicKey, configuredKid);
        return signingKeyMaterialCache;
    }

    const generated = generateKeyPairSync("rsa", {
        modulusLength: 2048,
    });

    signingKeyMaterialCache = buildOidcKeyMaterial(
        generated.privateKey,
        generated.publicKey,
        configuredKid,
    );
    return signingKeyMaterialCache;
}

export function resolveIssuer(request: Request): string {
    const configured = normalizeIssuer(process.env.OAUTH_ISSUER ?? "");
    if (configured) {
        return configured;
    }

    const requestIssuer = normalizeIssuer(new URL(request.url).origin);
    if (requestIssuer) {
        return requestIssuer;
    }

    return DEFAULT_OAUTH_ISSUER;
}

export function getOidcJwks(): { keys: OidcJwk[] } {
    const keyMaterial = getOidcSigningKeyMaterial();
    return {
        keys: [keyMaterial.publicJwk],
    };
}

export function getOidcJwksUri(issuer: string): string {
    return `${trimTrailingSlash(issuer)}/.well-known/jwks.json`;
}

export function getOidcIdTokenSigningAlg(): typeof OIDC_ID_TOKEN_SIGNING_ALG {
    return OIDC_ID_TOKEN_SIGNING_ALG;
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
        const displayName = params.nickname?.trim() || params.card?.trim() || sub;
        claims.name = displayName;
        claims.nickname = params.nickname?.trim() || displayName;
        claims.preferred_username = displayName;
        if (params.avatar?.trim()) {
            claims.picture = params.avatar.trim();
        }
        claims.updated_at = Math.floor(Date.now() / 1000);
    }

    if (hasScope(params.scope, "email")) {
        claims.email = `qquser_${sub}@dart.cc.cd`;
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
    const keyMaterial = getOidcSigningKeyMaterial();

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
        alg: OIDC_ID_TOKEN_SIGNING_ALG,
        typ: "JWT",
        kid: keyMaterial.kid,
    };

    const encodedHeader = toBase64Url(JSON.stringify(header));
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = sign("RSA-SHA256", Buffer.from(unsignedToken, "utf-8"), keyMaterial.privateKey)
        .toString("base64url");

    return `${unsignedToken}.${signature}`;
}
