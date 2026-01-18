export * from "./enum/enums";

export const SessionComputedStatus = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  TIMED_OUT: "TIMED_OUT",
} as const;

export type SessionComputedStatus = (typeof SessionComputedStatus)[keyof typeof SessionComputedStatus];

export const ForcedCloseReason = {
  TIMEOUT_AUTO: "TIMEOUT_AUTO",
  ADMIN_FORCE: "ADMIN_FORCE",
} as const;

export type ForcedCloseReason = (typeof ForcedCloseReason)[keyof typeof ForcedCloseReason];
