import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getOrCreateAnonId } from "../../lib/anon";
import { errorMessage } from "../../lib/errors";

type Session = { sessionId: Id<"sessions">; credits: number; couponCode?: string };

type Pack = { runs: number; price: number; perRun?: string; badge?: string };

// Prices/labels copied verbatim from the design (Ready screen, right card).
const PACKS: Pack[] = [
  { runs: 5, price: 19, perRun: "$3.80 ea" },
  { runs: 15, price: 49, badge: "value" },
  { runs: 40, price: 99, perRun: "$2.48 ea" },
];

const DEFAULT_PACK_INDEX = 1; // "15 runs — value" is pre-selected in the design.

export function TopUpPanel() {
  const [anonId] = useState(getOrCreateAnonId);
  const [session, setSession] = useState<Session | null>(null);
  const [selectedPack, setSelectedPack] = useState(DEFAULT_PACK_INDEX);
  const [showPaymentsNote, setShowPaymentsNote] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);

  const getOrCreateSession = useMutation(api.sessions.getOrCreate);
  const redeemCoupon = useMutation(api.sessions.redeemCoupon);

  // One-time bootstrap of the anonymous session — a write, not a data
  // fetch — same pattern as LinkStepScreen.
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
      setCouponMessage(`Applied — you have ${result.credits} runs.`);
    } catch (err) {
      setCouponMessage(errorMessage(err));
    }
  }

  const pack = PACKS[selectedPack];

  return (
    <div className="rounded-[22px] border border-line bg-[#ece9e3] p-6">
      <h3 className="m-0 text-[22px] font-bold tracking-[-0.02em]">Top up your runs</h3>
      <p className="mb-4 mt-1 text-[13px] text-sub">No subscription — runs never expire</p>

      <div className="flex flex-col gap-[10px]" role="radiogroup" aria-label="Run pack">
        {PACKS.map((p, index) => {
          const isSelected = index === selectedPack;
          return (
            <label
              key={p.runs}
              className={`flex cursor-pointer items-center justify-between rounded-[14px] bg-white px-4 py-[14px] ${
                isSelected ? "border-2 border-ink" : "border border-line2"
              }`}
            >
              <input
                type="radio"
                name="run-pack"
                className="sr-only"
                checked={isSelected}
                onChange={() => setSelectedPack(index)}
              />
              <span className="text-[15px] font-semibold">
                {p.runs} runs{" "}
                {p.badge && (
                  <span className="ml-1 rounded-[6px] bg-ink px-[7px] py-[2px] text-[11px] font-bold text-white">
                    {p.badge}
                  </span>
                )}
                {p.perRun && <span className="text-[12px] font-medium text-faint"> — {p.perRun}</span>}
              </span>
              <span className="text-[16px] font-bold">${p.price}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-[14px] flex gap-2">
        <input
          value={couponInput}
          onChange={(e) => setCouponInput(e.target.value)}
          placeholder="Coupon code"
          aria-label="Coupon code"
          className="h-11 flex-1 rounded-full border border-line2 bg-white px-[14px] text-sm text-ink outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={handleApplyCoupon}
          disabled={!session || !couponInput.trim()}
          className="rounded-full border border-line2 bg-white px-[18px] text-sm font-semibold text-ink hover:bg-chip disabled:opacity-50"
        >
          Apply
        </button>
      </div>

      {(couponMessage || session) && (
        <p className="mt-2 text-[13px] text-sub">
          {couponMessage ??
            `You have ${session?.credits} run${session?.credits === 1 ? "" : "s"}.`}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowPaymentsNote(true)}
        className="mt-[10px] w-full rounded-full bg-ink py-[13px] text-[15px] font-semibold text-white hover:bg-[#44403a]"
      >
        Get {pack.runs} runs — ${pack.price}
      </button>
      {showPaymentsNote && (
        <p className="mt-2 text-[13px] text-sub">Payments are coming soon — use a coupon for now.</p>
      )}
    </div>
  );
}
