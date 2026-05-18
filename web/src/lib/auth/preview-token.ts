/**
 * Signed JWTs that let the owner preview an unpublished PDP.
 *
 * Token shape:
 *   iss = 'bhavani-admin-preview'
 *   sub = productId (uuid)
 *   exp = now + 15 minutes
 *
 * HS256 signed with `PREVIEW_TOKEN_SECRET`. `jose` because it works on
 * Edge runtime (the storefront PDP may run there); `jsonwebtoken` does
 * not.
 *
 * **Failure mode:** verify returns null on any failure (expired,
 * mismatched issuer, signature mismatch, wrong product, malformed).
 * Callers should treat null as "no preview" — fall back to the
 * public visibility rule (RLS / is_published).
 */
import "server-only";
import { SignJWT, jwtVerify } from "jose";

const ISSUER = "bhavani-admin-preview";
const TTL_SECONDS = 15 * 60;

function secretBytes(): Uint8Array {
  const s = process.env.PREVIEW_TOKEN_SECRET;
  if (!s) {
    throw new Error(
      "PREVIEW_TOKEN_SECRET is not set. Generate one with `openssl rand -base64 48` and add to .env.local + the Vercel project's env vars.",
    );
  }
  return new TextEncoder().encode(s);
}

export async function signPreviewToken(productId: string): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(productId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secretBytes());
}

export interface PreviewTokenPayload {
  productId: string;
}

export async function verifyPreviewToken(
  token: string,
  productId: string,
): Promise<PreviewTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretBytes(), {
      issuer: ISSUER,
    });
    if (typeof payload.sub !== "string" || payload.sub !== productId) {
      return null;
    }
    return { productId: payload.sub };
  } catch {
    return null;
  }
}
