import { ReactNode } from "react";

interface DocumentationPanelProps {
  children: ReactNode;
  title?: string;
}

export function DocumentationPanel({ children, title }: DocumentationPanelProps) {
  return (
    <div
      style={{
        background: "#fff",
        border: "2px solid var(--os-border)",
        padding: "20px",
        height: "100%",
        fontFamily: "var(--font-display)",
        position: "relative",
        boxShadow: "4px 4px 0px rgba(0,0,0,0.1)",
      }}
    >
      {title && (
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "1.1rem",
            color: "var(--os-text-primary)",
            textTransform: "uppercase",
            borderBottom: "2px solid var(--os-border)",
            paddingBottom: "8px",
          }}
        >
          {title}
        </h3>
      )}
      <div
        style={{
          fontSize: "0.95rem",
          lineHeight: "1.6",
          color: "#444",
        }}
      >
        {children}
      </div>
    </div>
  );
}
