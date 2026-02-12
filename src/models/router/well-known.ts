import { t } from "elysia";
import { withDoc } from "@elysiajs/openapi";

export const oauthAuthorizationServerMetadataSchema = withDoc(
    t.Object({
        issuer: t.String({ minLength: 1 }),
        authorization_endpoint: t.String({ minLength: 1 }),
        token_endpoint: t.String({ minLength: 1 }),
        userinfo_endpoint: t.String({ minLength: 1 }),
        response_types_supported: t.Array(t.String()),
        grant_types_supported: t.Array(t.String()),
        token_endpoint_auth_methods_supported: t.Array(t.String()),
        scopes_supported: t.Array(t.String()),
    }),
    {
        description: "RFC 8414 OAuth 2.0 Authorization Server Metadata.",
    },
);

export const openidConfigurationSchema = withDoc(
    t.Object({
        issuer: t.String({ minLength: 1 }),
        authorization_endpoint: t.String({ minLength: 1 }),
        token_endpoint: t.String({ minLength: 1 }),
        userinfo_endpoint: t.String({ minLength: 1 }),
        response_types_supported: t.Array(t.String()),
        grant_types_supported: t.Array(t.String()),
        token_endpoint_auth_methods_supported: t.Array(t.String()),
        scopes_supported: t.Array(t.String()),
        claims_supported: t.Array(t.String()),
    }),
    {
        description: "OpenID Connect discovery document.",
    },
);
