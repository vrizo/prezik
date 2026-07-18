import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { RunOptions } from "@prezik/shared";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Logo } from "../../components/Logo";
import { Modal } from "../../components/ui/Modal";
import { PhaseStepper } from "../../components/ui/PhaseStepper";
import { getOrCreateAnonId } from "../../lib/anon";
import { errorMessage } from "../../lib/errors";
import { runPath } from "../../lib/paths";
import { canStartRun } from "./entitlement";
import { CredentialsFields, EMPTY_LOGIN_DRAFT, deriveCredentials, type CredentialsDraft } from "./CredentialsFields";
import { ConfirmNoCredsModal } from "./ConfirmNoCredsModal";
import { OptionsFields, type PersonalisationOptions } from "./OptionsFields";

const DEFAULT_PERSONALISATION: PersonalisationOptions = {
  voice: "neutral",
  zoom: true,
  length: "short",
  captions: true,
};

type Session = { sessionId: Id<"sessions">; credits: number; couponCode?: string };
type Props = { navigate: (path: string, opts?: { freshRun?: boolean }) => void };

export function LinkStepScreen({ navigate }: Props) {
  const url = new URLSearchParams(window.location.search).get("url") ?? "";

  if (!url.trim()) return <MinimalCard navigate={navigate} />;

  return <LinkStepForm url={url} navigate={navigate} />;
}

function MinimalCard({ navigate }: Props) {
  return (
    <div className="mx-auto my-14 max-w-[560px] px-4">
      <div className="flex flex-col items-center gap-4 rounded-[30px] border border-line bg-bg px-8 py-14 text-center">
        <h1 className="m-0 text-2xl font-bold tracking-[-0.02em]">Start with your app's link</h1>
        <p className="m-0 text-sm text-sub">We need a URL to explore before we can personalise a demo.</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="h-12 rounded-full bg-ink px-7 text-sm font-semibold text-white hover:bg-[#44403a]"
        >
          Go to Prezik
        </button>
      </div>
    </div>
  );
}

function LinkStepForm({ url, navigate }: { url: string } & Props) {
  const [anonId] = useState(getOrCreateAnonId);
  const [session, setSession] = useState<Session | null>(null);
  const [personalisation, setPersonalisation] = useState<PersonalisationOptions>(DEFAULT_PERSONALISATION);
  const [credDraft, setCredDraft] = useState<CredentialsDraft>(EMPTY_LOGIN_DRAFT);
  const [couponInput, setCouponInput] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const getOrCreateSession = useMutation(api.sessions.getOrCreate);
  const redeemCoupon = useMutation(api.sessions.redeemCoupon);
  const createRun = useMutation(api.runs.create);

  // One-time bootstrap of the anonymous session — a write, not a data
  // fetch, so this is the right tool.
  useEffect(() => {
    getOrCreateSession({ anonId }).then(setSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  const { credentials, error: credError } = deriveCredentials(credDraft);
  const hasCredentials = credentials.mode !== "none";
  const disabled = !session || submitting || credError !== null;

  async function handleApplyCoupon() {
    if (!session || !couponInput.trim()) return;
    setCouponMessage(null);
    try {
      const result = await redeemCoupon({ sessionId: session.sessionId, code: couponInput.trim() });
      setSession({ ...session, credits: result.credits, couponCode: result.couponCode });
      if (canStartRun(result.credits)) {
        setCouponOpen(false);
        continueStart();
      } else {
        setCouponMessage(`Applied — you have ${result.credits} credit${result.credits === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      setCouponMessage(errorMessage(err));
    }
  }

  async function doCreate(finalCredentials: RunOptions["credentials"]) {
    if (!session) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { runId } = await createRun({
        url,
        options: { ...personalisation, credentials: finalCredentials },
        sessionId: session.sessionId,
      });
      navigate(runPath(runId), { freshRun: true });
    } catch (err) {
      setSubmitError(errorMessage(err));
      setSubmitting(false);
    }
  }

  // The part of the start flow that runs once the session has credits:
  // confirm the no-credentials case, otherwise create the run.
  function continueStart() {
    if (credentials.mode === "none") {
      setConfirmOpen(true);
      return;
    }
    void doCreate(credentials);
  }

  function handleStartClick() {
    if (disabled || !session) return;
    if (!canStartRun(session.credits)) {
      setCouponOpen(true);
      return;
    }
    continueStart();
  }

  return (
    <div className="mx-auto my-14 max-w-[1120px] px-4">
      <div className="overflow-hidden rounded-[30px] border border-line bg-bg">
        <div className="flex flex-wrap items-center gap-3.5 border-b border-line px-[30px] py-5">
          <Logo size={30} />
          <div className="ml-3.5 flex items-center gap-2 rounded-full border border-line2 bg-white px-3.5 py-1.5">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-none text-faint"
              aria-hidden="true"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span className="text-[13px] font-semibold">{hostname}</span>
            <button
              type="button"
              onClick={() => navigate(`/?url=${encodeURIComponent(url)}`)}
              className="text-xs text-faint hover:text-ink"
            >
              edit
            </button>
          </div>
        </div>

        <div className="px-6 pb-[34px] pt-[30px] sm:px-10">
          <PhaseStepper phase="link" className="mb-[26px]" />

          <div className="mx-auto flex max-w-[620px] flex-col gap-5">
            <OptionsFields options={personalisation} onChange={setPersonalisation} />
            <CredentialsFields ref={emailRef} draft={credDraft} onChange={setCredDraft} error={credError} />

            {submitError && <p className="text-center text-sm text-red-600">{submitError}</p>}

            <div className="mt-1.5 flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={handleStartClick}
                disabled={disabled}
                className="inline-flex h-[52px] items-center gap-2 rounded-full bg-ink px-[30px] text-base font-semibold text-white hover:bg-[#44403a] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Starting…" : hasCredentials ? "Start creating" : "Start creating without test credentials"}
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </button>

              <span className="text-xs text-faint">
                Prezik starts exploring the moment you begin — pay per run
              </span>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={couponOpen}
        onClose={() => {
          setCouponOpen(false);
          setCouponMessage(null);
        }}
      >
        <h2 className="m-0 mb-2.5 text-[23px] font-bold tracking-[-0.02em]">Enter your coupon code</h2>
        <p className="m-0 mb-[22px] text-sm leading-[1.55] text-sub">
          Prezik is pay per run — apply a coupon to start this one.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleApplyCoupon();
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            placeholder="Coupon code"
            aria-label="Coupon code"
            className="h-12 min-w-0 flex-1 rounded-full border border-line2 bg-white px-4 text-sm text-ink outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={!couponInput.trim()}
            className="h-12 rounded-full bg-ink px-6 text-sm font-semibold text-white hover:bg-[#44403a] disabled:opacity-40"
          >
            Apply
          </button>
        </form>
        {couponMessage && <p className="mt-3 text-sm text-sub">{couponMessage}</p>}
      </Modal>

      <ConfirmNoCredsModal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          emailRef.current?.focus();
        }}
        onContinueAnyway={() => {
          setConfirmOpen(false);
          void doCreate({ mode: "none" });
        }}
      />
    </div>
  );
}
