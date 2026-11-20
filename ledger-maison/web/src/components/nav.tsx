"use client";

import Link from "next/link";

const LINKS = [
  ["/", "Tableau"],
  ["/import", "Import"],
  ["/revue", "File d'attente"],
  ["/transactions", "Grand livre"],
  ["/calculatrice", "Calculatrice"],
  ["/marches", "Marchés"],
];

export function Nav() {
  return (
    <nav className="nav">
      <strong style={{ fontFamily: "Georgia, serif", fontSize: "1.25rem" }}>Ledger Maison</strong>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
