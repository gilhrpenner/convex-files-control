import { ReactNode } from "react";

interface ScreenWithDocsProps {
  window: ReactNode;
  docs: ReactNode;
}

export function ScreenWithDocs({ window, docs }: ScreenWithDocsProps) {
  return (
    <div className="screen-with-docs-container">
      <div className="screen-window">{window}</div>
      <div className="screen-docs">{docs}</div>
    </div>
  );
}
