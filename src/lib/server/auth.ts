import crypto from "node:crypto";

export type AuthRole = "host" | "player";

export interface TokenPayload {
  roomCode: string;
  role: AuthRole;
  playerId?: string;
  iat: number;
}

const SECRET = process.env.GAME_TOKEN_SECRET ?? "dev-secret-change-me";

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(rawPayload: string): string {
  return crypto.createHmac("sha256", SECRET).update(rawPayload).digest("base64url");
}

export function createToken(payload: TokenPayload): string {
  const rawPayload = JSON.stringify(payload);
  const encodedPayload = toBase64Url(rawPayload);
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(fromBase64Url(encodedPayload)) as TokenPayload;
    if (!decoded.roomCode || !decoded.role || !decoded.iat) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}
