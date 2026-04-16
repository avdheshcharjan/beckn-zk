import type { OnSearchResponse } from "@beckn-zk/core";

interface Props {
  outcomes: {
    bppId?: string;
    bppUrl: string;
    status: number;
    body: OnSearchResponse | { error: { code: string; message: string } };
  }[];
}

export function CatalogList({ outcomes }: Props) {
  return (
    <div className="flex flex-col gap-4 font-mono text-sm">
      {outcomes.map((o) => {
        const isSuccess = "context" in o.body;
        return (
          <div key={o.bppId ?? o.bppUrl} className="border border-neutral-800 p-3">
            <div className="flex justify-between opacity-60 text-xs">
              <span>{o.bppId ?? o.bppUrl}</span>
              <span>{o.status}</span>
            </div>
            {isSuccess ? (
              <ul className="mt-2">
                {(o.body as OnSearchResponse).message.catalog.providers.flatMap(
                  (p) =>
                    p.items.map((it) => (
                      <li key={p.id + it.id} className="flex justify-between">
                        <span>{it.descriptor.name ?? it.id}</span>
                        <span className="opacity-60">
                          {it.price.value} {it.price.currency}
                        </span>
                      </li>
                    )),
                )}
              </ul>
            ) : (
              <div className="text-red-400 mt-2">
                {(() => {
                  const b = o.body as Record<string, unknown>;
                  const err = (b.error as Record<string, string>) ?? b;
                  return `${err.code ?? o.status}: ${err.message ?? "error"}`;
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
