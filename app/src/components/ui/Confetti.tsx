// The Ready screen's falling-pieces layer. Absolute, pointer-events-none.
// Pieces/colors/delays copied verbatim from design-prezik.html (Ready
// screen, "SCREEN 5"): 30 pieces, deterministic (not Math.random at render).
type ConfettiShape = "circle" | "rect";

type ConfettiPiece = {
  left: string;
  width: number;
  height: number;
  color: string;
  shape: ConfettiShape;
  duration: string;
  delay: string;
};

const CONFETTI_PIECES: ConfettiPiece[] = [
  { left: "0.0%", width: 6, height: 6, color: "#ff7a33", shape: "circle", duration: "1.60s", delay: "0.00s" },
  { left: "4.3%", width: 9, height: 13, color: "#d43410", shape: "rect", duration: "1.74s", delay: "-0.16s" },
  { left: "8.7%", width: 12, height: 12, color: "#3a55c0", shape: "rect", duration: "1.88s", delay: "-0.32s" },
  { left: "13.1%", width: 15, height: 19, color: "#8a7bff", shape: "circle", duration: "2.02s", delay: "-0.48s" },
  { left: "17.4%", width: 6, height: 6, color: "#e3a06a", shape: "rect", duration: "2.16s", delay: "-0.64s" },
  { left: "21.8%", width: 9, height: 13, color: "#161514", shape: "rect", duration: "2.30s", delay: "-0.80s" },
  { left: "26.1%", width: 12, height: 12, color: "#ff7a33", shape: "circle", duration: "1.60s", delay: "-0.96s" },
  { left: "23.4%", width: 15, height: 19, color: "#d43410", shape: "rect", duration: "1.74s", delay: "-1.12s" },
  { left: "27.8%", width: 6, height: 6, color: "#3a55c0", shape: "rect", duration: "1.88s", delay: "-1.28s" },
  { left: "32.2%", width: 9, height: 13, color: "#8a7bff", shape: "circle", duration: "2.02s", delay: "-1.44s" },
  { left: "36.5%", width: 12, height: 12, color: "#e3a06a", shape: "rect", duration: "2.16s", delay: "-1.60s" },
  { left: "40.9%", width: 15, height: 19, color: "#161514", shape: "rect", duration: "2.30s", delay: "-1.76s" },
  { left: "45.2%", width: 6, height: 6, color: "#ff7a33", shape: "circle", duration: "1.60s", delay: "0.00s" },
  { left: "49.6%", width: 9, height: 13, color: "#d43410", shape: "rect", duration: "1.74s", delay: "-0.16s" },
  { left: "46.9%", width: 12, height: 12, color: "#3a55c0", shape: "rect", duration: "1.88s", delay: "-0.32s" },
  { left: "51.3%", width: 15, height: 19, color: "#8a7bff", shape: "circle", duration: "2.02s", delay: "-0.48s" },
  { left: "55.6%", width: 6, height: 6, color: "#e3a06a", shape: "rect", duration: "2.16s", delay: "-0.64s" },
  { left: "60.0%", width: 9, height: 13, color: "#161514", shape: "rect", duration: "2.30s", delay: "-0.80s" },
  { left: "64.3%", width: 12, height: 12, color: "#ff7a33", shape: "circle", duration: "1.60s", delay: "-0.96s" },
  { left: "68.7%", width: 15, height: 19, color: "#d43410", shape: "rect", duration: "1.74s", delay: "-1.12s" },
  { left: "73.0%", width: 6, height: 6, color: "#3a55c0", shape: "rect", duration: "1.88s", delay: "-1.28s" },
  { left: "70.4%", width: 9, height: 13, color: "#8a7bff", shape: "circle", duration: "2.02s", delay: "-1.44s" },
  { left: "74.7%", width: 12, height: 12, color: "#e3a06a", shape: "rect", duration: "2.16s", delay: "-1.60s" },
  { left: "79.0%", width: 15, height: 19, color: "#161514", shape: "rect", duration: "2.30s", delay: "-1.76s" },
  { left: "83.4%", width: 6, height: 6, color: "#ff7a33", shape: "circle", duration: "1.60s", delay: "0.00s" },
  { left: "87.8%", width: 9, height: 13, color: "#d43410", shape: "rect", duration: "1.74s", delay: "-0.16s" },
  { left: "92.1%", width: 12, height: 12, color: "#3a55c0", shape: "rect", duration: "1.88s", delay: "-0.32s" },
  { left: "96.5%", width: 15, height: 19, color: "#8a7bff", shape: "circle", duration: "2.02s", delay: "-0.48s" },
  { left: "93.8%", width: 6, height: 6, color: "#e3a06a", shape: "rect", duration: "2.16s", delay: "-0.64s" },
  { left: "98.2%", width: 9, height: 13, color: "#161514", shape: "rect", duration: "2.30s", delay: "-0.80s" },
];

type Props = {
  className?: string;
};

export function Confetti({ className = "" }: Props) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      {CONFETTI_PIECES.map((piece, index) => (
        <span
          key={index}
          className="absolute top-0"
          style={{
            left: piece.left,
            width: piece.width,
            height: piece.height,
            background: piece.color,
            borderRadius: piece.shape === "circle" ? "50%" : "2px",
            animation: `fall ${piece.duration} linear ${piece.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}
