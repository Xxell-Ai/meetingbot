import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { db } from "~/server/db";
import { env } from "~/env";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers: [GitHub],
  session: {
    strategy: "database",
  },
  adapter: DrizzleAdapter(db),
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      // Check if ALLOWED_GITHUB_USERS is configured
      if (env.ALLOWED_GITHUB_USERS) {
        const allowedUsers = env.ALLOWED_GITHUB_USERS.split(',').map(u => u.trim().toLowerCase());
        // GitHub profile has a login field, fallback to user.name
        const githubUsername = (profile as any)?.login?.toLowerCase() || user.name?.toLowerCase() || '';

        if (!allowedUsers.includes(githubUsername)) {
          console.log(`Access denied for GitHub user: ${githubUsername}`);
          return false; // Deny access
        }

        console.log(`Access granted for whitelisted GitHub user: ${githubUsername}`);
      }

      return true; // Allow access
    },
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
  },
} satisfies NextAuthConfig;
