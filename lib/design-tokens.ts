export const COLORS = {
  paper: "#F4F3EF", paperDim: "#ECEBE5", surface: "#FBFAF7", surfaceRaised: "#FFFFFF",
  ink: "#191A1C", inkSoft: "#60636A", inkFaint: "#8B8E94", line: "#DDDDD6", lineStrong: "#C9C9C0",
  blue: "#3046A5", blueSoft: "#E9ECF7", blueDeep: "#243783",
  olive: "#4F6857", oliveSoft: "#E8EEE9", red: "#9C5148", redSoft: "#F2E8E5", amber: "#8A6A32", amberSoft: "#F2ECDD",
} as const;

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64 } as const;
export const RADIUS = { control: 8, panel: 10, round: 999 } as const;
export const SHADOW = { raised: "0 12px 32px rgba(25,26,28,.07)", floating: "0 18px 48px rgba(25,26,28,.12)" } as const;
export const TRANSITION = "160ms cubic-bezier(.2,.8,.2,1)";
export const FONTS_CSS = "";
export const inputStyle: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: RADIUS.control, border: `1px solid ${COLORS.lineStrong}`, background: COLORS.surfaceRaised, fontSize: 14, color: COLORS.ink, outline: "none" };
