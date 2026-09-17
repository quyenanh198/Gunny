import test from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION, validateClientMessage, validateResumeMessage } from "../src/play/protocol.js";

const message = (body) => ({ protocolVersion: PROTOCOL_VERSION, clientSeq: 1, requestId: "request-1", ...body });

test("protocol accepts a valid versioned input", () => {
  assert.deepEqual(validateClientMessage(message({ t: "aim", angle: 45 })), { ok: true });
});

test("protocol rejects wrong versions, malformed payloads and unknown types", () => {
  assert.equal(validateClientMessage({ ...message({ t: "aim", angle: 45 }), protocolVersion: 99 }).code, "VERSION_MISMATCH");
  assert.equal(validateClientMessage(message({ t: "aim", angle: "45" })).code, "INVALID_PAYLOAD");
  assert.equal(validateClientMessage(message({ t: "keys", keys: ["left", "hack"] })).code, "INVALID_PAYLOAD");
  assert.equal(validateClientMessage(message({ t: "aim", angle: 45, hp: 999 })).code, "INVALID_PAYLOAD");
  assert.equal(validateClientMessage(message({ t: "unknown" })).code, "UNKNOWN_MESSAGE");
});

test("protocol requires a positive integer sequence", () => {
  assert.equal(validateClientMessage({ protocolVersion: PROTOCOL_VERSION, t: "charge" }).code, "INVALID_SEQUENCE");
  assert.equal(validateClientMessage(message({ t: "charge", clientSeq: 1.5 })).code, "INVALID_SEQUENCE");
});

test("protocol requires request ids and validates resume credentials separately", () => {
  assert.equal(validateClientMessage({ protocolVersion: PROTOCOL_VERSION, clientSeq: 1, t: "charge" }).code,
    "INVALID_REQUEST_ID");
  assert.deepEqual(validateResumeMessage({ t: "resume", protocolVersion: PROTOCOL_VERSION,
    room: "ABCDEF", reconnectToken: "1234567890abcdef" }), { ok: true });
  assert.equal(validateResumeMessage({ t: "resume", protocolVersion: PROTOCOL_VERSION,
    room: "ABCD", reconnectToken: "short" }).code, "INVALID_PAYLOAD");
});

test("protocol validates server-owned combat selections", () => {
  assert.deepEqual(validateClientMessage(message({ t: "action", shot: "s2", item: "power" })), { ok: true });
  assert.equal(validateClientMessage(message({ t: "action", shot: "god", item: "power" })).code, "INVALID_PAYLOAD");
  assert.equal(validateClientMessage(message({ t: "action", shot: "ss", ss: 100 })).code, "INVALID_PAYLOAD");
});

test("protocol bounds chat and kick commands", () => {
  assert.deepEqual(validateClientMessage(message({ t: "chat", text: "xin chào" })), { ok: true });
  assert.equal(validateClientMessage(message({ t: "chat", text: "x".repeat(161) })).code, "INVALID_PAYLOAD");
  assert.equal(validateClientMessage(message({ t: "kick", id: 0 })).code, "INVALID_PAYLOAD");
});
