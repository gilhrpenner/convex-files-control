import { ButtonHTMLAttributes } from "react";

interface RetroButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function RetroButton({
  children,
  variant = "primary",
  style,
  ...props
}: RetroButtonProps) {
  const bg = variant === "primary" ? "var(--os-accent-secondary)" : "#fff";
  const disabled = props.disabled;

  return (
    <button
      {...props}
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: "bold",
        fontSize: "0.9rem",
        textTransform: "uppercase",
        padding: "10px 16px",
        border: "2px solid var(--os-border)",
        background: bg,
        boxShadow: disabled ? "none" : "3px 3px 0px var(--os-border)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "transform 0.1s, box-shadow 0.1s",
        ...style,
      }}
      onMouseDown={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translate(2px, 2px)";
        e.currentTarget.style.boxShadow = "1px 1px 0px var(--os-border)";
      }}
      onMouseUp={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translate(0, 0)";
        e.currentTarget.style.boxShadow = "3px 3px 0px var(--os-border)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translate(0, 0)";
        e.currentTarget.style.boxShadow = "3px 3px 0px var(--os-border)";
      }}
    >
      {children}
    </button>
  );
}
