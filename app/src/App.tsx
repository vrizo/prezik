import { useEffect, useState } from "react";
import { parseRoute } from "./lib/paths";
import { Footer } from "./components/Footer";
import { LandingScreen } from "./features/start/LandingScreen";
import { LinkStepScreen } from "./features/start/LinkStepScreen";
import { RunScreen } from "./features/run/RunScreen";

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  // Listening for browser back/forward — a DOM event subscription, not data
  // fetching.
  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // history.pushState doesn't itself fire "popstate", so screens navigate
  // through this helper instead of calling pushState directly. The state
  // object carries one-shot flags like freshRun (RunScreen's entrance
  // animation).
  function navigate(path: string, opts?: { freshRun?: boolean }) {
    window.history.pushState(opts ?? {}, "", path);
    setPathname(path.split("?")[0]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const route = parseRoute(pathname);
  const screen =
    route.screen === "run" ? (
      <RunScreen runId={route.runId} navigate={navigate} />
    ) : route.screen === "new" ? (
      <LinkStepScreen navigate={navigate} />
    ) : (
      <LandingScreen navigate={navigate} />
    );

  return (
    <>
      {screen}
      <Footer maxWidthClass={route.screen === "run" ? "max-w-[1050px]" : undefined} />
    </>
  );
}
