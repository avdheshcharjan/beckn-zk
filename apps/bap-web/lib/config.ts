export const BAP_ID = "beckn-zk-bap";
export const BAP_URI =
  process.env.NEXT_PUBLIC_BAP_URI ?? "http://localhost:3000";

export interface BppTarget {
  id: "lab-alpha" | "lab-beta" | "lab-gamma";
  label: string;
  url: string;
  personality: "ignorant" | "required" | "preferred";
}

export const LEDGER_URL =
  process.env.NEXT_PUBLIC_LEDGER_URL ?? "https://beckn-zk-ledger.fly.dev";

export type BecknMode = "direct" | "onix";

export const BECKN_MODE: BecknMode =
  (process.env.BECKN_MODE as BecknMode) ?? "direct";

export const ONIX_BAP_URL =
  process.env.ONIX_BAP_URL ?? "http://localhost:8081";

export const BAP_SUBSCRIBER_URI =
  process.env.BAP_SUBSCRIBER_URI ?? "http://onix-bap:8081/bap/receiver/";

export const BPP_TARGETS: BppTarget[] = [
  {
    id: "lab-alpha",
    label: "Lab Alpha (ZK-ignorant)",
    url:
      process.env.NEXT_PUBLIC_BPP_ALPHA_URL ??
      "https://beckn-zk-bpp-alpha.fly.dev",
    personality: "ignorant",
  },
  {
    id: "lab-beta",
    label: "Lab Beta (ZK-required)",
    url:
      process.env.NEXT_PUBLIC_BPP_BETA_URL ??
      "https://beckn-zk-bpp-beta.fly.dev",
    personality: "required",
  },
  {
    id: "lab-gamma",
    label: "Lab Gamma (ZK-preferred)",
    url:
      process.env.NEXT_PUBLIC_BPP_GAMMA_URL ??
      "https://beckn-zk-bpp-gamma.fly.dev",
    personality: "preferred",
  },
];
