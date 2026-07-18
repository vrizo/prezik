import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import type { RunOptions } from "@prezik/shared";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getOrCreateAnonId } from "../../lib/anon";
import { errorMessage } from "../../lib/errors";
import { runPath } from "../../lib/paths";
import { canStartRun } from "./entitlement";
import { CredentialsFields } from "./CredentialsFields";
import { OptionsFields } from "./OptionsFields";

const DEFAULT_OPTIONS: RunOptions = {
  voice: "neutral",
  zoom: true,
  length: "short",
  captions: true,
  credentials: { mode: "none" },
};

type Session = { sessionId: Id<"sessions">; credits: number; couponCode?: string };

type Props = { navigate: (path: string) => void };

export function StartScreen({ navigate }: Props) {
  const [anonId] = useState(getOrCreateAnonId);
  const [session, setSession] = useState<Session | null>(null);
  const [url, setUrl] = useState(() => new URLSearchParams(window.location.search).get("url") ?? "");
  const [options, setOptions] = useState<RunOptions>(DEFAULT_OPTIONS);
  const [couponInput, setCouponInput] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const getOrCreateSession = useMutation(api.sessions.getOrCreate);
  const redeemCoupon = useMutation(api.sessions.redeemCoupon);
  const createRun = useMutation(api.runs.create);

  // One-time bootstrap of the anonymous session — a write, not a data
  // fetch, so this is the right tool (see src/features/run for the actual
  // reactive-query-driven state).
  useEffect(() => {
    getOrCreateSession({ anonId }).then(setSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApplyCoupon() {
    if (!session || !couponInput.trim()) return;
    setCouponMessage(null);
    try {
      const result = await redeemCoupon({ sessionId: session.sessionId, code: couponInput.trim() });
      setSession({ ...session, credits: result.credits, couponCode: result.couponCode });
      setCouponMessage(`Applied — you have ${result.credits} credit${result.credits === 1 ? "" : "s"}.`);
    } catch (err) {
      setCouponMessage(errorMessage(err));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !url.trim()) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { runId } = await createRun({ url: url.trim(), options, sessionId: session.sessionId });
      navigate(runPath(runId));
    } catch (err) {
      setSubmitError(errorMessage(err));
      setSubmitting(false);
    }
  }

  const ready = session !== null;
  const canSubmit = ready && url.trim().length > 0 && canStartRun(session.credits) && !submitting;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Prezik</h1>
        <p className="mt-2 text-ink-soft">
          Paste a link to your web app. Four agents research it, map it, write a storyboard, and film a
          narrated demo video.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="url" className="text-sm font-medium text-ink">
            Your app's URL
          </label>
          <input
            id="url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.com"
            className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-ink outline-none focus:border-accent"
          />
        </div>

        <CredentialsFields
          credentials={options.credentials}
          onChange={(credentials) => setOptions((o) => ({ ...o, credentials }))}
        />

        <OptionsFields options={options} onChange={setOptions} />

        <div className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white p-4">
          <label htmlFor="coupon" className="text-sm font-medium text-ink">
            Coupon code
          </label>
          <div className="flex gap-2">
            <input
              id="coupon"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="tech-europe-hackathon"
              className="flex-1 rounded-xl border border-ink/10 px-3 py-2 outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={handleApplyCoupon}
              disabled={!ready || !couponInput.trim()}
              className="rounded-xl border border-ink/20 px-4 py-2 font-medium text-ink hover:border-accent disabled:opacity-50"
            >
              Apply
            </button>
          </div>
          <p className="text-sm text-ink-soft">{couponMessage ?? `Credits: ${session?.credits ?? 0}`}</p>
        </div>

        {submitError && <p className="text-sm text-red-600">{submitError}</p>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-2xl bg-accent px-6 py-4 text-lg font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Starting…" : "Fetch my demo"}
        </button>
        {ready && !canStartRun(session.credits) && (
          <p className="text-center text-sm text-ink-soft">
            You need a credit to start a run — apply a coupon above.
          </p>
        )}
      </form>
    </main>
  );
}
