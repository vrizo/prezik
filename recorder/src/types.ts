import { z } from "zod";
import { Storyboard } from "@prezik/shared";

// Credentials, same shape as RunOptions.credentials in the shared contract.
export const Credentials = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("login"), email: z.string(), password: z.string() }),
  z.object({ mode: z.literal("signup"), emailDomain: z.string() }),
]);
export type Credentials = z.infer<typeof Credentials>;

// Video orientation. Vertical records a 720x1280 CSS viewport (mobile-ish
// layout) and outputs 1080x1920; horizontal is the classic 1280x720 -> 1920x1080.
// Mapping and recording MUST use the same viewport: selectors are harvested
// from the mapped layout, and responsive pages restructure their DOM per width.
export const VideoFormat = z.enum(["horizontal", "vertical"]);
export type VideoFormat = z.infer<typeof VideoFormat>;

export function viewportFor(format: VideoFormat): { width: number; height: number } {
  return format === "vertical" ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

// Device-pixel output size (viewport * deviceScaleFactor 1.5).
export function outputSizeFor(format: VideoFormat): { width: number; height: number } {
  return format === "vertical" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

export const MapRequest = z.object({
  runId: z.string(),
  callbackUrl: z.string().url(),
  runToken: z.string(),
  url: z.string().url(),
  credentials: Credentials,
  format: VideoFormat,
});
export type MapRequest = z.infer<typeof MapRequest>;

export const RecordOptions = z.object({
  voice: z.enum(["male", "female", "neutral"]),
  zoom: z.boolean(),
  captions: z.boolean(),
  format: VideoFormat,
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
