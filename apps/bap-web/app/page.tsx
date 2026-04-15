"use client";

import { useState } from "react";
import { SearchForm, type SearchFormValues } from "./components/SearchForm";
import { CatalogList } from "./components/CatalogList";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [outcomes, setOutcomes] = useState<
    Parameters<typeof CatalogList>[0]["outcomes"]
  >([]);

  async function onSubmit(values: SearchFormValues) {
    setLoading(true);
    try {
      const res = await fetch("/api/bap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        throw new Error(`search failed: ${res.status}`);
      }
      const json = (await res.json()) as {
        outcomes: Parameters<typeof CatalogList>[0]["outcomes"];
      };
      setOutcomes(json.outcomes);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-mono mb-6">Private Beckn — DHP</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SearchForm onSubmit={onSubmit} disabled={loading} />
          <CatalogList outcomes={outcomes} />
        </div>
      </div>
    </main>
  );
}
