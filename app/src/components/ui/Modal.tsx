import type { ReactNode } from "react";

// Centered white rounded-[22px] card over rgba(20,18,16,.42) overlay.
type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function Modal({ open, onClose, children, className = "" }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,18,16,.42)] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[460px] rounded-[22px] bg-white p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,.35)] ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
