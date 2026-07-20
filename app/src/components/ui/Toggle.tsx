// Pill switch, 46×27, ink when on. Controlled component.
type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  "aria-label"?: string;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, label, "aria-label": ariaLabel, disabled = false }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[27px] w-[46px] flex-none rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-ink" : "bg-chip"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white transition-[left] ${
          checked ? "left-[22px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}
