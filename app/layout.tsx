import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NUVRA by Shape — Diagnóstico y estrategia de marketing",
  description: "Plataforma tecnológica de diagnóstico y estrategia de marketing para PyMEs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="shp">{children}</body>
    </html>
  );
}
