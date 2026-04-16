"use client";

import { AnonAadhaarProvider } from "@anon-aadhaar/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  // Test mode uses the bundled test QR and a deterministic verification key.
  return (
    <AnonAadhaarProvider _useTestAadhaar={true}>
      {children}
    </AnonAadhaarProvider>
  );
}
