import { Modal } from "../../components/ui/Modal";

type Props = {
  open: boolean;
  reason?: string;
  onAddCredentials: () => void;
  onBackToStart: () => void;
};

// Terminal "needs a sign-in" state: a modal over the dimmed Creating card,
// asking the user to start a fresh run with test credentials.
export function NeedsCredentials({ open, reason, onAddCredentials, onBackToStart }: Props) {
  return (
    <Modal open={open} onClose={() => {}}>
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#fdeede]">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#b2551a"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <h2 className="mb-[10px] text-[23px] font-bold tracking-[-0.02em]">This demo needs a sign-in</h2>
      <p className="mb-[22px] text-[14px] leading-[1.55] text-sub">
        {reason ??
          "This product hides its best features behind a login. Start a fresh run with test credentials so the demo shows the real product."}
      </p>
      <div className="flex flex-col gap-[10px]">
        <button
          type="button"
          onClick={onAddCredentials}
          className="h-12 rounded-full bg-ink text-[15px] font-semibold text-white hover:bg-[#44403a]"
        >
          Add test credentials
        </button>
        <button
          type="button"
          onClick={onBackToStart}
          className="h-12 rounded-full border border-line2 bg-white text-[15px] font-semibold text-ink hover:bg-chip"
        >
          Back to start
        </button>
      </div>
    </Modal>
  );
}
