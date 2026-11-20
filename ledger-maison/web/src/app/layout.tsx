import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Ledger Maison",
  description: "Comptabilité personnelle locale, au cent près.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
