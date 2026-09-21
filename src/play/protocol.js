export const PROTOCOL_VERSION = 2;
export const MAX_MESSAGE_BYTES = 4096;

const keys = new Set(["left", "right", "up", "down"]);
const validators = {
  team: (message) => message.team === null || message.team === 0 || message.team === 1,
  ready: (message) => typeof message.value === "boolean",
  loadout: (message) =>
    (message.character === undefined || typeof message.character === "string") &&
    (message.weapon === undefined || typeof message.weapon === "string"),
  setup: (message) =>
    (message.map === undefined || typeof message.map === "string") &&
    (message.difficulty === undefined || typeof message.difficulty === "string") &&
    (message.bots === undefined ||
      (Array.isArray(message.bots) && message.bots.length === 2 && message.bots.every(Number.isInteger))),
  start: () => true,
  restart: () => true,
  lobby: () => true,
  keys: (message) => Array.isArray(message.keys) && message.keys.length <= 4 && message.keys.every((key) => keys.has(key)),
  aim: (message) => Number.isFinite(message.angle),
  charge: () => true,
  release: () => true,
  cancel: () => true,
  action: (message) =>
    (message.shot === undefined || ["s1", "s2", "ss"].includes(message.shot)) &&
    (message.item === undefined || message.item === null || ["power", "blood", "teleport", "dual"].includes(message.item)),
  chat: (message) => typeof message.text === "string" && message.text.trim().length > 0 && message.text.length <= 160,
  kick: (message) => Number.isSafeInteger(message.id) && message.id > 0,
  // Rời phòng hẳn, khác với mất kết nối: server bỏ ghế ngay thay vì giữ chỗ chờ nối lại.
  leave: () => true,
};
const fields = {
  team: ["team"], ready: ["value"], loadout: ["character", "weapon"], setup: ["map", "difficulty", "bots"],
  start: [], restart: [], lobby: [], keys: ["keys"], aim: ["angle"], charge: [], release: [], cancel: [], action: ["shot", "item"], chat: ["text"], kick: ["id"], leave: [],
};

export function validateClientMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return { code: "INVALID_MESSAGE" };
  if (message.protocolVersion !== PROTOCOL_VERSION) return { code: "VERSION_MISMATCH" };
  if (!Number.isSafeInteger(message.clientSeq) || message.clientSeq < 1) return { code: "INVALID_SEQUENCE" };
  if (typeof message.requestId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(message.requestId))
    return { code: "INVALID_REQUEST_ID" };
  const validate = validators[message.t];
  if (!validate) return { code: "UNKNOWN_MESSAGE" };
  const allowed = new Set(["protocolVersion", "clientSeq", "requestId", "t", ...fields[message.t]]);
  if (Object.keys(message).some((key) => !allowed.has(key))) return { code: "INVALID_PAYLOAD" };
  return validate(message) ? { ok: true } : { code: "INVALID_PAYLOAD" };
}

export function validateResumeMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return { code: "INVALID_MESSAGE" };
  if (message.protocolVersion !== PROTOCOL_VERSION) return { code: "VERSION_MISMATCH" };
  if (message.t !== "resume") return { code: "RESUME_REQUIRED" };
  if (!/^[A-Z]{6}$/.test(message.room || "")) return { code: "INVALID_PAYLOAD" };
  if (typeof message.reconnectToken !== "string" || message.reconnectToken.length < 16 || message.reconnectToken.length > 64)
    return { code: "INVALID_PAYLOAD" };
  const allowed = new Set(["protocolVersion", "t", "room", "reconnectToken"]);
  return Object.keys(message).every((key) => allowed.has(key)) ? { ok: true } : { code: "INVALID_PAYLOAD" };
}
