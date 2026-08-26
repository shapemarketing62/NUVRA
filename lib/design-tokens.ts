export const COLORS = {
  background: "#F7F5F0", surface: "#FFFFFF", surfaceMuted: "#F0EDE6", surfaceRaised: "#FFFFFF",
  text: "#17181A", textMuted: "#5C6068", textFaint: "#858991", border: "#DCD8D0", borderStrong: "#C9C3B9",
  brand: "#3D52B8", brandDark: "#26367F", brandSoft: "#E9EDFF",
  accent: "#C46B50", accentDark: "#9B4335", accentLight: "#E4A18C", accentSoft: "#F4E4DE", positive: "#5F7866", positiveDark: "#4B6252", positiveSoft: "#E6EEE8",
  sand: "#D8BD91", sandSoft: "#F3EBDD", warning: "#76552F", warningSoft: "#F5EAD8",

  // Compatibility aliases used by existing product views.
  paper: "#F7F5F0", paperDim: "#F0EDE6", ink: "#17181A", inkSoft: "#5C6068", inkFaint: "#858991",
  line: "#DCD8D0", lineStrong: "#C9C3B9", blue: "#3D52B8", blueSoft: "#E9EDFF", blueDeep: "#26367F",
  olive: "#5F7866", oliveSoft: "#E6EEE8", red: "#C46B50", redSoft: "#F4E4DE",
  amber: "#9A7344", amberSoft: "#F5EAD8", copper: "#C46B50",
} as const;

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64 } as const;
export const RADIUS = { control: 8, panel: 10, round: 999 } as const;
export const SHADOW = { raised: "0 12px 32px rgba(25,26,28,.07)", floating: "0 18px 48px rgba(25,26,28,.12)" } as const;
export const TRANSITION = "160ms cubic-bezier(.2,.8,.2,1)";
export const FONTS_CSS = "";
export const inputStyle: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: RADIUS.control, border: `1px solid ${COLORS.lineStrong}`, background: COLORS.surfaceRaised, fontSize: 14, color: COLORS.ink, outline: "none" };
