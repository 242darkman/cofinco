import { SessionComputedStatus } from "@shared/enums";
import type { SessionCaisse } from "@shared/schema";

type SessionTiming = Pick<SessionCaisse, "openedAt" | "closedAt" | "timeoutAt">;

export function computeSessionStatus(session: SessionTiming, now: Date = new Date()): SessionComputedStatus {
  if (session.closedAt) {
    return SessionComputedStatus.CLOSED;
  }

  if (session.openedAt && session.timeoutAt && session.timeoutAt.getTime() <= now.getTime()) {
    return SessionComputedStatus.TIMED_OUT;
  }

  return SessionComputedStatus.OPEN;
}
