// Absolutely-positioned colorful gradient stack + grain layer. Fills its
// parent (`absolute inset-0`) — the parent must be `position: relative`.
// Gradient stacks copied verbatim from design-prezik.html.
export type BackdropVariant = "creating" | "player";

const BACKDROP_GRADIENTS: Record<BackdropVariant, string> = {
  // Orange/blue radial stack used on the Explore/Plan/Record (Creating) screens.
  creating:
    "radial-gradient(60% 60% at 18% 22%,#ff8a4d 0,transparent 55%),radial-gradient(55% 55% at 82% 18%,#3f63d6 0,transparent 55%),radial-gradient(70% 70% at 75% 88%,#d43410 0,transparent 60%),radial-gradient(60% 60% at 20% 90%,#2a3a86 0,transparent 60%),linear-gradient(135deg,#ff7a33,#3a55c0)",
  // Warm orange stack used inside the Ready screen's video placeholder.
  player:
    "radial-gradient(60% 55% at 60% 30%,#ffd3a2 0,transparent 55%),radial-gradient(55% 55% at 35% 55%,#ff7f34 0,transparent 55%),radial-gradient(72% 70% at 60% 85%,#cf2f0b 0,transparent 60%),linear-gradient(135deg,#ff9c52,#b52605)",
};

const BACKDROP_GRAIN_OPACITY: Record<BackdropVariant, number> = {
  creating: 0.45,
  player: 0.4,
};

type Props = {
  variant: BackdropVariant;
  // "fixed" pins the backdrop to the viewport so it covers the whole page
  // (including the footer area below the screen's own container).
  attachment?: "absolute" | "fixed";
  className?: string;
};

export function GradientBackdrop({ variant, attachment = "absolute", className = "" }: Props) {
  return (
    <div className={`${attachment} inset-0 ${className}`}>
      <div
        className="absolute inset-0"
        style={{ filter: "saturate(1.05)", background: BACKDROP_GRADIENTS[variant] }}
      />
      <div
        className="bg-grain pointer-events-none absolute inset-0 mix-blend-overlay"
        style={{ opacity: BACKDROP_GRAIN_OPACITY[variant] }}
      />
    </div>
  );
}
