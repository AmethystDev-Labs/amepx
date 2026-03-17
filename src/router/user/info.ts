import { Elysia } from "elysia";
import { ensureMongoConnected } from "../../models/db/connection.js";
import { OAuthTokenModel } from "../../models/db/token.js";
import {
  userInfoErrorSchema,
  userInfoHeadersSchema,
  userInfoResponseSchema,
} from "../../models/router/user/info.js";
import { hashTokenValue } from "../../utils/oauth.js";
import {
  buildStandardUserClaims,
  resolveUserAvatar,
} from "../../utils/oidc.js";

function extractBearerToken(authorization: string): string | null {
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1]?.trim();
  return token ? token : null;
}

function userInfoError(
  set: any,
  status: number,
  error: string,
  description: string,
): { error: string; error_description: string } {
  set.status = status;
  set.headers["www-authenticate"] = `Bearer error="${error}"`;
  return {
    error,
    error_description: description,
  };
}

export const userInfoRouter = new Elysia({ prefix: "/user" }).get(
  "/info",
  async ({ headers, set }) => {
    const bearerToken = extractBearerToken(headers.authorization);
    if (!bearerToken) {
      return userInfoError(
        set,
        401,
        "invalid_token",
        "Missing or invalid Authorization Bearer token",
      );
    }

    await ensureMongoConnected();

    const tokenHash = hashTokenValue(bearerToken);
    const tokenDoc = await OAuthTokenModel.findOne({
      accessTokenHash: tokenHash,
      revokedAt: { $exists: false },
    }).lean();

    if (!tokenDoc) {
      return userInfoError(set, 401, "invalid_token", "Access token not found");
    }

    if (tokenDoc.accessExpiresAt.getTime() <= Date.now()) {
      await OAuthTokenModel.updateOne(
        { _id: tokenDoc._id },
        { $set: { revokedAt: new Date() } },
      );

      return userInfoError(set, 401, "invalid_token", "Access token expired");
    }

    const oidcClaims = buildStandardUserClaims({
      userId: tokenDoc.userId,
      scope: tokenDoc.scope,
      nickname: tokenDoc.nickname,
      card: tokenDoc.card,
      avatar: tokenDoc.avatar,
    });
    const resolvedAvatar = resolveUserAvatar({
      userId: tokenDoc.userId,
      avatar: tokenDoc.avatar,
    });

    return {
      ...oidcClaims,
      id: `qq_${tokenDoc.userId}`,
      sub: tokenDoc.userId,
      client_id: tokenDoc.clientId,
      group_id: tokenDoc.groupId,
      nickname: tokenDoc.nickname,
      card: tokenDoc.card,
      avatar: resolvedAvatar,
      picture: resolvedAvatar,
      scope: tokenDoc.scope,
    };
  },
  {
    headers: userInfoHeadersSchema,
    response: {
      200: userInfoResponseSchema,
      401: userInfoErrorSchema,
    },
  },
);
