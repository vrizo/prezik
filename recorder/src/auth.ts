import type { Page } from "playwright";
import type { Emitter } from "./callbacks.js";
import type { Logger } from "./log.js";
import type { Credentials } from "./types.js";
import { randomPassword, timestampId } from "./util.js";

export interface AuthOpts {
  // strict: throw when a sign-in form was found but rejected the credentials
  // (recording a wrong-password run must fail loudly). A site with NO sign-in
  // form is never fatal for either caller: credentials are optional, so the
  // demo simply proceeds with what is public.
  strict: boolean;
  agent: "mapper" | "presenter";
}

// Best-effort login/signup: find the auth link, fill email/password, submit.
// Returns the credentials used, or null when no auth was performed (mode "none",
// or a non-strict caller hit a missing form).
export async function performAuth(
  page: Page,
  credentials: Credentials,
  emit: Emitter,
  log: Logger,
  opts: AuthOpts,
): Promise<{ email: string; password: string } | null> {
  if (credentials.mode === "none") return null;
  const mode = credentials.mode;

  // Navigate by href, never by click: marketing pages open auth pages with
  // target="_blank", and a click would leave this page behind in a popup.
  const LOGIN_LINKS = ['a[href*="login" i]', 'a[href*="signin" i]', 'a[href*="sign-in" i]'];
  const SIGNUP_LINKS = ['a[href*="signup" i]', 'a[href*="sign-up" i]', 'a[href*="register" i]', 'a[href*="join" i]'];
  const firstHref = async (selectors: string[]): Promise<string | null> => {
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        const href = await el.getAttribute("href");
        if (href) return new URL(href, page.url()).toString();
      }
    }
    return null;
  };
  const gotoAuth = async (href: string) => {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 20000 });
    // Auth pages are often client-rendered SPAs: give the form time to appear.
    await page
      .locator('input[type="email"], input[type="password"]')
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => {});
  };

  // Landing pages often expose only the opposite entry point (e.g. just a
  // "Get started" signup link when we need login) — the auth pages themselves
  // link to each other, so follow the other entry and hop once from there.
  let navigated = false;
  const preferred = mode === "login" ? LOGIN_LINKS : SIGNUP_LINKS;
  const opposite = mode === "login" ? SIGNUP_LINKS : LOGIN_LINKS;
  const direct = await firstHref(preferred);
  if (direct) {
    await gotoAuth(direct);
    navigated = true;
  } else {
    const indirect = await firstHref(opposite);
    if (indirect) {
      await gotoAuth(indirect);
      navigated = true;
      const hop = await firstHref(preferred);
      if (hop) await gotoAuth(hop);
    }
  }

  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i]').first();
  const passInput = page.locator('input[type="password"]').first();
  const noEmail = (await emailInput.count()) === 0;
  const noPass = (await passInput.count()) === 0;
  if (noEmail || noPass) {
    const missing = [noEmail ? "email input" : "", noPass ? "password input" : ""].filter(Boolean).join(" and ");
    const core = `${mode}: ${navigated ? "" : "no auth link found; "}${missing} not found at ${page.url()}`;
    const msg = `${core}; continuing with public pages`;
    await emit.emit({ kind: "event", event: { agent: opts.agent, level: "info", message: msg, url: page.url() } });
    log.info(msg);
    return null;
  }

  let email: string;
  let password: string;
  if (mode === "signup") {
    email = `${timestampId()}@${credentials.emailDomain}`;
    password = randomPassword(16);
  } else {
    email = credentials.email;
    password = credentials.password;
  }
  await emailInput.fill(email);
  await passInput.fill(password);
  const submitRe = mode === "login" ? /log ?in|sign ?in/i : /sign ?up|create account|register/i;
  const submit = page.locator('button[type="submit"], input[type="submit"]').first();
  const namedButton = page.getByRole("button", { name: submitRe }).first();
  if ((await submit.count()) > 0) await submit.click({ timeout: 8000 }).catch(() => {});
  else if ((await namedButton.count()) > 0) await namedButton.click({ timeout: 8000 }).catch(() => {});
  else await passInput.press("Enter");
  // Wait for the app to accept the sign-in (SPA auth roundtrip + redirect):
  // done when the password field leaves the screen, bounded at 10s.
  await passInput.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  log.info(`${mode} submitted as ${email}`);
  if (mode === "signup") await emit.emit({ kind: "credentials", email, password });

  // Strict callers need sign-in to have actually happened: a password input
  // still on screen means the form was rejected, not accepted.
  if (opts.strict && (await page.locator('input[type="password"]').count()) > 0) {
    throw new Error(`sign-in appears to have failed — still on a login form at ${page.url()}`);
  }

  return { email, password };
}

// Dismiss a cookie-consent banner by picking the privacy-preserving choice
// (decline non-essential), so it neither shows up in the recorded video nor
// intercepts clicks. Consent persists per browser context, so one dismissal
// during the off-camera pre-roll covers all scenes. Returns whether a banner
// was dismissed; no banner is simply false, not an error.
export async function dismissConsentBanner(page: Page, log: Logger): Promise<boolean> {
  const decline = page
    .getByRole("button", { name: /essential only|only necessary|necessary only|reject all|decline/i })
    .first();
  if ((await decline.count()) === 0) return false;
  try {
    await decline.click({ timeout: 3000 });
  } catch {
    return false; // banner present but not clickable; leave it rather than fight it
  }
  await page.waitForTimeout(300);
  log.info("cookie banner dismissed (declined non-essential)");
  return true;
}
