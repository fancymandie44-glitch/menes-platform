"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Line = {
  id: string;
  date_affichee: string | null;
  montant: string;
  label: string;
  type: string;
  sous: string;
  pourquoi: string;
  regle: string;
  ia: boolean;
  statut: string;
  confiance: number;
  source: { raw: string; file: string };
};

export default function Revue() {
  const [lignes, setLignes] = useState<Line[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const r = await api("/api/file");
    if (r.status === 401) {
      window.location.href = "/connexion";
      return;
    }
    setLignes((await r.json()).lignes);
  }
  useEffect(() => {
    load();
  }, []);

  async function valider(id: string) {
    await api(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut: "validee" }),
    });
    load();
  }

  return (
    <main className="wrap">
      <p className="kicker">Risque</p>
      <h1>File d'attente à vérifier</h1>
      <p style={{ color: "var(--muted)" }}>V = valider. Clique une ligne pour voir l'extrait du relevé.</p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Libellé</th>
            <th>Montant</th>
            <th>Pourquoi</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <Fragment key={l.id}>
              <tr onClick={() => setOpen(open === l.id ? null : l.id)}>
                <td>{l.date_affichee ?? "—"}</td>
                <td>
                  {l.label}
                  {l.ia ? " · suggestion IA" : ""}
                  <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                    {l.statut} · confiance {l.confiance}
                  </div>
                </td>
                <td>{l.montant}</td>
                <td>
                  {l.pourquoi}
                  <div style={{ color: "var(--muted)" }}>{l.regle}</div>
                </td>
                <td>
                  <button
                    className="btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      valider(l.id);
                    }}
                  >
                    Valider
                  </button>
                </td>
              </tr>
              {open === l.id ? (
                <tr>
                  <td colSpan={5}>
                    <pre style={{ whiteSpace: "pre-wrap", color: "var(--cream)" }}>{l.source.raw}</pre>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </main>
  );
}
