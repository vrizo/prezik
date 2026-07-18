import type { RunOptions } from "@prezik/shared";

const LENGTHS: RunOptions["length"][] = ["short", "medium", "long"];

type Props = {
  options: RunOptions;
  onChange: (options: RunOptions) => void;
};

export function OptionsFields({ options, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-ink/10 bg-white p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Voice
        <select
          value={options.voice}
          onChange={(e) => onChange({ ...options, voice: e.target.value as RunOptions["voice"] })}
          className="rounded-xl border border-ink/10 px-3 py-2"
        >
          <option value="neutral">Neutral</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Length
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={LENGTHS.indexOf(options.length)}
          onChange={(e) => onChange({ ...options, length: LENGTHS[Number(e.target.value)] })}
        />
        <span className="text-ink-soft capitalize">{options.length}</span>
      </label>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={options.zoom}
          onChange={(e) => onChange({ ...options, zoom: e.target.checked })}
        />
        Smooth zooms
      </label>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={options.captions}
          onChange={(e) => onChange({ ...options, captions: e.target.checked })}
        />
        Captions
      </label>
    </div>
  );
}
