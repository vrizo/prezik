import { useEffect, useState } from "react";
import { parseRoute } from "./lib/paths";
import { StartScreen } from "./features/start/StartScreen";
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
  // through this helper instead of calling pushState directly.
  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setPathname(path);
  }

  const route = parseRoute(pathname);
  if (route.screen === "run") return <RunScreen runId={route.runId} navigate={navigate} />;
  return <StartScreen navigate={navigate} />;
}
