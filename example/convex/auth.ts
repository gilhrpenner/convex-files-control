import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Id } from "./_generated/dataModel";

/**
 * Demo-only provider that allows impersonating any user by their ID.
 * DO NOT use in production!
 */
const DemoImpersonate = ConvexCredentials({
  id: "demo-impersonate",
  authorize: async (credentials) => {
    const userId = credentials.userId as Id<"users">;
    if (!userId) return null;
    return { userId };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, DemoImpersonate],
});
