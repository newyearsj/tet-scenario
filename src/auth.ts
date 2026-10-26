import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";
import { getMasterEmail, normalizeEmail } from "@/lib/auth/master-email";
import { createServerSession, revokeServerSession, SERVER_SESSION_MAX_AGE_SECONDS, validateServerSession } from "@/lib/auth/server-session";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { scope: "openid email profile" } } })],
  session: { strategy: "jwt", maxAge: SERVER_SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/", error: "/auth/error" },
  callbacks: {
    async signIn({ account, profile }) {
      try {
        if (account?.provider !== "google" || !profile?.sub || profile.email_verified !== true) return false;
        const providerSubject = profile.sub;
        const email = normalizeEmail(profile.email);
        if (email !== getMasterEmail()) return false;
        const sql = getDatabase();
        await sql.begin(async (tx) => {
          const bySubject = await tx`SELECT id,email,status FROM app_users WHERE auth_provider='google' AND provider_subject=${providerSubject} FOR UPDATE`;
          if (bySubject[0] && (bySubject[0].status !== "active" || normalizeEmail(bySubject[0].email) !== email)) throw new Error("AUTH_REJECTED");
          const byEmail = await tx`SELECT id,provider_subject,status FROM app_users WHERE lower(email)=${email} FOR UPDATE`;
          if (!bySubject[0] && byEmail[0]) throw new Error("AUTH_REJECTED");
          const userId = bySubject[0]?.id ?? randomUUID();
          if (!bySubject[0]) await tx`INSERT INTO app_users (id,auth_provider,provider_subject,email,last_login_at) VALUES (${userId},'google',${providerSubject},${email},now())`;
          else await tx`UPDATE app_users SET auth_provider='google',provider_subject=${providerSubject},email=${email},last_login_at=now(),updated_at=now() WHERE id=${userId}`;
          const projects = await tx`SELECT id FROM projects WHERE owner_user_id=${userId} LIMIT 1`;
          if (!projects.length) await tx`INSERT INTO projects (id,name,owner_user_id,is_sample,is_default) VALUES (${randomUUID()},'새 프로젝트',${userId},false,true)`;
        });
        return true;
      } catch (error) {
        if (error instanceof Error && error.message === "AUTH_REJECTED") return false;
        throw error;
      }
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.sub) {
        const email = normalizeEmail(profile.email);
        const sql = getDatabase();
        const users = await sql`SELECT id FROM app_users WHERE auth_provider='google' AND provider_subject=${profile.sub} AND lower(email)=${email} AND status='active'`;
        if (!users[0]) return { ...token, authRejected: true };
        const serverSession = await createServerSession(users[0].id);
        token.userId = users[0].id;
        token.serverSessionToken = serverSession.token;
        token.serverSessionExpiresAt = serverSession.expiresAt.toISOString();
      }
      return token;
    },
    async session({ session, token }) {
      const userId = token.userId ?? "";
      const valid = Boolean(userId && token.serverSessionToken && await validateServerSession(userId, token.serverSessionToken));
      session.serverSessionValid = valid;
      if (session.user) {
        session.user.id = valid ? userId : "";
        session.user.email = valid ? normalizeEmail(session.user.email) : "";
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && message.token?.userId && message.token.serverSessionToken) await revokeServerSession(message.token.userId, message.token.serverSessionToken);
    },
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: SERVER_SESSION_MAX_AGE_SECONDS },
    },
  },
  trustHost: true,
});
