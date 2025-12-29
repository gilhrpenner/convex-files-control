import * as React from "react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface DocumentationPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export function DocumentationPanel({ 
  title = "How it works", 
  children,
  className,
  ...props 
}: DocumentationPanelProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div 
      className={cn(
        "rounded-xl border border-blue-500/20 bg-blue-500/5 overflow-hidden",
        className
      )} 
      {...props}
    >
      <div className="flex items-center justify-between p-4 border-b border-blue-500/10">
        <div className="flex items-center gap-2 text-blue-400">
          <BookOpen className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">{title}</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>
      
      {isOpen && (
        <div className="p-4 text-sm text-muted-foreground space-y-3 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
