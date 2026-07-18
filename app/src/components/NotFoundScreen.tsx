import errorPup from "../assets/prezik-error.png";

type Props = { navigate: (path: string) => void };

// 404 for unknown routes, missing runs, and invalid run ids.
export function NotFoundScreen({ navigate }: Props) {
  return (
    <main className="flex flex-col items-center gap-4 px-4 pt-28 pb-20 text-center">
      <img src={errorPup} alt="" className="w-28" />
      <h1 className="m-0 text-[64px] font-bold leading-none tracking-[-0.04em]">404</h1>
      <p className="m-0 text-[15px] text-sub">This page doesn't exist — maybe the pup buried it.</p>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="mt-2 h-12 rounded-full bg-ink px-7 text-sm font-semibold text-white hover:bg-[#44403a]"
      >
        Back to the start
      </button>
    </main>
  );
}
