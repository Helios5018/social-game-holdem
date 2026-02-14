import { NextRequest } from "next/server";

export async function readJson<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function getBearerToken(request: NextRequest): string | undefined {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return undefined;
  }

  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer") {
    return undefined;
  }

  return token;
}
