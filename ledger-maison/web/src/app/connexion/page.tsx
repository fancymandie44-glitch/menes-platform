"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, saveToken } from "@/lib/api";

export default function Connexion() {
  const [installe, setInstalle] = useState<boolean | null>(null);
  const [pwd, setPwd] = useState("");
  const [totp, setTotp] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/etat")
      .then((r) => r.json())
      .then((d) => setInstalle(d.installe))
      .catch(() => setMsg("Le serveur ne répond pas. Réessaie dans un instant."));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const first = installe ? "/api/connexion" : "/api/installation";
      let r = await api(first, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mot_de_passe: pwd, totp: totp || null }),
      });
      if (r.status === 409) {
        r = await api("/api/connexion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mot_de_passe: pwd, totp: totp || null }),
        });
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(data.detail ? String(data.detail) : "Mot de passe refusé. Réessaie.");
        return;
      }
      if (data.token) saveToken(data.token);
      window.location.replace("/");
    } catch {
      setMsg("Connexion coupée. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <p className="kicker">Privé</p>
      <h1>{installe ? "Déverrouiller" : "Créer le coffre"}</h1>
      <p style={{ color: "var(--muted)" }}>
        Entre un mot de passe d’au moins 8 caractères, puis clique le bouton. Tu arrives ensuite sur le tableau de
        bord.
      </p>
      <form onSubmit={onSubmit} className="grid" style={{ marginTop: "1.5rem" }}>
        <input
          type="password"
          required
          minLength={8}
          name="password"
          autoComplete="current-password"
          placeholder="Mot de passe"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        {installe ? (
          <input inputMode="numeric" placeholder="TOTP (seulement si tu l’as activé)" value={totp} onChange={(e) => setTotp(e.target.value)} />
        ) : null}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Ouverture…" : installe ? "Entrer" : "Installer"}
        </button>
        {msg ? <p className="bad">{msg}</p> : null}
      </form>
    </main>
  );
}
