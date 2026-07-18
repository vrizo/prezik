// Round blurred gradient ball + grain overlay + optional white play button.
// Gradient stacks copied verbatim from design-orb.html. Size/shape is
// controlled by the parent via `className` (square, any border-radius the
// parent sets is overridden by the orb's own full rounding).
export type OrbTheme = "orange" | "purple" | "blue" | "mono";

const ORB_GRADIENTS: Record<OrbTheme, string> = {
  orange:
    "radial-gradient(58% 54% at 62% 28%,#ffd3a2 0,transparent 55%),radial-gradient(56% 56% at 38% 54%,#ff7f34 0,transparent 55%),radial-gradient(72% 70% at 56% 82%,#cf2f0b 0,transparent 60%),radial-gradient(58% 58% at 24% 78%,#5c1604 0,transparent 60%),linear-gradient(135deg,#ff9c52,#c62a06)",
  purple:
    "radial-gradient(54% 54% at 34% 30%,#f2b3ff 0,transparent 55%),radial-gradient(60% 60% at 66% 42%,#8a7bff 0,transparent 55%),radial-gradient(60% 60% at 52% 80%,#4f6bff 0,transparent 60%),radial-gradient(50% 50% at 24% 70%,#d05cff 0,transparent 55%),linear-gradient(135deg,#c39bff,#5b6bff)",
  blue: "radial-gradient(54% 54% at 30% 30%,#a6d4ff 0,transparent 55%),radial-gradient(60% 60% at 70% 45%,#4a7bff 0,transparent 55%),radial-gradient(62% 60% at 56% 82%,#ff6a3d 0,transparent 60%),radial-gradient(50% 50% at 22% 80%,#242a63 0,transparent 60%),linear-gradient(135deg,#7fb0ff,#2a3aa0)",
  mono: "radial-gradient(54% 54% at 35% 30%,#eef1ec 0,transparent 55%),radial-gradient(60% 60% at 66% 46%,#cfd6cb 0,transparent 55%),radial-gradient(60% 60% at 55% 82%,#9aa79a 0,transparent 60%),linear-gradient(135deg,#e9ede7,#a9b2a5)",
};

const ORB_SATURATE: Record<OrbTheme, number> = {
  orange: 1.08,
  purple: 1.08,
  blue: 1.08,
  mono: 1.02,
};

type Props = {
  theme: OrbTheme;
  play?: boolean;
  className?: string;
};

// The outer div carries the caller's classes (size and positioning — callers
// pass `absolute …` for floating orbs, so the shell must not hardcode
// `relative`, which would win the cascade regardless of class order). The
// inner div is the orb itself.
export function Orb({ theme, play = false, className = "" }: Props) {
  return (
    <div className={className}>
      {/* translateZ(0) forces the rounded clip onto its own layer — without it
          Safari lets the blurred child paint outside the border-radius. */}
      <div
        className="relative isolate h-full w-full overflow-hidden rounded-full"
        style={{ transform: "translateZ(0)" }}
      >
        <div
          className="absolute rounded-full"
          style={{
            inset: "-16%",
            filter: `blur(9px) saturate(${ORB_SATURATE[theme]})`,
            background: ORB_GRADIENTS[theme],
          }}
        />
        <div className="bg-grain pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay" />
        {play && (
          <div
            className="absolute left-1/2 top-1/2 grid aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white"
            style={{ boxShadow: "0 4px 16px rgba(0,0,0,.2)" }}
          >
            <svg viewBox="0 0 24 24" fill="#111" style={{ width: "38%" }} aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
