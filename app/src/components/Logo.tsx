import horizontal from "../assets/prezik-logo-horizontal.png";

// The horizontal lockup export from the logo design (ink tile with the dog
// mark + "Prezik" wordmark). `size` is the rendered height in px.
export function Logo({ size = 68, className = "" }: { size?: number; className?: string }) {
  return (
    <img src={horizontal} alt="Prezik" style={{ height: size }} className={`w-auto ${className}`} />
  );
}
