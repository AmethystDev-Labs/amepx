import { Elysia } from "elysia";
import {
    oauthAuthorizationServerMetadataSchema,
    openidConfigurationSchema,
} from "../models/router/well-known.js";

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
        scopes_supported: ["profile"],
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
        ({ request }) => {
            const issuer = resolveIssuer(request);
            const metadata = makeMetadata(issuer);

            return {
                ...metadata,
                claims_supported: ["sub", "client_id", "group_id", "nickname", "card", "avatar", "scope"],
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
