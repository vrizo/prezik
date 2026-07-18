import { v, ConvexError } from "convex/values";
import { mutation } from "./_generated/server";

// Anonymous session: one row per browser (anonId in localStorage + cookie).
// credits is the only entitlement; a run consumes one when recording starts.
export const getOrCreate = mutation({
  args: { anonId: v.string() },
  returns: v.object({
    sessionId: v.id("sessions"),
    credits: v.number(),
    couponCode: v.optional(v.string()),
  }),
  handler: async (ctx, { anonId }) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_anonId", (q) => q.eq("anonId", anonId))
      .unique();
    if (existing) {
      return { sessionId: existing._id, credits: existing.credits, couponCode: existing.couponCode };
    }
    const sessionId = await ctx.db.insert("sessions", { anonId, credits: 0 });
    return { sessionId, credits: 0, couponCode: undefined };
  },
});

// Redeem a coupon code. tech-europe-hackathon is seeded at 100% off, which
// grants one credit. Errors are thrown with clear messages — no silent
// no-ops on a bad or exhausted code.
export const redeemCoupon = mutation({
  args: { sessionId: v.id("sessions"), code: v.string() },
  returns: v.object({ credits: v.number(), couponCode: v.string() }),
  handler: async (ctx, { sessionId, code }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new ConvexError("session not found");

    const coupon = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!coupon) throw new ConvexError(`coupon "${code}" does not exist`);
    if (coupon.redeemed >= coupon.maxRedemptions) {
      throw new ConvexError(`coupon "${code}" has no redemptions left`);
    }

    await ctx.db.patch(coupon._id, { redeemed: coupon.redeemed + 1 });
    const credits = coupon.percentOff === 100 ? session.credits + 1 : session.credits;
    await ctx.db.patch(sessionId, { couponCode: code, credits });
    return { credits, couponCode: code };
  },
});
