import { useState } from "react";
import { Orb } from "../../components/ui/Orb";
import { Logo } from "../../components/Logo";
import { newPath } from "../../lib/paths";

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
              Pay per run, no subscription, built for builders
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

    </div>
  );
}
