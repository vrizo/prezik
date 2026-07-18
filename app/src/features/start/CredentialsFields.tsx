import { forwardRef } from "react";
import type { RunOptions } from "@prezik/shared";

// Local editing state for the "Test credentials" card. Kept separate from
// RunOptions["credentials"] because the login variant needs to represent a
// *partial* fill (one field typed, the other blank) so the screen can warn
// instead of silently dropping it — RunOptions's discriminated union has no
// way to express that.
export type CredentialsDraft =
  | { mode: "login"; email: string; password: string }
  | { mode: "signup"; emailDomain: string };

export const EMPTY_LOGIN_DRAFT: CredentialsDraft = { mode: "login", email: "", password: "" };
export const EMPTY_SIGNUP_DRAFT: CredentialsDraft = { mode: "signup", emailDomain: "" };

// Pure derivation: both login fields filled -> login credentials; signup
// domain filled -> signup credentials; everything blank -> none; exactly one
// login field filled -> blocked, surfaced via `error`.
export function deriveCredentials(draft: CredentialsDraft): {
  credentials: RunOptions["credentials"];
  error: string | null;
} {
  if (draft.mode === "login") {
    const email = draft.email.trim();
    const password = draft.password.trim();
    if (email && password) return { credentials: { mode: "login", email, password }, error: null };
    if (!email && !password) return { credentials: { mode: "none" }, error: null };
    return {
      credentials: { mode: "none" },
      error: "Enter both a test email and password, or leave both blank.",
    };
  }
  const emailDomain = draft.emailDomain.trim();
  if (emailDomain) return { credentials: { mode: "signup", emailDomain }, error: null };
  return { credentials: { mode: "none" }, error: null };
}

type Props = {
  draft: CredentialsDraft;
  onChange: (draft: CredentialsDraft) => void;
  error: string | null;
};

export const CredentialsFields = forwardRef<HTMLInputElement, Props>(function CredentialsFields(
  { draft, onChange, error },
  emailRef,
) {
  return (
    <div className="rounded-[18px] border border-line bg-white p-[24px_26px]">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-chip text-[12px] font-bold">
          2
        </span>
        <span className="whitespace-nowrap text-[17px] font-bold">Test credentials</span>
        <span className="rounded-full bg-chip px-[9px] py-0.5 text-[12px] font-semibold text-faint">Optional</span>
      </div>
      <p className="m-0 mb-4 ml-[30px] text-[13px] text-sub">
        Add a test login so the demo shows real data instead of an empty state
      </p>

      {draft.mode === "login" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Test email">
            <input
              ref={emailRef}
              type="email"
              placeholder="demo@your-app.com"
              value={draft.email}
              onChange={(e) => onChange({ mode: "login", email: e.target.value, password: draft.password })}
              className="h-[46px] w-full rounded-full border border-line2 bg-white px-4 text-sm text-ink outline-none focus:border-ink"
            />
          </Field>
          <Field label="Test password">
            <input
              type="password"
              placeholder="Test password"
              value={draft.password}
              onChange={(e) => onChange({ mode: "login", email: draft.email, password: e.target.value })}
              className="h-[46px] w-full rounded-full border border-line2 bg-white px-4 text-sm text-ink outline-none focus:border-ink"
            />
          </Field>
        </div>
      ) : (
        <Field label="Email domain">
          <input
            ref={emailRef}
            placeholder="your-app.com"
            value={draft.emailDomain}
            onChange={(e) => onChange({ mode: "signup", emailDomain: e.target.value })}
            className="h-[46px] w-full rounded-full border border-line2 bg-white px-4 text-sm text-ink outline-none focus:border-ink"
          />
        </Field>
      )}

      {error && <p className="mt-2.5 text-xs font-medium text-[#b2551a]">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-faint">Used once for this run, then deleted</span>
        {draft.mode === "login" ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_SIGNUP_DRAFT)}
            className="whitespace-nowrap text-xs font-semibold text-sub underline decoration-line2 underline-offset-2 hover:text-ink"
          >
            No test account? Let Prezik sign up itself
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange(EMPTY_LOGIN_DRAFT)}
            className="whitespace-nowrap text-xs font-semibold text-sub underline decoration-line2 underline-offset-2 hover:text-ink"
          >
            Have a test account? Use login instead
          </button>
        )}
      </div>
    </div>
  );
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-sub">{label}</div>
      {children}
    </div>
  );
}
