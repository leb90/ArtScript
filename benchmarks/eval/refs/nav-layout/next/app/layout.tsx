import type { ReactNode } from "react";
import Menu from "@/components/Menu";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Menu />
        {children}
      </body>
    </html>
  );
}
