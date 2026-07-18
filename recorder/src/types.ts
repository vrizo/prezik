import { z } from "zod";
import { Storyboard } from "@prezik/shared";

// Credentials, same shape as RunOptions.credentials in the shared contract.
export const Credentials = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("login"), email: z.string(), password: z.string() }),
  z.object({ mode: z.literal("signup"), emailDomain: z.string() }),
]);
export type Credentials = z.infer<typeof Credentials>;

export const MapRequest = z.object({
  runId: z.string(),
  callbackUrl: z.string().url(),
  runToken: z.string(),
  url: z.string().url(),
  credentials: Credentials,
});
export type MapRequest = z.infer<typeof MapRequest>;

export const RecordOptions = z.object({
  voice: z.enum(["male", "female", "neutral"]),
  zoom: z.boolean(),
  captions: z.boolean(),
});
export type RecordOptions = z.infer<typeof RecordOptions>;

export const RecordRequest = z.object({
  runId: z.string(),
  callbackUrl: z.string().url(),
  runToken: z.string(),
  storyboard: Storyboard,
  options: RecordOptions,
  credentials: Credentials.optional(),
});
export type RecordRequest = z.infer<typeof RecordRequest>;
