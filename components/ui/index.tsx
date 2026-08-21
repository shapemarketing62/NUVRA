"use client";

import { useState, CSSProperties, ReactNode, ButtonHTMLAttributes } from "react";
import { COLORS, inputStyle } from "@/lib/design-tokens";
import { FEATURES, getMinimumPlan, hasEntitlement, type EntitlementKey, type PlanTier } from "@/lib/plans";

type BtnVariant = "primary" | "accent" | "ghost" | "subtle" | "danger";
type BtnSize = "sm" | "md" | "lg";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  full?: boolean;
  style?: CSSProperties;
}

export function Btn({
  children,
  variant = "primary",
  size = "md",
  onClick,
  disabled,
  style,
  full,
  type = "button",
  ...rest
}: BtnProps) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    fontWeight: 500,
    border: "1px solid transparent",
    transition: "all .15s ease",
    width: full ? "100%" : undefined,
    opacity: disabled ? 0.45 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };
  const sizes: Record<BtnSize, CSSProperties> = {
    sm: { padding: "7px 14px", fontSize: 13 },
    md: { padding: "11px 20px", fontSize: 14.5 },
    lg: { padding: "14px 26px", fontSize: 15.5 },
  };
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: { background: COLORS.ink, color: COLORS.paper },
    accent: { background: COLORS.blue, color: "#fff" },
    ghost: { background: "transparent", color: COLORS.ink, border: `1px solid ${COLORS.line}` },
    subtle: { background: COLORS.paperDim, color: COLORS.ink },
    danger: { background: COLORS.redSoft, color: COLORS.red },
  };
  const [hover, setHover] = useState(false);
  const hoverBg: Record<BtnVariant, string> = {
    primary: COLORS.blue,
    accent: COLORS.blueDeep,
    ghost: COLORS.paperDim,
    subtle: COLORS.line,
    danger: COLORS.red,
  };
  const hoverColor: Partial<Record<BtnVariant, string>> = { danger: "#fff" };

  return (
    <button
      type={type}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...base,
        ...sizes[size],
        ...variants[variant],
        background: hover ? hoverBg[variant] : variants[variant].background,
        color: hover && hoverColor[variant] ? hoverColor[variant] : variants[variant].color,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ display: "block", fontSize: 13.5, fontWeight: 500, marginBottom: 8, color: COLORS.ink }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 12, color: COLORS.inkFaint, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        ...inputStyle,
        borderColor: focus ? COLORS.blue : COLORS.line,
        boxShadow: focus ? `0 0 0 3px ${COLORS.blueSoft}` : "none",
        background: disabled ? COLORS.paperDim : "#fff",
        color: disabled ? COLORS.inkFaint : COLORS.ink,
      }}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        ...inputStyle,
        resize: "vertical",
        borderColor: focus ? COLORS.blue : COLORS.line,
        boxShadow: focus ? `0 0 0 3px ${COLORS.blueSoft}` : "none",
      }}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[] | string[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, appearance: "auto" }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: 999,
        border: `1px solid ${active ? COLORS.blue : COLORS.line}`,
        background: active ? COLORS.blueSoft : "#fff",
        color: active ? COLORS.blueDeep : COLORS.inkSoft,
        fontSize: 13.5,
        fontWeight: 500,
        transition: "all .15s ease",
      }}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = 520,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,22,26,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="shp-pop"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: width,
          maxHeight: "88vh",
          overflowY: "auto",
          padding: 30,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 className="shp-display" style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: COLORS.paperDim,
              border: "none",
              borderRadius: 999,
              width: 30,
              height: 30,
              fontSize: 15,
              color: COLORS.inkSoft,
            }}
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, style, className = "" }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return <section className={`card card-pad ${className}`} style={style}>{children}</section>;
}

export function StatusBadge({ tone = "neutral", children }: { tone?: "neutral" | "info" | "success" | "warning" | "danger"; children: ReactNode }) {
  const tones = {
    neutral: { color: COLORS.inkSoft, background: COLORS.paperDim },
    info: { color: COLORS.blueDeep, background: COLORS.blueSoft },
    success: { color: COLORS.olive, background: COLORS.oliveSoft },
    warning: { color: COLORS.amber, background: COLORS.amberSoft },
    danger: { color: COLORS.red, background: COLORS.redSoft },
  };
  return <span style={{ ...tones[tone], display: "inline-flex", alignItems: "center", minHeight: 24, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 650, letterSpacing: ".02em" }}>{children}</span>;
}

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" aria-hidden="true" style={{ height, width, ...style }} />;
}

export function PageSkeleton() {
  return <div className="page-container" aria-label="Cargando contenido"><Skeleton height={12} width={110} /><Skeleton height={38} width="42%" style={{ marginTop: 12 }} /><div className="metric-grid" style={{ marginTop: 32 }}><Card><Skeleton height={180} /></Card><Card><Skeleton height={20} width="40%" /><Skeleton height={12} style={{ marginTop: 22 }} /><Skeleton height={12} style={{ marginTop: 16 }} /><Skeleton height={12} style={{ marginTop: 16 }} /></Card></div></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div style={{ padding: "42px 24px", textAlign: "center", border: `1px dashed ${COLORS.lineStrong}`, borderRadius: 14, background: COLORS.paper }}><div className="shp-display" style={{ fontSize: 18, fontWeight: 650, marginBottom: 8 }}>{title}</div><p style={{ maxWidth: 480, margin: "0 auto", color: COLORS.inkSoft, fontSize: 14, lineHeight: 1.6 }}>{description}</p>{action && <div style={{ marginTop: 20 }}>{action}</div>}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Card style={{ maxWidth: 620, margin: "80px auto", textAlign: "center" }}><StatusBadge tone="danger">No pudimos cargar esta vista</StatusBadge><p style={{ color: COLORS.inkSoft, margin: "16px auto 20px", lineHeight: 1.6 }}>{message}</p>{onRetry && <Btn onClick={onRetry}>Intentar de nuevo</Btn>}</Card>;
}

