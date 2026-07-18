import { internalMutation } from "./_generated/server";
import { SCOUT_PROMPT_TEXT, SCOUT_PROMPT_VERSION } from "./prompts/scout";
import { DIRECTOR_PROMPT_TEXT, DIRECTOR_PROMPT_VERSION } from "./prompts/director";

// One-time setup data. Safe to run more than once — existing rows are left
// alone rather than duplicated. Run with: npx convex run seed:run
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingCoupon = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", "tech-europe-hackathon"))
      .unique();
    if (!existingCoupon) {
      await ctx.db.insert("coupons", {
        code: "tech-europe-hackathon",
        percentOff: 100,
        maxRedemptions: 500,
        redeemed: 0,
      });
      console.log("seeded coupon tech-europe-hackathon");
    } else {
      console.log("coupon tech-europe-hackathon already exists, left as is");
    }

    // Only Scout and Director prompts live in this app (Mapper/Presenter
    // prompts are owned by recorder/).
    const prompts = [
      { agent: "scout", version: SCOUT_PROMPT_VERSION, text: SCOUT_PROMPT_TEXT },
      { agent: "director", version: DIRECTOR_PROMPT_VERSION, text: DIRECTOR_PROMPT_TEXT },
    ];
    for (const p of prompts) {
      const existing = await ctx.db
        .query("prompts")
        .filter((q) => q.and(q.eq(q.field("agent"), p.agent), q.eq(q.field("version"), p.version)))
        .unique();
      if (!existing) {
        // A new version supersedes older rows for the same agent.
        const older = await ctx.db
          .query("prompts")
          .filter((q) => q.eq(q.field("agent"), p.agent))
          .collect();
        for (const row of older) {
          if (row.active) await ctx.db.patch(row._id, { active: false });
        }
        await ctx.db.insert("prompts", { ...p, active: true });
        console.log(`seeded prompt ${p.agent} v${p.version}${older.length ? ` (deactivated ${older.length} older)` : ""}`);
      } else {
        console.log(`prompt ${p.agent} v${p.version} already exists, left as is`);
      }
    }
    return null;
  },
});
