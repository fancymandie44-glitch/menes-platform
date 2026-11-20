"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  change_pct: number | null;
  as_of: string;
  stale: boolean;
  error: string | null;
};

export default function Marches() {
  const [or, setOr] = useState<Record<string, Quote> | null>(null);
  const [q, setQ] = useState("SHOP.TO");
  const [fav, setFav] = useState<Quote[]>([]);
  const [fiche, setFiche] = useState<string>("");

  async function load() {
    const m = await (await api("/api/marches/or")).json();
    setOr({ or: m.or, argent: m.argent, platine: m.platine });
    const f = await api("/api/marches/favoris");
    if (f.ok) setFav((await f.json()).favoris);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    await api("/api/marches/favoris", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: q }),
    });
    load();
  }

  async function info(symbol: string) {
    const r = await api(`/api/marches/fiche/${symbol}`);
    setFiche(JSON.stringify(await r.json(), null, 2));
  }

  return (
    <main className="wrap">
      <p className="kicker">Marchés</p>
      <h1>Or et titres</h1>
      <p className="banner">Informations à titre indicatif, pas un conseil financier.</p>
      <div className="grid cards" style={{ marginTop: "1rem" }}>
        {or
          ? Object.entries(or).map(([k, v]) => (
              <article className="card" key={k}>
                <p className="kicker">{k}</p>
                <h2>{v.price ?? "indisponible"}</h2>
                <p style={{ color: "var(--muted)" }}>
                  Mis à jour à {v.as_of}
                  {v.stale ? " · dernière valeur connue" : ""}
                </p>
              </article>
            ))
          : null}
      </div>
      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Favoris</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbole" />
          <button className="btn" type="button" onClick={add}>
            ★ Ajouter
          </button>
        </div>
        <table>
          <tbody>
            {fav.map((f) => (
              <tr key={f.symbol}>
                <td>{f.symbol}</td>
                <td>{f.price ?? "indisponible"}</td>
                <td>{f.change_pct ?? "—"}</td>
                <td>
                  <button className="btn-line" type="button" onClick={() => info(f.symbol)}>
                    i
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre>{fiche}</pre>
      </div>
    </main>
  );
}
