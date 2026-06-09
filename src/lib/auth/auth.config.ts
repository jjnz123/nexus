import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/lib/db/schema";
import { canAccessRoute } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      avatarPath: string | null;
    };
  }

  interface User {
    role: UserRole;
    avatarPath: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    avatarPath: string | null;
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
      if (isLoggedIn && isLoginPage) return Response.redirect(new URL("/", request.nextUrl));
      if (isLoggedIn && auth?.user?.role && !canAccessRoute(auth.user.role, pathname)) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.avatarPath = user.avatarPath;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.avatarPath = token.avatarPath ?? null;
      return session;
    },
  },
  providers: [],
  trustHost: true,
} satisfies NextAuthConfig;
