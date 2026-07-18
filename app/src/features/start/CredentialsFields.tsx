import type { RunOptions } from "@prezik/shared";

type Credentials = RunOptions["credentials"];
type Mode = Credentials["mode"];

type Props = {
  credentials: Credentials;
  onChange: (credentials: Credentials) => void;
};

export function CredentialsFields({ credentials, onChange }: Props) {
  function handleMode(mode: Mode) {
    if (mode === "none") onChange({ mode: "none" });
    else if (mode === "login") onChange({ mode: "login", email: "", password: "" });
    else onChange({ mode: "signup", emailDomain: "berlin.dog" });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white p-4">
      <label htmlFor="credMode" className="text-sm font-medium text-ink">
        Credentials (optional)
      </label>
      <select
        id="credMode"
        value={credentials.mode}
        onChange={(e) => handleMode(e.target.value as Mode)}
        className="rounded-xl border border-ink/10 px-3 py-2"
      >
        <option value="none">None — browse as a visitor</option>
        <option value="login">Log in with existing credentials</option>
        <option value="signup">Sign up for a new account</option>
      </select>

      {credentials.mode === "login" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            placeholder="email"
            value={credentials.email}
            onChange={(e) => onChange({ mode: "login", email: e.target.value, password: credentials.password })}
            className="flex-1 rounded-xl border border-ink/10 px-3 py-2"
          />
          <input
            type="password"
            required
            placeholder="password"
            value={credentials.password}
            onChange={(e) => onChange({ mode: "login", email: credentials.email, password: e.target.value })}
            className="flex-1 rounded-xl border border-ink/10 px-3 py-2"
          />
        </div>
      )}

      {credentials.mode === "signup" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="emailDomain" className="text-sm text-ink-soft">
            Email domain the agent will sign up with
          </label>
          <input
            id="emailDomain"
            required
            value={credentials.emailDomain}
            onChange={(e) => onChange({ mode: "signup", emailDomain: e.target.value })}
            className="rounded-xl border border-ink/10 px-3 py-2"
          />
        </div>
      )}
    </div>
  );
}
