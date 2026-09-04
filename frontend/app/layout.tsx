import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resumidor de articulos",
  description: "Pegas la URL de un articulo y te devuelve un resumen de 3-4 oraciones.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
