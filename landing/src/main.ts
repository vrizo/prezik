import "./style.css";
import { buildAppRedirectUrl } from "./url";

const APP_URL = import.meta.env.VITE_APP_URL;

const form = document.querySelector<HTMLFormElement>("#demo-form");
const input = document.querySelector<HTMLInputElement>("#url-input");
const errorEl = document.querySelector<HTMLParagraphElement>("#url-error");

function showError(message: string): void {
  if (!errorEl || !input) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
  input.setAttribute("aria-invalid", "true");
}

function clearError(): void {
  if (!errorEl || !input) return;
  errorEl.textContent = "";
  errorEl.hidden = true;
  input.removeAttribute("aria-invalid");
}

if (form && input && errorEl) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearError();

    if (!APP_URL) {
      showError("This build has no app URL configured.");
      console.error("VITE_APP_URL is not set for this build mode.");
      return;
    }

    try {
      window.location.href = buildAppRedirectUrl(input.value, APP_URL);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Enter a valid URL.");
      input.focus();
    }
  });
}
