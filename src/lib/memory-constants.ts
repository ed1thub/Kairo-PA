// Shared between src/tools/schemas.ts (server-side zod validation) and
// src/components/memory/memory-panel.tsx (client component). Kept
// dependency-free so importing it client-side doesn't pull zod into the
// browser bundle.
export const MEMORY_CATEGORIES = ["preference", "contact", "project", "routine"] as const;
export const MEMORY_SENSITIVITIES = ["normal", "sensitive"] as const;
