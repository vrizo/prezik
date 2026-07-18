import { useState } from "react";
import { Orb } from "../../components/ui/Orb";
import { Logo } from "../../components/Logo";
import { newPath } from "../../lib/paths";
import techEuropeLogo from "../../assets/tech-europe-logo.svg";

const FEATURES = [
  {
    title: "Autonomous exploration",
    body: "Agents crawl your app, sign in, and map every page.",
  },
  {
    title: "Story & narration",
    body: "AI writes the storyboard and speaks a natural voiceover.",
  },
  {
    title: "Cinematic capture",
    body: "Visible cursor, highlights, and smooth zooms — recorded in 60–90s.",
  },
];

type Props = { navigate: (path: string, opts?: { freshRun?: boolean }) => void };

// Prepends https:// when the user typed a bare host, then validates the
// result is a parseable URL. Returns null for empty/unparseable input.
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname.includes(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}

export function LandingScreen({ navigate }: Props) {
  const [url, setUrl] = useState(() => new URLSearchParams(window.location.search).get("url") ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Enter a valid URL, e.g. https://your-app.com");
      return;
    }
    setError(null);
    navigate(newPath(normalized));
  }

  return (
    <div className="mx-auto mt-14 mb-8 flex max-w-[1120px] flex-col gap-8 px-4">
      <div className="overflow-hidden rounded-[30px] border border-line bg-bg">
        <div className="flex items-center gap-3.5 px-[30px] py-[22px]">
          {/* box-content keeps the drawn logo at 68px with the padding added on top */}
          <Logo size={68} className="box-content pt-[29px]" />
        </div>

        <div className="grid grid-cols-1 items-center gap-[30px] px-[30px] pb-[34px] pt-4 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <h1 className="m-0 text-[40px] font-bold leading-[1.05] tracking-[-0.04em] sm:text-[48px] lg:text-[56px] lg:leading-[1.02]">
              {"Turn any link into a narrated demo"}
            </h1>
            <p className="mt-5 max-w-[460px] text-lg leading-[1.5] text-sub">
              Paste a URL. Prezik explores your app, plans the story, and records a narrated walkthrough — visible
              cursor, highlights, smooth zooms.
            </p>
            <form onSubmit={handleSubmit} className="mt-[26px] flex max-w-[520px] flex-col gap-2.5 sm:flex-row">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-app.com"
                aria-label="Your app's URL"
                className="h-14 flex-1 rounded-full border border-ink bg-white px-5 text-base text-ink outline-none"
              />
              <button
                type="submit"
                className="h-14 whitespace-nowrap rounded-full bg-ink px-[26px] text-base font-semibold text-white hover:bg-[#44403a]"
              >
                Create demo
              </button>
            </form>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-[18px] text-[13px] text-faint">
              Pay per run, no subscription
            </div>
          </div>

          <div className="relative grid h-[300px] place-items-center sm:h-[440px]">
            <Orb
              theme="purple"
              className="anim-floaty absolute left-[2%] top-[14%] h-[90px] w-[90px] opacity-90 sm:h-[120px] sm:w-[120px]"
            />
            <Orb
              theme="blue"
              className="anim-floaty absolute bottom-[12%] right-[4%] h-[100px] w-[100px] opacity-[.92] [animation-delay:-2s] sm:h-[140px] sm:w-[140px]"
            />
            <Orb
              theme="mono"
              className="anim-floaty absolute right-[16%] top-[2%] h-[56px] w-[56px] opacity-80 [animation-delay:-4s] sm:h-[74px] sm:w-[74px]"
            />
            <Orb
              theme="orange"
              play
              className="relative h-[200px] w-[200px] drop-shadow-[0_20px_50px_rgba(198,42,6,.28)] sm:h-[280px] sm:w-[280px]"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="text-[13px] font-semibold uppercase tracking-wide text-faint">How it works</div>
        <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.03em] sm:text-[34px]">
          From link to video, hands-off
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-[20px] border border-line bg-bg p-6">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "linear-gradient(135deg,#ff9c52,#c62a06)" }}
              />
              <div className="mt-3 font-semibold text-ink">{feature.title}</div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-sub">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[30px] bg-ink p-8 text-white sm:p-10">
        <div className="text-[13px] font-semibold uppercase tracking-wide text-white/60">For builders</div>
        <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.03em] sm:text-[34px]">Full API & MCP access</h2>
        <p className="mt-3 max-w-[520px] text-[15px] leading-[1.5] text-white/70">
          Drive Prezik from your coding agent over MCP or plain HTTP. Regenerate your demo automatically after every
          deploy.
        </p>
        <a
          href="https://github.com/vrizo/prezik/tree/main/docs/api"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-white/90"
        >
          Read the docs
          <span aria-hidden>→</span>
        </a>
      </div>

      <div className="relative overflow-hidden rounded-[30px] text-white" style={{ background: "linear-gradient(135deg,#ff9c52,#c62a06)" }}>
        <div aria-hidden className="bg-grain pointer-events-none absolute inset-0 opacity-[.18] mix-blend-overlay" />
        <div className="relative flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="flex items-center gap-4">
            <img src={techEuropeLogo} alt="" className="h-8 w-8 rounded-[6px]" />
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-wide text-white/80">
                Sponsored by {"{Tech: Europe}"}
              </div>
              <p className="mt-1 text-[17px] font-semibold leading-[1.4] sm:text-lg">
                Use code{" "}
                <code className="rounded-full bg-white/20 px-3 py-1 font-mono font-semibold tracking-wide">
                  TECH-EUROPE-HACKATHON
                </code>{" "}
                for one free generation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
