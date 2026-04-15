export const BAP_ID = "beckn-zk-bap";
export const BAP_URI =
  process.env.NEXT_PUBLIC_BAP_URI ?? "http://localhost:3000";

// Phase 2: only one BPP. Phase 5 expands this to three personalities.
export const BPP_URLS: string[] = [
  process.env.NEXT_PUBLIC_BPP_ALPHA_URL ??
    "https://beckn-zk-bpp-alpha.fly.dev",
];
