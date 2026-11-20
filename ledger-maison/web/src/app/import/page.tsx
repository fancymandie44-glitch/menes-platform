"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Result = {
  id?: string;
  fichier: string;
  banque?: string;
  statut?: string;
  lignes?: number;
  reconcilie?: boolean;
  delta?: number | null;
  suspects?: string[];
  erreur?: string;
};

export default function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Result[]>([]);

  async function send(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const body = new FormData();
    Array.from(files).forEach((f) => body.append("fichiers", f));
    const r = await api("/api/import", { method: "POST", body });
    if (r.status === 401) {
      window.location.href = "/connexion";
      return;
    }
    const json = await r.json();
    setRows(json.resultats);
    setBusy(false);
  }

  async function exemple() {
    setBusy(true);
    const r = await api("/api/import-exemple", { method: "POST" });
    if (r.status === 401) {
      window.location.href = "/connexion";
      return;
    }
    setRows((await r.json()).resultats);
    setBusy(false);
  }

  return (
    <main className="wrap">
      <p className="kicker">Extraction</p>
      <h1>Importer des relevés</h1>
      <p style={{ color: "var(--muted)" }}>
        PDF, photo, CSV, OFX/QFX, XLSX. Les montants doivent être dans le fichier. Rien n'est inventé.
      </p>
      <label className="drop" style={{ display: "block", marginTop: "1.5rem" }}>
        <input type="file" multiple hidden onChange={(e) => send(e.target.files)} />
        {busy ? "Extraction en cours…" : "Glisse tes relevés ici, ou clique pour choisir."}
      </label>
      <p style={{ marginTop: "1rem" }}>
        <button className="btn" type="button" disabled={busy} onClick={exemple}>
          Charger un relevé d'exemple (Desjardins + Visa, données de test)
        </button>
      </p>
      <div className="grid" style={{ marginTop: "1.5rem" }}>
        {rows.map((row) => (
          <article key={row.fichier} className="card">
            <h3>{row.fichier}</h3>
            {row.erreur ? <p className="bad">{row.erreur}</p> : null}
            {row.statut ? (
              <p className={row.reconcilie ? "ok" : "bad"}>
                {row.banque} · {row.statut}
                {row.delta ? ` · écart ${row.delta} cents` : ""}
              </p>
            ) : null}
            {row.suspects?.length ? (
              <ul>
                {row.suspects.slice(0, 8).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </main>
  );
}
