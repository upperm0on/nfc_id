# Campus Identity prototype

A frontend-only university student identity and verification prototype. It uses fictional local records and evaluates identity, facility-access, and authorization requests in the browser.

## Run locally

```sh
npm install
npm run dev
```

Run the production build and verification-engine tests with:

```sh
npm run build
npm test
```

## NFC integration and card mapping

The operational scan action uses the browser Web NFC API (`NDEFReader`) and waits for an actual NDEF reading event. It does not generate a sample card or silently fall back to manual entry. Web NFC is generally limited to supported Android browsers and secure contexts; browser API availability does not prove that a physical reader is connected or compatible. This environment did not provide a browser/hardware/card to inspect, so real NFC hardware has not been verified.

The current parser intentionally accepts exactly one NDEF text record and uses its trimmed text verbatim as the card mapping key. It does not infer a UID or guess the card format. A demo mapping is configured in `src/data/mockData.js`: `campus-id:v1:demo-ama-240184` maps to the fictional student `STU-240184`. This value is only usable on a tag containing that exact text record; it is not a real university credential or a value read from a physical card. The fictional student records and seeded sample log entries are explicitly illustrative; they are not physical NFC reads. Unit tests also use isolated `fixture-card-*` values.

A USB PC/SC reader is not automatically exposed through Web NFC. Supporting one would require an explicitly approved local hardware bridge or a browser-compatible API; no bridge or backend is included.

### Configure a card mapping

1. On an NFC-capable Android phone, enable NFC and use a read-only NFC inspection app (for example, NFC Tools' **Read** tab) to inspect the card. Do not write to or alter an issued university card.
2. Check whether the app reports an NDEF text record and note only the text value needed for an authorized mock mapping. Do not publish or commit real card identifiers. If there is no NDEF text record, this Web NFC parser cannot match that card as currently implemented.
3. For a test tag that you control, write this exact text as a single NDEF text record to use the included demo mapping:

   ```js
   campus-id:v1:demo-ama-240184
   ```

   The mapping is already present in `src/data/mockData.js` and points to fictional student `STU-240184`. For a different authorized test tag, replace the demo value with the exact text read from that tag and keep the student ID fictional. The NFC parser trims surrounding whitespace but otherwise matches the value exactly. Do not write to or alter an issued university card.
4. Open this application in a supported Android browser on a secure context (HTTPS or localhost). Select **Scan & Verify**, choose the purpose, select a facility or authorization category if needed, start the scan, and present the card when prompted. A successful read and a matched student are separate results.
5. If the read-only app reports a UID, proprietary/secure card data, or another format rather than an NDEF text record, do not put that value into this NDEF mapping and expect it to work: use a compatible reader/integration designed for that format. The desktop browser used during development did not support Web NFC.

## Data and prototype boundaries

Generated events are stored in this browser's local storage under `campus-identity-events-v1`. Local browser data is not a secure production database and can be modified by a user with browser access. Use **Reset sample activity** in the sidebar to return the visible log to its original illustrative examples.

Frontend authorization logic can be bypassed; mock records are not authoritative university records; a readable NFC card does not prove authenticity; and this prototype does not unlock doors. Production use requires trusted server-side authorization, secure credential handling, access controls, protected audit logging, and approved integration with university systems.
# nfc_id
