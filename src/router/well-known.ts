import { Elysia } from "elysia";
import {
    jwksResponseSchema,
    oauthAuthorizationServerMetadataSchema,
    openidConfigurationSchema,
} from "../models/router/well-known.js";
import {
    getOidcIdTokenSigningAlg,
    getOidcJwks,
    getOidcJwksUri,
    OIDC_DEFAULT_SCOPES,
    resolveIssuer,
} from "../utils/oidc.js";

const OIDC_CLAIMS_SUPPORTED = [
    "sub",
    "name",
    "nickname",
    "preferred_username",
    "picture",
    "updated_at",
    "email",
    "email_verified",
    "client_id",
    "group_id",
    "scope",
    "card",
    "avatar",
] as const;

function makeMetadata(issuer: string) {
    const authorizationEndpoint = `${issuer}/api/oauth/authorize`;
    const tokenEndpoint = `${issuer}/api/oauth/token`;
    const userinfoEndpoint = `${issuer}/api/user/info`;
    const jwksUri = getOidcJwksUri(issuer);

    return {
        issuer,
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: tokenEndpoint,
        userinfo_endpoint: userinfoEndpoint,
        jwks_uri: jwksUri,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        scopes_supported: [...OIDC_DEFAULT_SCOPES],
    };
}

export const wellKnownRouter = new Elysia()
    .get(
        "/.well-known/jwks.json",
        ({ set }) => {
            set.headers["access-control-allow-origin"] = "*";
            set.headers["access-control-allow-methods"] = "GET, OPTIONS";
            set.headers["cache-control"] = "public, max-age=300";
            return getOidcJwks();
        },
        {
            detail: {
                tags: ["well-known"],
                summary: "JSON Web Key Set",
            },
            response: {
                200: jwksResponseSchema,
            },
        },
    )
    .get(
        "/.well-known/oauth-authorization-server",
        ({ request, set }) => {
            const issuer = resolveIssuer(request);
            set.headers["access-control-allow-origin"] = "*";
            set.headers["access-control-allow-methods"] = "GET, OPTIONS";
            return makeMetadata(issuer);
        },
        {
            detail: {
                tags: ["well-known"],
                summary: "OAuth2 authorization server metadata",
            },
            response: {
                200: oauthAuthorizationServerMetadataSchema,
            },
        },
    )
    .get(
        "/.well-known/openid-configuration",
        ({ request, set }) => {
            const issuer = resolveIssuer(request);
            const metadata = makeMetadata(issuer);
            set.headers["access-control-allow-origin"] = "*";
            set.headers["access-control-allow-methods"] = "GET, OPTIONS";

            return {
                ...metadata,
                response_modes_supported: ["query"],
                subject_types_supported: ["public"],
                id_token_signing_alg_values_supported: [getOidcIdTokenSigningAlg()],
                claim_types_supported: ["normal"],
                claims_parameter_supported: false,
                request_parameter_supported: false,
                request_uri_parameter_supported: false,
                claims_supported: [...OIDC_CLAIMS_SUPPORTED],
            };
        },
        {
            detail: {
                tags: ["well-known"],
                summary: "OpenID Connect discovery document",
            },
            response: {
                200: openidConfigurationSchema,
            },
        },
    );
