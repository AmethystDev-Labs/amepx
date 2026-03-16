import { Elysia } from "elysia";
import { OAuthAuthorizationRequestModel } from "../../models/db/auth_request.js";
import { ensureMongoConnected } from "../../models/db/connection.js";
import {
  onebotCheckBodySchema,
  onebotCheckResponseSchema,
} from "../../models/router/onebot/check.js";
import { oneBotService } from "../../services/onebot.js";

function buildAuthorizationRedirect(
  redirectUri: string,
  code: string,
  state?: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) {
    url.searchParams.set("state", state);
  }
  return url.toString();
}

function checkError(
  set: any,
  status: number,
  requestId: string,
  error: string,
  errorDescription: string,
): {
  ok: boolean;
  done: boolean;
  request_id: string;
  error: string;
  error_description: string;
} {
  set.status = status;
  return {
    ok: false,
    done: false,
    request_id: requestId,
    error,
    error_description: errorDescription,
  };
}

export const onebotCheckRouter = new Elysia({ prefix: "/onebot" }).post(
  "/check",
  async ({ body, set }) => {
    const input = body as { request_id: string };
    await ensureMongoConnected();

    const authorizationRequest = await OAuthAuthorizationRequestModel.findOne({
      requestId: input.request_id,
    });

    if (!authorizationRequest) {
      return checkError(
        set,
        404,
        input.request_id,
        "invalid_request",
        "request_id not found",
      );
    }

    if (authorizationRequest.codeExpiresAt.getTime() <= Date.now()) {
      if (authorizationRequest.status === "pending") {
        authorizationRequest.status = "expired";
        await authorizationRequest.save();
      }

      return checkError(
        set,
        400,
        authorizationRequest.requestId,
        "expired_token",
        "Authorization code has expired",
      );
    }

    if (
      authorizationRequest.status === "approved" ||
      authorizationRequest.status === "consumed"
    ) {
      const redirectTo = buildAuthorizationRedirect(
        authorizationRequest.redirectUri,
        authorizationRequest.code,
        authorizationRequest.state,
      );
      return {
        ok: true,
        done: true,
        request_id: authorizationRequest.requestId,
        code: authorizationRequest.code,
        state: authorizationRequest.state,
        user_id: authorizationRequest.user?.userId,
        nickname: authorizationRequest.user?.nickname,
        card: authorizationRequest.user?.card,
        redirect_to: redirectTo,
        message: "Authorization already approved",
      };
    }

    if (authorizationRequest.status !== "pending") {
      return checkError(
        set,
        400,
        authorizationRequest.requestId,
        "invalid_grant",
        `Authorization status is ${authorizationRequest.status}`,
      );
    }

    let resolved: Awaited<
      ReturnType<typeof oneBotService.resolveCodeFromGroup>
    >;
    try {
      resolved = await oneBotService.resolveCodeFromGroup(
        authorizationRequest.groupId,
        authorizationRequest.code,
      );
    } catch (error) {
      return checkError(
        set,
        502,
        authorizationRequest.requestId,
        "server_error",
        `OneBot check failed: ${String(error)}`,
      );
    }

    if (!resolved.matchedMessage) {
      return {
        ok: true,
        done: false,
        request_id: authorizationRequest.requestId,
        code: authorizationRequest.code,
        message:
          "Code not found in recent group history. Send the code to group and retry.",
      };
    }

    if (!resolved.userId) {
      return checkError(
        set,
        422,
        authorizationRequest.requestId,
        "invalid_request",
        "Matched message but sender user_id is missing",
      );
    }

    authorizationRequest.status = "approved";
    authorizationRequest.approvedAt = new Date();
    authorizationRequest.user = {
      userId: resolved.userId,
      nickname:
        resolved.memberInfo?.nickname ||
        resolved.matchedMessage.sender?.nickname,
      card: resolved.memberInfo?.card || resolved.matchedMessage.sender?.card,
      avatar: resolved.memberInfo?.avatar,
    };
    authorizationRequest.matchedMessage = {
      messageId:
        resolved.matchedMessage.message_id !== undefined
          ? String(resolved.matchedMessage.message_id)
          : undefined,
      plainText: resolved.plainText,
      userId: resolved.userId,
    };
    await authorizationRequest.save();

    const redirectTo = buildAuthorizationRedirect(
      authorizationRequest.redirectUri,
      authorizationRequest.code,
      authorizationRequest.state,
    );

    return {
      ok: true,
      done: true,
      request_id: authorizationRequest.requestId,
      code: authorizationRequest.code,
      state: authorizationRequest.state,
      user_id: authorizationRequest.user.userId,
      nickname: authorizationRequest.user.nickname,
      card: authorizationRequest.user.card,
      redirect_to: redirectTo,
      message: "Authorization approved by OneBot group check",
    };
  },
  {
    body: onebotCheckBodySchema,
    response: {
      200: onebotCheckResponseSchema,
      400: onebotCheckResponseSchema,
      404: onebotCheckResponseSchema,
      422: onebotCheckResponseSchema,
      502: onebotCheckResponseSchema,
    },
  },
);
