import type { RiskLevel } from "@/lib/audit";

/**
 * Reproduces plan section 12 verbatim:
 * - LOW: execute automatically if permission exists.
 * - MEDIUM: auto or confirm based on user settings (tool_permissions.requiresConfirmation).
 * - HIGH: always require explicit confirmation, no user override.
 * - CRITICAL: always require confirmation (+ re-authentication, forward-looking — no
 *   CRITICAL tool exists in V1).
 *
 * @param explicitSetting The user's tool_permissions.requiresConfirmation value,
 *   or null if no row exists yet (defaults to requiring confirmation for MEDIUM —
 *   matches the DB column default and doc 3.2's "must not silently store/act").
 */
export function requiresConfirmation(riskLevel: RiskLevel, explicitSetting: boolean | null): boolean {
  switch (riskLevel) {
    case "LOW":
      return false;
    case "MEDIUM":
      return explicitSetting ?? true;
    case "HIGH":
    case "CRITICAL":
      return true;
  }
}
