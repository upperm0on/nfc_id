import test from "node:test";
import assert from "node:assert/strict";
import { authorizationCategories, facilities, students } from "../src/data/mockData.js";
import { evaluateVerification, resolveCard } from "../src/services/verification.js";
import { normalizeNdefMessage } from "../src/services/nfc.js";

const mappings = students.map((student, index) => ({
  cardValue: `fixture-card-${index + 1}`,
  studentId: student.studentId,
}));

function verify(cardValue, mode, extra = {}) {
  return evaluateVerification({
    mode,
    cardValue,
    mappings,
    studentRecords: students,
    facilityRecords: facilities,
    authorizationRecords: authorizationCategories,
    ...extra,
  });
}

test("resolves an explicitly configured card mapping", () => {
  assert.equal(resolveCard("fixture-card-1", mappings, students).student.studentId, "STU-240184");
});

test("unknown cards and ambiguous mappings fail safely", () => {
  assert.equal(verify("not-configured", "identity").reasonCode, "UNKNOWN_CARD");
  assert.equal(resolveCard("fixture-card-1", [...mappings, mappings[0]], students).reasonCode, "AMBIGUOUS_CARD_MAPPING");
});

test("active student passes identity verification", () => {
  const result = verify("fixture-card-1", "identity");
  assert.equal(result.outcome, "identity_verified");
  assert.equal(result.success, true);
});

test("blocked and expired cards and suspended students fail identity checks", () => {
  assert.equal(verify("fixture-card-3", "identity").reasonCode, "CARD_BLOCKED");
  assert.equal(verify("fixture-card-4", "identity").reasonCode, "STUDENT_SUSPENDED");
  assert.equal(verify("fixture-card-5", "identity").reasonCode, "CARD_EXPIRED");
});

test("facility rules grant permitted access and deny restricted or closed access", () => {
  assert.equal(verify("fixture-card-1", "facility", { facilityId: "LIB-01" }).outcome, "granted");
  assert.equal(verify("fixture-card-1", "facility", { facilityId: "WORKSHOP-01" }).reasonCode, "FACILITY_PERMISSION_MISSING");
  assert.equal(verify("fixture-card-1", "facility", { facilityId: "MED-01" }).reasonCode, "FACILITY_CLOSED");
  assert.equal(verify("fixture-card-1", "facility", { facilityId: "no-such-facility" }).reasonCode, "INVALID_FACILITY");
});

test("authorization requirements are evaluated independently from facility access", () => {
  assert.equal(verify("fixture-card-1", "authorization", { authorizationId: "examination" }).outcome, "granted");
  assert.equal(verify("fixture-card-7", "authorization", { authorizationId: "examination" }).reasonCode, "AUTHORIZATION_REQUIREMENT_NOT_MET");
  assert.equal(verify("fixture-card-1", "authorization", { authorizationId: "missing" }).reasonCode, "INVALID_AUTHORIZATION");
});

test("a mapping to a missing student does not verify identity", () => {
  const result = resolveCard("orphaned", [{ cardValue: "orphaned", studentId: "missing" }], students);
  assert.equal(result.reasonCode, "STUDENT_NOT_FOUND");
});

test("unknown mode fails closed", () => {
  assert.equal(verify("fixture-card-1", "other-mode").reasonCode, "INVALID_VERIFICATION_MODE");
});

test("NDEF parser accepts one text record without guessing the card format", () => {
  const bytes = Uint8Array.from([2, 101, 110, ...new TextEncoder().encode("configured identifier")]);
  const result = normalizeNdefMessage({
    records: [{ recordType: "text", data: new DataView(bytes.buffer) }],
  });
  assert.equal(result, "configured identifier");
});

test("NDEF parser rejects missing and ambiguous text records", () => {
  assert.throws(() => normalizeNdefMessage({ records: [] }), /No supported NDEF text record/);
  const data = new DataView(Uint8Array.from([2, 101, 110, 97]).buffer);
  assert.throws(() => normalizeNdefMessage({
    records: [
      { recordType: "text", data },
      { recordType: "text", data },
    ],
  }), /Multiple NDEF text records/);
});
