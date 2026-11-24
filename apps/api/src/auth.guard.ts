import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { GoTrueClient } from "@supabase/auth-js";
import { z } from "zod";

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  actorId: string;
  sessionId?: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly issuer: string | undefined;
  private readonly auth: GoTrueClient | undefined;

  constructor() {
    const url = process.env.SUPABASE_AUTH_URL?.replace(/\/$/, "");
    this.issuer = process.env.SUPABASE_JWT_ISSUER ?? url;
    if (!url) return;

    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    this.auth = new GoTrueClient({
      url,
      headers: key ? { apikey: key } : {},
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      skipAutoInitialize: true,
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4000) }),
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("Sign in to continue.");
    if (!this.auth || !this.issuer) {
      throw new ServiceUnavailableException("Sign-in is temporarily unavailable.");
    }

    const result = await this.auth.getClaims(token).catch(() => null);
    const claims = result?.data?.claims;
    const id = z.uuid().safeParse(claims?.sub);
    const audience = claims?.aud;

    if (
      !claims || result?.error || !id.success ||
      claims.iss !== this.issuer ||
      (audience !== "authenticated" && !(Array.isArray(audience) && audience.includes("authenticated"))) ||
      claims.role !== "authenticated" || claims.is_anonymous === true ||
      typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException("Your session is invalid or has expired.");
    }

    request.actorId = id.data;
    const sessionId = z.uuid().safeParse(claims.session_id);
    request.sessionId = sessionId.success ? sessionId.data : undefined;
    return true;
  }
}
