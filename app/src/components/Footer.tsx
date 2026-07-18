import techEuropeLogo from "../assets/tech-europe-logo.svg";
import wordmark from "../assets/prezik-4a.png";

// Shared site footer, rendered on every screen by App. `maxWidthClass` lets
// each route match the footer to its content width (run screens are 1050px).
export function Footer({ maxWidthClass = "max-w-[1120px]" }: { maxWidthClass?: string }) {
  return (
    <div className={`relative mx-auto w-full ${maxWidthClass} px-4 pb-14`}>
      <footer className="flex flex-col gap-[30px] rounded-[30px] bg-ink px-11 py-[42px] text-white">
        <div className="grid grid-cols-1 gap-7 sm:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="mb-3">
              {/* Text-only wordmark; the PNG is ink, inverted to read on the dark footer. */}
              <img src={wordmark} alt="Prezik" className="h-9 w-auto invert" />
            </div>
            <p className="m-0 max-w-[280px] text-sm leading-[1.5] text-white/60">
              Paste a link, get a narrated demo video. Built for builders shipping fast.
            </p>
          </div>
          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[.08em] text-white/45">Contact</div>
            <a
              href="mailto:vitalii.rizo@gmail.com"
              className="inline-block py-[3px] text-sm text-white/70 no-underline hover:text-white"
            >
              vitalii.rizo@gmail.com
            </a>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[.14] pt-[22px]">
          <span className="text-[13px] text-white/50">© 2026 Prezik</span>
          <span className="flex items-center gap-2.5 text-[13px] text-white/50">
            <img
              src={techEuropeLogo}
              alt="{Tech: Europe} logo"
              className="h-7 w-7 rounded-[6px] border border-white/[.14]"
            />
            <span>
              Made during{" "}
              <a
                href="https://techeurope.io"
                target="_blank"
                rel="noopener noreferrer"
                className="border-b border-white/40 font-semibold text-white no-underline hover:border-white"
              >
                {"{Tech: Europe}"}
              </a>{" "}
              hackathon
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
