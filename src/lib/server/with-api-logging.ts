import { NextRequest, NextResponse } from "next/server";
import type { ServerLogLevel } from "@/lib/protocol/types";
import { type AuthRole, verifyToken } from "@/lib/server/auth";
import { getBearerToken } from "@/lib/server/http";
import { createRequestId, logServer } from "@/lib/server/logger";

type ApiContext = { params?: Record<string, string> };

interface ApiLogMeta {
  actorRole: AuthRole | "anonymous" | "invalid";
  actorPlayerId?: string;
}

interface WithApiLoggingConfig<TContext extends ApiContext> {
  event: string;
  defaultErrorMessage: string;
  resolveRoomCode?: (request: NextRequest, context: TContext) => string | undefined;
  requestLevel?: ServerLogLevel;
  successLevel?: ServerLogLevel;
}

async function extractTokenFromBody(request: NextRequest): Promise<string | undefined> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    const body = (await request.clone().json()) as { token?: unknown };
    if (typeof body.token === "string") {
      return body.token;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function resolveActor(request: NextRequest): Promise<ApiLogMeta> {
  const queryToken = request.nextUrl.searchParams.get("token") ?? undefined;
  const token = getBearerToken(request) ?? queryToken ?? (await extractTokenFromBody(request));
  if (!token) {
    return { actorRole: "anonymous" };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return { actorRole: "invalid" };
  }

  return {
    actorRole: payload.role,
    actorPlayerId: payload.playerId,
  };
}

function firstStackLine(error: Error): string | undefined {
  const lines = (error.stack ?? "").split("\n");
  if (lines.length <= 1) {
    return undefined;
  }
  return lines[1]?.trim();
}

export function withApiLogging<TContext extends ApiContext>(
  config: WithApiLoggingConfig<TContext>,
  handler: (
    request: NextRequest,
    context: TContext,
    requestId: string,
  ) => Promise<Response>,
): (request: NextRequest, context: TContext) => Promise<Response> {
  return async (request, context) => {
    const startedAt = Date.now();
    const requestId = createRequestId();
    const actor = await resolveActor(request);
    const roomCode = config.resolveRoomCode?.(request, context);

    logServer({
      level: config.requestLevel ?? "info",
      scope: "api",
      event: `${config.event}_request`,
      message: `${request.method} ${request.nextUrl.pathname}`,
      roomCode,
      requestId,
      meta: {
        method: request.method,
        path: request.nextUrl.pathname,
        actorRole: actor.actorRole,
        actorPlayerId: actor.actorPlayerId,
      },
    });

    try {
      const response = await handler(request, context, requestId);
      const durationMs = Date.now() - startedAt;
      const level: ServerLogLevel =
        response.status >= 400 ? "warn" : config.successLevel ?? "info";

      logServer({
        level,
        scope: "api",
        event: `${config.event}_response`,
        message: `${request.method} ${request.nextUrl.pathname} -> ${response.status}`,
        roomCode,
        requestId,
        meta: {
          method: request.method,
          path: request.nextUrl.pathname,
          actorRole: actor.actorRole,
          actorPlayerId: actor.actorPlayerId,
          statusCode: response.status,
          durationMs,
        },
      });

      const nextHeaders = new Headers(response.headers);
      nextHeaders.set("x-request-id", requestId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: nextHeaders,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : config.defaultErrorMessage;

      logServer({
        level: "error",
        scope: "api",
        event: `${config.event}_error`,
        message,
        roomCode,
        requestId,
        meta: {
          method: request.method,
          path: request.nextUrl.pathname,
          actorRole: actor.actorRole,
          actorPlayerId: actor.actorPlayerId,
          statusCode: 400,
          durationMs,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: message,
          errorStack: error instanceof Error ? firstStackLine(error) : undefined,
        },
      });

      return NextResponse.json(
        { error: message },
        {
          status: 400,
          headers: {
            "x-request-id": requestId,
          },
        },
      );
    }
  };
}
