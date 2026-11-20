"use client";

import { useEffect, useState } from "react";
import { api, readToken } from "@/lib/api";

type Dash = {
  affichage: { revenus: string; depenses: string; net: string; incertitude: string };
  a_verifier: number;
  incertitude_cents: number;
  epargne: number | null;
  categories: Record<string, number>;
};

export default function Home() {
  const [data, setData] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!readToken()) {
      window.location.replace("/connexion");
      return;
    }
    api("/api/tableau")
      .then(async (r) => {
        if (r.status === 401) {
          window.location.replace("/connexion");
          return;
        }
        if (!r.ok) {
          setErr("Le tableau n’a pas pu s’ouvrir. Réessaie.");
          return;
        }
        setData(await r.json());
      })
      .catch(() => setErr("API injoignable. Réessaie dans un instant."));
  }, []);
  if (err)
    return (
      <main className="wrap">
        <p>{err}</p>
        <p>
          <a href="/connexion">Retour à la connexion</a>
        </p>
      </main>
    );
  if (!data)
    return (
      <main className="wrap">
        <p>Chargement du tableau…</p>
        <p>
          <a href="/connexion">Si rien ne s’ouvre, clique ici.</a>
        </p>
      </main>
    );
  return (
    <main className="wrap">
      <p className="kicker">Maison</p>
      <h1>Tableau de bord</h1>
      {data.a_verifier > 0 ? (
        <p className="banner">
          {data.a_verifier} ligne(s) à vérifier ou en conflit. Incertitude : {data.affichage.incertitude}. Ces montants
          ne sont pas dans les totaux.
        </p>
      ) : null}
      <div className="grid cards" style={{ marginTop: "1.5rem" }}>
        <article className="card">
          <p className="kicker">Revenus validés</p>
          <h2>{data.affichage.revenus}</h2>
        </article>
        <article className="card">
          <p className="kicker">Dépenses validées</p>
          <h2>{data.affichage.depenses}</h2>
        </article>
        <article className="card">
          <p className="kicker">Flux net</p>
          <h2>{data.affichage.net}</h2>
        </article>
        <article className="card">
          <p className="kicker">Taux d'épargne</p>
          <h2>{data.epargne === null ? "—" : `${data.epargne} %`}</h2>
        </article>
      </div>
      <p style={{ color: "var(--muted)", marginTop: "1.5rem" }}>
        Les transferts internes ne sont ni un revenu ni une dépense. Informations à titre indicatif, pas un conseil
        financier.
      </p>
    </main>
  );
}