export function CoverageBar({ value, label = "Cobertura" }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return <div><div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12, color: COLORS.inkSoft, marginBottom: 8 }}><span>{label}</span><strong style={{ color: COLORS.ink }}>{safe}%</strong></div><div style={{ height: 7, borderRadius: 99, background: COLORS.paperDim, overflow: "hidden" }}><div style={{ height: "100%", width: `${safe}%`, borderRadius: 99, background: safe >= 75 ? COLORS.olive : safe >= 40 ? COLORS.blue : COLORS.amber, transition: "width .35s ease" }} /></div></div>;
}

export function ScoreRing({ value, status }: { value: number | null; status: "PENDIENTE" | "PRELIMINAR" | "COMPLETO" }) {
  const safe = value === null ? 0 : Math.max(0, Math.min(100, value));
  const color = status === "PENDIENTE" ? COLORS.inkFaint : safe >= 65 ? COLORS.olive : safe >= 45 ? COLORS.blue : COLORS.red;
  return <div style={{ position: "relative", width: 154, height: 154, display: "grid", placeItems: "center", borderRadius: "50%", background: `conic-gradient(${color} ${safe * 3.6}deg, ${COLORS.paperDim} 0)` }}><div style={{ width: 132, height: 132, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", textAlign: "center" }}><div><div className="shp-display" style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-.05em", color }}>{value ?? "—"}</div><div style={{ fontSize: 11, color: COLORS.inkFaint }}>sobre 100</div></div></div></div>;
}

export function UpgradePanel({ feature, compact = false }: { feature: EntitlementKey; compact?: boolean }) {
  const definition = FEATURES[feature];
  const minimumPlan = getMinimumPlan(feature);
  return <div style={{ padding: compact ? 18 : 28, border: `1px solid ${COLORS.line}`, borderRadius: 14, background: COLORS.paper, textAlign: compact ? "left" : "center" }}><StatusBadge tone="info">Plan {minimumPlan === "PARTNER" ? "Partner" : "Pro"}</StatusBadge><div className="shp-display" style={{ fontSize: compact ? 16 : 20, fontWeight: 650, marginTop: 12 }}>{definition.label}</div><p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6, maxWidth: 520, margin: compact ? "6px 0 0" : "8px auto 0" }}>{definition.description} Esta vista ya está preparada, pero tu plan actual no la incluye.</p><Btn size="sm" variant="primary" style={{ marginTop: 16 }} onClick={() => { window.location.href = "/dashboard/configuracion#planes"; }}>Comparar planes</Btn></div>;
}

export function FeatureGate({ plan, feature, children, fallback }: { plan: PlanTier | string; feature: EntitlementKey; children: ReactNode; fallback?: ReactNode }) {
  return hasEntitlement(plan, feature) ? <>{children}</> : <>{fallback ?? <UpgradePanel feature={feature} />}</>;
}

export function ProBadge({ label = "PRO", style }: { label?: string; style?: CSSProperties }) {
  return (
    <span
      className="shp-mono"
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        color: COLORS.blue,
        background: COLORS.blueSoft,
        padding: "2px 7px",
        borderRadius: 6,
        letterSpacing: "0.03em",
        ...style,
      }}
    >
      {label}
    </span>
  );
}

export function DemoBadge({ label = "DEMO", style }: { label?: string; style?: CSSProperties }) {
  return (
    <span
      className="shp-mono"
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        color: COLORS.amber,
        background: COLORS.amberSoft,
        padding: "2px 7px",
        borderRadius: 6,
        letterSpacing: "0.03em",
        ...style,
      }}
    >
      {label}
    </span>
  );
}

export function PendingBadge({ label = "PENDIENTE" }: { label?: string }) {
  return (
    <span
      className="shp-mono"
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        color: COLORS.inkSoft,
        background: COLORS.paperDim,
        padding: "2px 7px",
        borderRadius: 6,
        letterSpacing: "0.03em",
      }}
    >
      {label}
    </span>
  );
}

export function NuvraLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <path d="M4 18C4 10 9 5 18 5" stroke={COLORS.blue} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="19" cy="5" r="2.4" fill={COLORS.blue} />
    </svg>
  );
}

export function BrandMark({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: subtitle ? 2 : 0 }}>
      <div className="shp-display" style={{ fontWeight: 700, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}>
        <NuvraLogo size={18} />
        NUVRA
      </div>
      {subtitle && (
        <div className="shp-mono" style={{ fontSize: 10, color: COLORS.inkFaint, paddingLeft: 26, letterSpacing: "0.06em" }}>
          by Shape
        </div>
      )}
    </div>
  );
}

export function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length)
    return (
      <div
        style={{
          border: `1px dashed ${COLORS.line}`,
          borderRadius: 12,
          padding: 30,
          textAlign: "center",
          color: COLORS.inkFaint,
          fontSize: 14,
        }}
      >
        Todavía no hay datos acá.
      </div>
    );
  return (
    <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 14, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead>
          <tr style={{ background: COLORS.paperDim }}>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "11px 16px",
                  fontSize: 11.5,
                  color: COLORS.inkSoft,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${COLORS.line}` }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: "11px 16px" }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
