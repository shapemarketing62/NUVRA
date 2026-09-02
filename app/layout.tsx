import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NUVRA — Diagnóstico y estrategia para hacer crecer tu negocio",
  description: "Analizá la presencia digital de tu negocio, entendé qué está frenando su objetivo y convertí la evidencia en prioridades y acciones claras.",
  applicationName: "NUVRA by Shape",
  openGraph: {
    title: "NUVRA — De las señales a decisiones de marketing claras",
    description: "Diagnóstico, prioridades y estrategia de marketing basados en la información real de tu negocio.",
    type: "website",
    locale: "es_AR",
    siteName: "NUVRA by Shape",
  },
  twitter: {
    card: "summary",
    title: "NUVRA — Diagnóstico y estrategia de marketing",
    description: "Convertí las señales de tu negocio en decisiones de marketing claras.",
  },
  icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="shp">{children}</body>
    </html>
  );
}
