export function getNfcCapability() {
  if (!globalThis.isSecureContext) {
    return {
      supported: false,
      status: "unsupported",
      message: "Web NFC requires a secure browser context (HTTPS or localhost).",
    };
  }
  if (!("NDEFReader" in globalThis)) {
    return {
      supported: false,
      status: "unsupported",
      message: "Web NFC is not available in this browser. Use a supported Android browser and NFC interface.",
    };
  }
  return {
    supported: true,
    status: "available",
    message: "Web NFC is available; physical reader availability is not confirmed.",
  };
}

function textFromRecord(record) {
  if (!(record.data instanceof DataView)) {
    throw new Error("The browser returned an unsupported NFC record format.");
  }
  const bytes = new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
  if (bytes.length < 1) throw new Error("The NFC text record was empty.");
  const languageLength = bytes[0] & 0x3f;
  const text = new TextDecoder().decode(bytes.slice(1 + languageLength)).trim();
  if (!text) throw new Error("The NFC text record did not contain a supported identifier.");
  return text;
}

export function normalizeNdefMessage(message) {
  const textRecords = Array.from(message.records ?? []).filter(
    (record) => record.recordType === "text",
  );
  if (textRecords.length !== 1) {
    throw new Error(
      textRecords.length === 0
        ? "No supported NDEF text record was found on the card."
        : "Multiple NDEF text records were found; matching was stopped because the identifier is ambiguous.",
    );
  }
  return textFromRecord(textRecords[0]);
}

export function createNfcScan() {
  const capability = getNfcCapability();
  if (!capability.supported) {
    throw new Error(capability.message);
  }

  const controller = new AbortController();
  const reader = new NDEFReader();
  let settled = false;
  let onMessage;
  let onError;
  let rejectPending;

  const cleanup = () => {
    reader.removeEventListener("reading", onMessage);
    reader.removeEventListener("readingerror", onError);
  };

  const promise = new Promise((resolve, reject) => {
    rejectPending = reject;
    onMessage = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(normalizeNdefMessage(event.message));
      } catch (error) {
        reject(error);
      }
    };
    onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("The NFC reader could not read this tag. Try again with a compatible NDEF card."));
    };
    reader.addEventListener("reading", onMessage);
    reader.addEventListener("readingerror", onError);
    try {
      Promise.resolve(reader.scan({ signal: controller.signal })).catch((error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });

  return {
    promise,
    cancel() {
      if (!settled) {
        settled = true;
        cleanup();
        controller.abort();
        rejectPending(new DOMException("NFC scan was cancelled.", "AbortError"));
      }
    },
  };
}

export function nfcErrorMessage(error) {
  if (error?.name === "NotAllowedError") {
    return "NFC permission was denied. Allow NFC access in the browser and start a new scan.";
  }
  if (error?.name === "AbortError") {
    return "NFC scan was cancelled.";
  }
  return error instanceof Error ? error.message : "An unexpected NFC error occurred.";
}
