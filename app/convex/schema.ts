import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  agentNameValidator,
  pageElementValidator,
  planProgressSceneValidator,
  runEventLevelValidator,
  runOptionsValidator,
  runStatusValidator,
  storyboardValidator,
} from "./lib/validators";

export default defineSchema({
  sessions: defineTable({
    anonId: v.string(),
    credits: v.number(),
    couponCode: v.optional(v.string()),
  }).index("by_anonId", ["anonId"]),

  runs: defineTable({
    sessionId: v.id("sessions"),
    url: v.string(),
    options: runOptionsValidator,
    status: runStatusValidator,
    brief: v.optional(v.string()),
    needsCredentialsReason: v.optional(v.string()),
    credentialsUsed: v.optional(v.object({ email: v.string(), password: v.string() })),
    playbackUrl: v.optional(v.string()),
    captionsUrl: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    error: v.optional(v.string()),
    runTokenHash: v.string(),
    guidance: v.optional(v.string()),
  }),

  run_events: defineTable({
    runId: v.id("runs"),
    seq: v.number(),
    agent: agentNameValidator,
    level: runEventLevelValidator,
    message: v.string(),
    url: v.optional(v.string()),
    screenshotId: v.optional(v.id("_storage")),
    sceneId: v.optional(v.string()),
  }).index("by_run", ["runId", "seq"]),

  site_pages: defineTable({
    runId: v.id("runs"),
    url: v.string(),
    title: v.string(),
    purpose: v.string(),
    screenshotId: v.optional(v.id("_storage")),
    linksTo: v.array(v.string()),
    elements: v.array(pageElementValidator),
  }).index("by_run", ["runId"]),

  storyboards: defineTable({
    runId: v.id("runs"),
    data: storyboardValidator,
  }).index("by_run", ["runId"]),

  // Live scratch row the Director writes while it streams the plan: the model's
  // running reasoning summary, the scenes drafted so far, and whether reasoning
  // has finished (the model has started emitting the storyboard JSON). Deleted
  // once the real storyboard is saved.
  plan_progress: defineTable({
    runId: v.id("runs"),
    thinking: v.string(),
    thinkingDone: v.boolean(),
    scenes: v.array(planProgressSceneValidator),
  }).index("by_run", ["runId"]),

  coupons: defineTable({
    code: v.string(),
    percentOff: v.number(),
    maxRedemptions: v.number(),
    redeemed: v.number(),
  }).index("by_code", ["code"]),

  prompts: defineTable({
    agent: v.string(),
    version: v.number(),
    text: v.string(),
    active: v.boolean(),
  }),
});
