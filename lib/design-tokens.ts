export const COLORS = {
  background: "#F7F8FA", backgroundWarm: "#FAF8F4", surface: "#FFFFFF", surfaceMuted: "#F0F3FA", surfaceRaised: "#FFFFFF",
  text: "#182033", textMuted: "#626B7C", textFaint: "#626C7E", border: "#E2E5EB", borderStrong: "#CBD1DC",
  brand50: "#F5F7FF", brand100: "#E9EDFF", brand200: "#D7DFFF", brand300: "#B5C0F5", brand400: "#8091E8",
  brand: "#4059D7", brandHover: "#344BC3", brand700: "#293BA2", brand800: "#213174", brandDark: "#172544", brandSoft: "#E9EDFF",
  accent: "#C58A63", accentDark: "#8B5B3E", accentLight: "#F7EEE8", accentSoft: "#F7EEE8", positive: "#2F7657", positiveDark: "#275F48", positiveSoft: "#EAF4EF",
  sand: "#C58A63", sandSoft: "#F7EEE8", warning: "#89631F", warningSoft: "#FBF3DF",

  // Compatibility aliases used by existing product views.
  paper: "#F7F8FA", paperDim: "#F0F3FA", ink: "#182033", inkSoft: "#626B7C", inkFaint: "#626C7E",
  line: "#E2E5EB", lineStrong: "#CBD1DC", blue: "#4059D7", blueSoft: "#E9EDFF", blueDeep: "#172544",
  olive: "#2F7657", oliveSoft: "#EAF4EF", red: "#A84747", redSoft: "#F9ECEC",
  amber: "#89631F", amberSoft: "#FBF3DF", copper: "#C58A63",
} as const;

export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64 } as const;
export const RADIUS = { control: 12, panel: 18, round: 999 } as const;
export const SHADOW = { raised: "0 8px 24px rgba(23,37,68,.055)", floating: "0 18px 46px rgba(23,37,68,.085)" } as const;
export const TRANSITION = "200ms cubic-bezier(.2,.8,.2,1)";
export const FONTS_CSS = "";
export const inputStyle: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: RADIUS.control, border: `1px solid ${COLORS.lineStrong}`, background: COLORS.surfaceRaised, fontSize: 14, color: COLORS.ink, outline: "none" };
