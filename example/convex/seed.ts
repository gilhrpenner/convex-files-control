import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Internal-only setup for a fresh shared demo. Existing users are left alone.
export const demoUsers = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if ((await ctx.db.query("users").take(1)).length === 0) {
      await ctx.db.insert("users", { name: "Alice (demo)" });
      await ctx.db.insert("users", { name: "Bob (demo)" });
    }
    return null;
  },
});
