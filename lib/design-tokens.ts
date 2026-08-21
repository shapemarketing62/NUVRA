export const COLORS = {
  paper: "#F7F7F5",
  paperDim: "#EFEFEC",
  ink: "#14161A",
  inkSoft: "#5B5F67",
  inkFaint: "#9A9DA3",
  line: "#E2E2DE",
  lineStrong: "#CFCFC9",
  blue: "#2E4BFF",
  blueSoft: "#EEF0FF",
  blueDeep: "#1E33C7",
  olive: "#5C6B4F",
  oliveSoft: "#EBEEE6",
  red: "#C2453A",
  redSoft: "#F8EAE8",
  amber: "#B8860B",
  amberSoft: "#FFF8E7",
} as const;

export const FONTS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
* { box-sizing: border-box; }
.shp { font-family:'Inter',sans-serif; color:#14161A; background:#F7F7F5; }
.shp-display { font-family:'Space Grotesk',sans-serif; }
.shp-mono { font-family:'JetBrains Mono',monospace; }
.shp ::selection { background:#2E4BFF; color:#fff; }
.shp button { font-family:'Inter',sans-serif; cursor:pointer; }
.shp input, .shp select, .shp textarea { font-family:'Inter',sans-serif; }
.shp-scrollbar::-webkit-scrollbar{ width:8px; }
.shp-scrollbar::-webkit-scrollbar-thumb{ background:#DEDEDA; border-radius:8px; }
@keyframes shpFadeUp { from{opacity:0; transform:translateY(10px);} to{opacity:1; transform:translateY(0);} }
@keyframes shpPop { from{opacity:0; transform:scale(.92);} to{opacity:1; transform:scale(1);} }
@keyframes shpSpin { to { transform: rotate(360deg); } }
.shp-fadeup { animation: shpFadeUp .45s ease both; }
.shp-pop { animation: shpPop .3s ease both; }
`;

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${COLORS.line}`,
  background: "#fff",
  fontSize: 14.5,
  color: COLORS.ink,
  outline: "none",
};
