import { Component, useEffect, useState, type ReactNode } from "react";
import { parseRoute } from "./lib/paths";
import { Footer } from "./components/Footer";
import { NotFoundScreen } from "./components/NotFoundScreen";
import { LandingScreen } from "./features/start/LandingScreen";
import { LinkStepScreen } from "./features/start/LinkStepScreen";
import { RunScreen } from "./features/run/RunScreen";

// A screen that throws during render (e.g. a malformed run id failing Convex's
// id validation) falls back to the 404 view. Remounted per pathname via `key`.
class RouteErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

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
    ) : route.screen === "start" ? (
      <LandingScreen navigate={navigate} />
    ) : (
      <NotFoundScreen navigate={navigate} />
    );

  return (
    <>
      <RouteErrorBoundary key={pathname} fallback={<NotFoundScreen navigate={navigate} />}>
        {screen}
      </RouteErrorBoundary>
      <Footer maxWidthClass={route.screen === "run" ? "max-w-[1050px]" : undefined} />
    </>
  );
}
