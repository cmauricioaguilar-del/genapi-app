import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "GENAPI — API SII Chile | Extrae facturas, RCV y F29 en minutos",
    template: "%s | GENAPI",
  },
  description: "GENAPI es la API REST para conectar tu software al SII de Chile. Extrae ventas, compras, boletas de honorarios y Formulario 29 directamente del SII. Alternativa a ApiPyme. Desde $24.900/mes con IVA.",
  keywords: [
    "API SII Chile",
    "extracción SII Chile",
    "API facturas SII",
    "RCV API Chile",
    "registro compras ventas SII",
    "API tributaria Chile",
    "Formulario 29 API",
    "boletas honorarios API Chile",
    "integración SII empresas",
    "alternativa ApiPyme",
    "ApiPyme alternativa",
    "extracción datos SII",
    "SII REST API",
    "software contable SII Chile",
    "conectar software SII",
    "automatización SII Chile",
    "API IVA Chile",
    "GENAPI",
    "genapi.cl",
  ],
  authors: [{ name: "GENAPI", url: "https://genapi.cl" }],
  creator: "GENAPI",
  metadataBase: new URL("https://genapi.cl"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CL",
    url: "https://genapi.cl",
    siteName: "GENAPI",
    title: "GENAPI — API SII Chile | Extrae facturas, RCV y F29 en minutos",
    description: "Conecta tu software al SII de Chile en minutos. API REST para extraer ventas, compras, honorarios y F29 directamente del SII. Sin burocracia, más barato que la competencia.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "GENAPI — API SII Chile",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GENAPI — API SII Chile",
    description: "Extrae ventas, compras, honorarios y F29 del SII directamente desde tu software. Desde $24.900/mes.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
