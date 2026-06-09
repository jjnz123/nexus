import type { NextAuthConfig } from "next-auth";
import type { UserRole, UserStatus } from "@/lib/db/schema";
import type { UserPermissionOverrides } from "@/lib/permissions";
import { canAccessRoute } from "@/lib/permissions";
import { absoluteUrlFromRequest } from "@/lib/url";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      status: UserStatus;
      totpEnabled: boolean;
      avatarPath: string | null;
      permissions: UserPermissionOverrides | null;
    };
  }

  interface User {
    role: UserRole;
    status: UserStatus;
    totpEnabled: boolean;
    avatarPath: string | null;
    permissions: UserPermissionOverrides | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    status: UserStatus;
    totpEnabled: boolean;
    avatarPath: string | null;
    permissions: UserPermissionOverrides | null;
  }
}

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const isLoginPage = pathname.startsWith("/login");
      const isPublic =
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/health");

      if (isPublic) return true;
      if (!isLoggedIn && !isLoginPage) return false;
      if (isLoggedIn && isLoginPage) {
        const dest = auth?.user?.status === "pending" || (!auth.user.totpEnabled && auth.user.role !== "admin" && auth.user.status !== "administrator")
          ? "/settings"
          : "/";
        // Use forwarded host/proto (Cloudflare Tunnel) instead of internal request origin.
        return Response.redirect(absoluteUrlFromRequest(dest, request));
      }
      if (
        isLoggedIn &&
        auth?.user?.role &&
        !canAccessRoute(auth.user.role, pathname, auth.user.permissions, {
          status: auth.user.status,
          totpEnabled: auth.user.totpEnabled,
        })
      ) {
        return Response.redirect(absoluteUrlFromRequest("/settings", request));
      }
      return true;
    },
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.status = user.status;
        token.totpEnabled = user.totpEnabled;
        token.avatarPath = user.avatarPath;
        token.permissions = user.permissions ?? null;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.status = token.status;
      session.user.totpEnabled = token.totpEnabled;
      session.user.avatarPath = token.avatarPath ?? null;
      session.user.permissions = token.permissions ?? null;
      return session;
    },
  },
  providers: [],
  trustHost: true,
} satisfies NextAuthConfig;
