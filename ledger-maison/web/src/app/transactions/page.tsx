"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Line = {
  id: string;
  date_affichee: string | null;
  montant: string;
  label: string;
  type: string;
  sous: string;
  statut: string;
  posted: boolean;
};

export default function Livre() {
  const [lignes, setLignes] = useState<Line[]>([]);
  useEffect(() => {
    api("/api/transactions")
      .then((r) => r.json())
      .then((d) => setLignes(d.lignes));
  }, []);
  return (
    <main className="wrap">
      <p className="kicker">Écritures</p>
      <h1>Grand livre</h1>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Libellé</th>
            <th>Type</th>
            <th>Montant</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <td>{l.date_affichee ?? "—"}</td>
              <td>{l.label}</td>
              <td>
                {l.type} / {l.sous}
              </td>
              <td>{l.montant}</td>
              <td className={l.posted ? "ok" : "warn"}>{l.posted ? "au journal" : l.statut}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
