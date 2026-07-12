import { getWsInstance } from "../../ws-server";

/** Broadcast a transfert coffre event to all connected clients */
export function broadcastTransfertUpdate(action: string, transfertId: string, payload?: any) {
  const ws = getWsInstance();
  if (ws) {
    ws.broadcast({
      type: "TRANSFERT_COFFRE_UPDATED",
      payload: { action, transfertId, ...payload },
    });
  }
}
