"use client";

import { useState } from "react";

export default function Calc() {
  const [a, setA] = useState("1");
  const [b, setB] = useState("1");
  const [op, setOp] = useState("+");
  const [grams, setGrams] = useState("10");
  const [out, setOut] = useState<string>("");

  async function run(payload: object) {
    const r = await fetch("/api/calculatrice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setOut(JSON.stringify(await r.json(), null, 2));
  }

  return (
    <main className="wrap">
      <p className="kicker">Outils</p>
      <h1>Calculatrice</h1>
      <div className="grid cards">
        <article className="card">
          <h3>Opérations</h3>
          <div className="grid" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
            <input value={a} onChange={(e) => setA(e.target.value)} />
            <select value={op} onChange={(e) => setOp(e.target.value)}>
              <option>+</option>
              <option>-</option>
              <option>*</option>
              <option>/</option>
            </select>
            <input value={b} onChange={(e) => setB(e.target.value)} />
          </div>
          <button className="btn" type="button" onClick={() => run({ a: Number(a), b: Number(b), op })}>
            Calculer
          </button>
        </article>
        <article className="card">
          <h3>Or (once troy, 24k → CAD)</h3>
          <input value={grams} onChange={(e) => setGrams(e.target.value)} />
          <p style={{ color: "var(--muted)" }}>grammes</p>
          <button className="btn" type="button" onClick={() => run({ op: "or", grams: Number(grams), purity: "24k" })}>
            Valeur
          </button>
        </article>
      </div>
      <pre className="card" style={{ marginTop: "1rem" }}>
        {out || "Résultat ici. Si l'API or échoue : indisponible, aucun prix inventé."}
      </pre>
      <p style={{ color: "var(--muted)" }}>Informations à titre indicatif, pas un conseil financier.</p>
    </main>
  );
}
