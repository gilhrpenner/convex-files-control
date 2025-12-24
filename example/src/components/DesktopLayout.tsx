import { ReactNode } from "react";

interface DesktopLayoutProps {
  children: ReactNode;
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <div 
            style={{ 
                fontFamily: "var(--font-display)", 
                fontSize: "1.5rem",
                border: "2px solid var(--os-border)",
                padding: "8px 16px",
                background: "var(--os-window-bg)",
                boxShadow: "4px 4px 0px var(--os-border)"
            }}
        >
          CONVEX_FILES_CONTROL
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem" }}>
          {new Date().toLocaleDateString()}
        </div>
      </header>
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "40px",
          alignItems: "stretch",
        }}
      >
        {children}
      </main>
    </div>
  );
}
