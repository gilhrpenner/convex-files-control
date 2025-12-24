import { InputHTMLAttributes, SelectHTMLAttributes } from "react";

interface RetroInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function RetroInput({ label, style, ...props }: RetroInputProps) {
  const inputStyle: React.CSSProperties = {
    fontFamily: "inherit",
    padding: "8px",
    border: "2px solid var(--os-border)",
    background: "#fff",
    outline: "none",
    fontSize: "0.9rem",
    width: "100%",
    ...style,
  };

  if (!label) {
    return <input style={inputStyle} {...props} />;
  }

  return (
    <label style={{ display: "block", marginBottom: "12px" }}>
      <div style={{ 
        fontFamily: "var(--font-display)", 
        fontSize: "0.8rem", 
        marginBottom: "4px",
        fontWeight: "bold" 
      }}>
        {label}
      </div>
      <input style={inputStyle} {...props} />
    </label>
  );
}

interface RetroSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
}

export function RetroSelect({ label, children, style, ...props }: RetroSelectProps) {
    const selectStyle: React.CSSProperties = {
        fontFamily: "inherit",
        padding: "8px",
        border: "2px solid var(--os-border)",
        background: "#fff",
        outline: "none",
        fontSize: "0.9rem",
        width: "100%",
        ...style,
    };

    if (!label) {
        return <select style={selectStyle} {...props}>{children}</select>;
    }

    return (
        <label style={{ display: "block", marginBottom: "12px" }}>
            <div style={{ 
                fontFamily: "var(--font-display)", 
                fontSize: "0.8rem", 
                marginBottom: "4px",
                fontWeight: "bold" 
            }}>
                {label}
            </div>
            <select style={selectStyle} {...props}>
                {children}
            </select>
        </label>
    );
}

export function RetroCheckbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
    return (
        <label style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "8px", 
            fontFamily: "var(--font-display)",
            fontSize: "0.9rem",
            cursor: "pointer",
            marginBottom: "8px"
        }}>
            <input 
                type="checkbox" 
                style={{
                    appearance: "none",
                    width: "16px",
                    height: "16px",
                    border: "2px solid var(--os-border)",
                    background: "#fff",
                    display: "grid",
                    placeContent: "center",
                }} 
                {...props} 
            />
            <span className="checkbox-mark" style={{
                position: "absolute",
                marginLeft: "3px",
                pointerEvents: "none",
                display: props.checked ? "block" : "none",
                width: "10px",
                height: "10px",
                background: "var(--os-border)"
            }}></span>
            {label}
        </label>
    );
}
