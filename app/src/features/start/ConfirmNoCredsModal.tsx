import { Modal } from "../../components/ui/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onContinueAnyway: () => void;
};

// Design "Confirm" screen (2b) — shown when the user tries to start a run
// with credentials.mode "none". "Add test credentials" just closes the
// modal so the caller can refocus the email field; "Continue anyway"
// actually starts the run logged out.
export function ConfirmNoCredsModal({ open, onClose, onContinueAnyway }: Props) {
  return (
    <Modal open={open} onClose={onClose}>
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
      <h2 className="m-0 mb-2.5 text-[23px] font-bold tracking-[-0.02em]">Continue without test credentials?</h2>
      <p className="m-0 mb-[22px] text-sm leading-[1.55] text-sub">
        Prezik will record the logged-out experience. If your best features live behind a login or a paywall, they
        won't appear — most paid products look empty without a sign-in. Adding a test account makes for a far
        stronger demo.
      </p>
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 rounded-full bg-ink text-[15px] font-semibold text-white hover:bg-[#44403a]"
        >
          Add test credentials
        </button>
        <button
          type="button"
          onClick={onContinueAnyway}
          className="h-12 rounded-full border border-line2 bg-white text-[15px] font-semibold text-ink hover:bg-chip"
        >
          Continue anyway
        </button>
      </div>
    </Modal>
  );
}
