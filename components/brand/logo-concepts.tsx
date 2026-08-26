import type { SVGProps } from "react";

export type LogoConceptProps = SVGProps<SVGSVGElement> & {
  tone?: "ink" | "light" | "indigo";
  showByShape?: boolean;
  accent?: boolean;
  lockup?: "principal" | "compact" | "symbol" | "favicon";
};

type RefinedLogoProps = LogoConceptProps & { variant: "c1" | "c2" | "c3" };

const toneColor = (tone: LogoConceptProps["tone"]) =>
  tone === "light" ? "#FFFFFF" : tone === "indigo" ? "#3D52B8" : "#17181A";

const accentColor = (tone: LogoConceptProps["tone"]) =>
  tone === "light" ? "#E4A18C" : "#C46B50";

const wordmarkFont = 'Iowan Old Style, Palatino Linotype, Book Antiqua, Georgia, serif';
const interfaceFont = 'Inter, Segoe UI, Arial, sans-serif';

function C1Symbol({ color, accent, accentTone, favicon = false }: { color: string; accent: boolean; accentTone: string; favicon?: boolean }) {
  const width = favicon ? 3.1 : 2.35;
  return <g fill="none" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M8 10H43M8 10V18M8 44V52H43" stroke={color} strokeWidth={width}/>
    <path d="M8 44V18L35 45V17" stroke={color} strokeWidth={favicon ? 3.45 : 2.75}/>
    {accent && <path d="M43 10V18" stroke={accentTone} strokeWidth={favicon ? 3.45 : 2.9}/>} 
  </g>;
}

function C2Symbol({ color, accent, accentTone, favicon = false }: { color: string; accent: boolean; accentTone: string; favicon?: boolean }) {
  const width = favicon ? 3.25 : 2.4;
  return <g fill="none" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M9 22V10H36M15 52H43" stroke={color} strokeWidth={width}/>
    <path d="M17 45V20L36 45V16" stroke={color} strokeWidth={favicon ? 3.5 : 2.8}/>
    {accent && <path d="M36 10H43V16" stroke={accentTone} strokeWidth={favicon ? 3.4 : 2.75}/>} 
  </g>;
}

function C3Symbol({ color, accent, accentTone, favicon = false }: { color: string; accent: boolean; accentTone: string; favicon?: boolean }) {
  const width = favicon ? 3.2 : 2.4;
  return <g fill="none" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M8 10H42M8 10V52H31" stroke={color} strokeWidth={width}/>
    <path d="M17 45V19L37 46V17" stroke={color} strokeWidth={favicon ? 3.45 : 2.8}/>
    <path d="M37 46H43V38" stroke={color} strokeWidth={width}/>
    {accent && <path d="M31 52H38" stroke={accentTone} strokeWidth={favicon ? 3.4 : 2.8}/>} 
  </g>;
}

function RefinedLogo({ variant, tone = "ink", showByShape = true, accent = true, lockup = "principal", ...props }: RefinedLogoProps) {
  const color = toneColor(tone);
  const terracotta = accentColor(tone);
  const symbolOnly = lockup === "symbol" || lockup === "favicon";
  const favicon = lockup === "favicon";
  const includeByShape = showByShape && lockup === "principal";
  const viewBox = symbolOnly ? "0 0 52 62" : "0 0 190 72";
  const Symbol = variant === "c1" ? C1Symbol : variant === "c2" ? C2Symbol : C3Symbol;

  return <svg viewBox={viewBox} role="img" aria-label={`NUVRA Marco de lectura ${variant.toUpperCase()}`} {...props}>
    <Symbol color={color} accent={accent} accentTone={terracotta} favicon={favicon}/>
    {!symbolOnly && <>
      <text x="55" y="46" fill={color} fontFamily={wordmarkFont} fontSize="34" fontWeight="600" letterSpacing="1.35">NUVRA</text>
      {includeByShape && <text x="57" y="64" fill={color} opacity=".52" fontFamily={interfaceFont} fontSize="7.8" fontWeight="500" letterSpacing=".65">by Shape</text>}
    </>}
  </svg>;
}

export function LogoConceptFrameC1(props: LogoConceptProps) { return <RefinedLogo variant="c1" {...props}/>; }
export function LogoConceptFrameC2(props: LogoConceptProps) { return <RefinedLogo variant="c2" {...props}/>; }
export function LogoConceptFrameC3(props: LogoConceptProps) { return <RefinedLogo variant="c3" {...props}/>; }

// Kept for internal compatibility until one refinement is selected.
export function LogoConceptFrame(props: LogoConceptProps) { return <LogoConceptFrameC1 {...props}/>; }
