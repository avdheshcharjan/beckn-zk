"use client";

import { useState } from "react";

export interface SearchFormValues {
  categoryName: string;
  itemName: string;
  gps: string;
  radiusKm: string;
}

interface Props {
  onSubmit: (values: SearchFormValues) => void;
  disabled?: boolean;
}

export function SearchForm({ onSubmit, disabled }: Props) {
  const [values, setValues] = useState<SearchFormValues>({
    categoryName: "cardiology",
    itemName: "ecg",
    gps: "12.97,77.59",
    radiusKm: "5",
  });

  return (
    <form
      className="flex flex-col gap-3 font-mono text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
    >
      {(["categoryName", "itemName", "gps", "radiusKm"] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="opacity-60">{k}</span>
          <input
            className="bg-neutral-900 border border-neutral-700 px-2 py-1"
            value={values[k]}
            onChange={(e) => setValues({ ...values, [k]: e.target.value })}
          />
        </label>
      ))}
      <button
        className="bg-white text-black py-2 disabled:opacity-40"
        disabled={disabled}
      >
        Search
      </button>
    </form>
  );
}
