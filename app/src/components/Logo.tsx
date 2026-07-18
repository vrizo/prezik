import mark from "../assets/prezik-mark.png";

// The horizontal lockup from the logo design (Logo.dc.html, 5b): ink rounded
// tile holding the dog mark, hand-drawn "prezik" wordmark beside it. `tone`
// picks the wordmark color for light vs dark surfaces; the tile stays ink.
type Props = {
  tone?: "ink" | "cream";
  size?: number; // tile side in px; the wordmark scales with it
  className?: string;
};

export function Logo({ tone = "ink", size = 34, className = "" }: Props) {
  const stroke = tone === "ink" ? "#161514" : "#f4f2ee";
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span
        className="grid flex-none place-items-center rounded-[26%] bg-ink"
        style={{ width: size, height: size }}
      >
        <img src={mark} alt="" style={{ width: size * 0.78, height: size * 0.78 }} />
      </span>
      <svg
        viewBox="0 0 250 82"
        style={{ height: size * 0.62 }}
        fill="none"
        stroke={stroke}
        strokeWidth={11}
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="Prezik"
      >
        <path d="M15 60 L15 16 C47 8 53 42 17 42" />
        <path d="M55 68 L55 38" />
        <path d="M55 45 C66 34 80 34 86 43" />
        <path d="M98 51 L128 51 C130 35 99 32 98 50 C97 67 121 69 132 57" />
        <path d="M141 40 L173 40 L143 68 L175 68" />
        <path d="M187 34 L187 62" />
        <path d="M206 20 L206 68" />
        <path d="M230 42 L208 56 L232 70" />
        <circle cx="187" cy="22" r="5.5" fill={stroke} stroke="none" />
      </svg>
    </span>
  );
}
