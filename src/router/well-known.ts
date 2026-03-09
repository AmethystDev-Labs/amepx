import { Elysia } from "elysia";
import {
    oauthAuthorizationServerMetadataSchema,
    openidConfigurationSchema,
} from "../models/router/well-known.js";
import { OIDC_DEFAULT_SCOPES } from "../utils/oidc.js";

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

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function resolveIssuer(request: Request): string {
    const configured = (process.env.OAUTH_ISSUER ?? "").trim();
    if (configured) {
        return trimTrailingSlash(configured);
    }

    const url = new URL(request.url);
    return trimTrailingSlash(`${url.protocol}//${url.host}`);
}

function makeMetadata(issuer: string) {
    const authorizationEndpoint = `${issuer}/api/oauth/authorize`;
    const tokenEndpoint = `${issuer}/api/oauth/token`;
    const userinfoEndpoint = `${issuer}/api/user/info`;

    return {
        issuer,
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: tokenEndpoint,
        userinfo_endpoint: userinfoEndpoint,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        scopes_supported: [...OIDC_DEFAULT_SCOPES],
    };
}

export const wellKnownRouter = new Elysia()
    .get(
        "/.well-known/oauth-authorization-server",
        ({ request }) => {
            const issuer = resolveIssuer(request);
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
                id_token_signing_alg_values_supported: ["HS256"],
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
