const normalizeCardValue = (value) => String(value ?? "").trim();

export function resolveCard(cardValue, mappings, studentRecords) {
  const key = normalizeCardValue(cardValue);
  if (!key) {
    return { status: "unrecognized", student: null, reasonCode: "UNSUPPORTED_CARD_DATA" };
  }

  const matches = mappings.filter(
    (mapping) => normalizeCardValue(mapping.cardValue) === key,
  );
  if (matches.length > 1) {
    return { status: "ambiguous", student: null, reasonCode: "AMBIGUOUS_CARD_MAPPING" };
  }
  if (matches.length === 0) {
    return { status: "unrecognized", student: null, reasonCode: "UNKNOWN_CARD" };
  }

  const student = studentRecords.find((record) => record.studentId === matches[0].studentId);
  if (!student) {
    return { status: "unrecognized", student: null, reasonCode: "STUDENT_NOT_FOUND" };
  }
  return { status: "matched", student, reasonCode: null };
}

function credentialFailure(student) {
  if (student.cardStatus === "blocked") {
    return {
      reasonCode: "CARD_BLOCKED",
      message: "The student card is blocked.",
    };
  }
  if (student.cardStatus === "expired") {
    return {
      reasonCode: "CARD_EXPIRED",
      message: "The student card has expired.",
    };
  }
  if (student.cardStatus !== "active") {
    return {
      reasonCode: "CARD_STATUS_INVALID",
      message: "The card is not an active credential.",
    };
  }
  if (student.enrolmentStatus === "suspended") {
    return {
      reasonCode: "STUDENT_SUSPENDED",
      message: "The student's enrolment is suspended.",
    };
  }
  if (student.enrolmentStatus !== "active") {
    return {
      reasonCode: "STUDENT_INACTIVE",
      message: "The student's enrolment is not active.",
    };
  }
  return null;
}

function unknownIdentityResult(resolution, mode) {
  const messages = {
    UNKNOWN_CARD: "This card data is not mapped to a student record.",
    STUDENT_NOT_FOUND: "The card mapping points to a student record that does not exist.",
    AMBIGUOUS_CARD_MAPPING: "More than one student mapping matches this card; the request was stopped.",
    UNSUPPORTED_CARD_DATA: "The NFC tag did not contain a supported text record.",
  };
  const isIdentity = mode === "identity";
  return {
    success: false,
    outcome: isIdentity ? "identity_unverified" : "denied",
    reasonCode: resolution.reasonCode,
    message: messages[resolution.reasonCode] ?? "The card could not be matched.",
    student: null,
    facility: null,
    authorization: null,
    checks: [{ name: "Student match", passed: false }],
  };
}

export function evaluateVerification({
  mode,
  cardValue,
  mappings,
  studentRecords,
  facilityRecords,
  authorizationRecords,
  facilityId,
  authorizationId,
}) {
  const resolution = resolveCard(cardValue, mappings, studentRecords);
  if (resolution.status !== "matched") return unknownIdentityResult(resolution, mode);

  const student = resolution.student;
  const invalidCredential = credentialFailure(student);
  if (invalidCredential) {
    return {
      success: false,
      outcome: mode === "identity" ? "identity_unverified" : "denied",
      reasonCode: invalidCredential.reasonCode,
      message: invalidCredential.message,
      student,
      facility: null,
      authorization: null,
      checks: [{ name: "Credential and enrolment", passed: false }],
    };
  }

  if (mode === "identity") {
    return {
      success: true,
      outcome: "identity_verified",
      reasonCode: "IDENTITY_VERIFIED",
      message: "Identity matched an active student record and the card is valid.",
      student,
      facility: null,
      authorization: null,
      checks: [{ name: "Credential and enrolment", passed: true }],
    };
  }

  if (mode === "facility") {
    const facility = facilityRecords.find((record) => record.facilityId === facilityId);
    if (!facility) {
      return {
        success: false,
        outcome: "denied",
        reasonCode: "INVALID_FACILITY",
        message: "Select a configured facility before scanning.",
        student,
        facility: null,
        authorization: null,
        checks: [{ name: "Facility selection", passed: false }],
      };
    }
    if (facility.status === "closed") {
      return {
        success: false,
        outcome: "denied",
        reasonCode: "FACILITY_CLOSED",
        message: `${facility.name} is closed; normal entry is not granted.`,
        student,
        facility,
        authorization: null,
        checks: [{ name: "Facility operational status", passed: false }],
      };
    }
    if (
      facility.accessRules.requiredAuthorizationId &&
      student.authorizationEligibility[facility.accessRules.requiredAuthorizationId] !== true
    ) {
      return {
        success: false,
        outcome: "denied",
        reasonCode: "FACILITY_REQUIREMENT_NOT_MET",
        message: `Student does not meet the additional eligibility requirement for ${facility.name}.`,
        student,
        facility,
        authorization: null,
        checks: [{ name: "Additional facility eligibility", passed: false }],
      };
    }
    if (
      facility.accessRules.requiresPermission &&
      !student.allowedFacilities.includes(facility.facilityId)
    ) {
      return {
        success: false,
        outcome: "denied",
        reasonCode: "FACILITY_PERMISSION_MISSING",
        message: `Student does not have permission to access ${facility.name}.`,
        student,
        facility,
        authorization: null,
        checks: [{ name: "Facility permission", passed: false }],
      };
    }
    return {
      success: true,
      outcome: "granted",
      reasonCode: "FACILITY_ACCESS_GRANTED",
      message: `Student is active, has a valid card, and is permitted at ${facility.name}.`,
      student,
      facility,
      authorization: null,
      checks: [
        { name: "Credential and enrolment", passed: true },
        { name: "Facility operational status", passed: true },
        { name: "Facility permission", passed: true },
      ],
    };
  }

  if (mode === "authorization") {
    const authorization = authorizationRecords.find(
      (record) => record.authorizationId === authorizationId,
    );
    if (!authorization) {
      return {
        success: false,
        outcome: "denied",
        reasonCode: "INVALID_AUTHORIZATION",
        message: "Select a configured authorization category before scanning.",
        student,
        facility: null,
        authorization: null,
        checks: [{ name: "Authorization selection", passed: false }],
      };
    }
    const eligible = student.authorizationEligibility[authorization.eligibilityKey] === true;
    return {
      success: eligible,
      outcome: eligible ? "granted" : "denied",
      reasonCode: eligible ? "AUTHORIZATION_APPROVED" : "AUTHORIZATION_REQUIREMENT_NOT_MET",
      message: eligible
        ? `Student meets the requirements for ${authorization.name}.`
        : `Student does not meet the requirements for ${authorization.name}.`,
      student,
      facility: null,
      authorization,
      checks: [{ name: authorization.name, passed: eligible }],
    };
  }

  return {
    success: false,
    outcome: "denied",
    reasonCode: "INVALID_VERIFICATION_MODE",
    message: "The selected verification mode is not supported.",
    student,
    facility: null,
    authorization: null,
    checks: [{ name: "Verification mode", passed: false }],
  };
}
