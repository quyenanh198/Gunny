export function connectionParams(url) {
  const params = new URL(url, "http://x").searchParams;
  return {
    room: (params.get("room") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4),
    name: (params.get("name") || "Khách").slice(0, 16).trim() || "Khách",
    reconnectToken: (params.get("reconnectToken") || "").slice(0, 64),
  };
}

export function parseMessage(data) {
  if (data.byteLength > MAX_MESSAGE_BYTES) return { error: "MESSAGE_TOO_LARGE" };
  try {
    const message = JSON.parse(data);
    const result = validateClientMessage(message);
    return result.ok ? { message } : { error: result.code };
  } catch {
    return { error: "INVALID_JSON" };
  }
}
import { MAX_MESSAGE_BYTES, validateClientMessage } from "../src/play/protocol.js";
