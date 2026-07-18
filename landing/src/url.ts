// URL handling for the "Fetch my demo" form.
// Kept free of import.meta.env so it can run under plain Node in tests
// (Vite is the only thing that understands import.meta.env at build time).

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

/**
 * Loosely parse whatever the user typed into a web app URL.
 * Adds https:// when no scheme was given, then requires it to parse as a
 * real http(s) URL. Throws with a short, user-facing message otherwise.
 */
export function parseAppUrl(rawInput: string): URL {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("Paste a URL first.");
  }

  const withScheme = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Use an http or https link.");
  }

  return parsed;
}

/**
 * Build the redirect URL to the app, carrying the target site along as
 * ?url=. Throws the same validation errors as parseAppUrl.
 */
export function buildAppRedirectUrl(rawInput: string, appBaseUrl: string): string {
  const target = parseAppUrl(rawInput);
  return `${appBaseUrl}/?url=${encodeURIComponent(target.toString())}`;
}
