import { t } from "elysia";
import { withDoc } from "@elysiajs/openapi";

export const oauthAuthorizationServerMetadataSchema = withDoc(
    t.Object({
        issuer: t.String({ minLength: 1 }),
        authorization_endpoint: t.String({ minLength: 1 }),
        token_endpoint: t.String({ minLength: 1 }),
        userinfo_endpoint: t.String({ minLength: 1 }),
        jwks_uri: t.String({ minLength: 1 }),
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
        jwks_uri: t.String({ minLength: 1 }),
        response_types_supported: t.Array(t.String()),
        response_modes_supported: t.Array(t.String()),
        grant_types_supported: t.Array(t.String()),
        token_endpoint_auth_methods_supported: t.Array(t.String()),
        subject_types_supported: t.Array(t.String()),
        id_token_signing_alg_values_supported: t.Array(t.String()),
        scopes_supported: t.Array(t.String()),
        claim_types_supported: t.Array(t.String()),
        claims_parameter_supported: t.Boolean(),
        request_parameter_supported: t.Boolean(),
        request_uri_parameter_supported: t.Boolean(),
        claims_supported: t.Array(t.String()),
    }),
    {
        description: "OpenID Connect discovery document.",
    },
);

export const jwkSchema = withDoc(
    t.Object({
        kty: t.Literal("RSA"),
        use: t.Literal("sig"),
        alg: t.Literal("RS256"),
        kid: t.String({ minLength: 1 }),
        n: t.String({ minLength: 1 }),
        e: t.String({ minLength: 1 }),
    }),
    {
        description: "Public RSA signing key exposed through JWKS.",
    },
);

export const jwksResponseSchema = withDoc(
    t.Object({
        keys: t.Array(jwkSchema),
    }),
    {
        description: "JSON Web Key Set for OpenID Connect ID token verification.",
    },
);
