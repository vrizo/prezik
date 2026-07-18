// Line-drawn dog mascot. Strokes use currentColor so parents control the color
// via `text-*` / `color`; size is controlled by the parent through `className`
// (square). Geometry copied verbatim from design-pup.html.
export type PupPose = "plain" | "scout" | "mapper" | "director" | "presenter" | "error";

type Props = {
  pose: PupPose;
  className?: string;
};

export function Pup({ pose, className = "" }: Props) {
  const isError = pose === "error";

  return (
    <svg
      viewBox="0 0 130 130"
      className={className}
      style={{ display: "block", overflow: "visible" }}
      role="img"
      aria-label={`Prezik mascot — ${pose} pose`}
    >
      <g
        style={{
          stroke: "currentColor",
          fill: "none",
          strokeWidth: 3.6,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      >
        <g transform={isError ? "rotate(-15 65 58)" : undefined}>
          <path d="M40 34 C24 22 8 32 14 52 C16 62 28 66 36 60" />
          <path d="M90 34 C106 22 122 32 116 52 C114 62 102 66 94 60" />
          <path d="M40 32 C26 38 22 56 28 70 C34 84 50 90 65 90 C80 90 96 84 102 70 C108 56 104 38 90 32 C77 26 53 26 40 32 Z" />
          <circle cx="52" cy="58" r="3.4" fill="currentColor" stroke="none" />
          <circle cx="78" cy="58" r="3.4" fill="currentColor" stroke="none" />
          <circle cx="65" cy="66" r="2.8" fill="currentColor" stroke="none" />
          {isError ? (
            <path d="M56 72 C60 67 70 67 74 72" />
          ) : (
            <path d="M56 68 C60 74 70 74 74 68" />
          )}
        </g>

        <path d="M46 90 C36 100 38 116 50 116 L80 116 C92 116 94 100 84 90" />
        <line x1="58" y1="100" x2="58" y2="116" />
        <line x1="72" y1="100" x2="72" y2="116" />
        <path d="M86 100 C98 98 104 90 98 84" />

        {pose === "scout" && (
          <>
            <circle cx="104" cy="98" r="12" />
            <line x1="113" y1="107" x2="124" y2="118" />
          </>
        )}

        {pose === "mapper" && (
          <>
            <path d="M50 86 C58 92 72 92 80 86" />
            <path d="M80 88 C100 80 118 72 112 54" />
            <circle cx="110" cy="50" r="6" />
          </>
        )}

        {pose === "director" && (
          <>
            <rect x="94" y="92" width="30" height="22" rx="3" />
            <line x1="94" y1="100" x2="124" y2="100" />
            <line x1="100" y1="94" x2="100" y2="99" />
            <line x1="108" y1="94" x2="108" y2="99" />
            <line x1="116" y1="94" x2="116" y2="99" />
          </>
        )}

        {pose === "presenter" && (
          <>
            <path d="M96 74 L122 62 L122 96 L96 84 Z" />
            <line x1="96" y1="80" x2="86" y2="80" />
          </>
        )}

        {isError && (
          <>
            <path d="M108 38 C116 34 123 42 117 49 C113 53 115 57 115 59" />
            <circle cx="115" cy="69" r="2.6" fill="currentColor" stroke="none" />
          </>
        )}
      </g>
    </svg>
  );
}
