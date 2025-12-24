import { ReactNode } from "react";

interface OSWindowProps {
  title: string;
  children: ReactNode;
  accentColor?: string;
}

export function OSWindow({ title, children, accentColor }: OSWindowProps) {
  return (
    <div
      style={{
        background: "var(--os-window-bg)",
        border: "var(--os-border-width) solid var(--os-border)",
        boxShadow: "var(--os-shadow-offset) var(--os-shadow-offset) 0px var(--os-border)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          background: accentColor || "var(--os-accent-primary)",
          borderBottom: "var(--os-border-width) solid var(--os-border)",
          padding: "8px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "bold",
            fontSize: "0.9rem",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        <div
          style={{
            display: "flex",
            gap: "4px",
          }}
        >
          <div
            style={{
              width: "12px",
              height: "12px",
              border: "2px solid var(--os-border)",
              background: "#fff",
            }}
          />
          <div
            style={{
              width: "12px",
              height: "12px",
              border: "2px solid var(--os-border)",
              background: "var(--os-border)",
            }}
          />
        </div>
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );
}
