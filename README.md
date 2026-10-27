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

The current parser intentionally accepts exactly one NDEF text record and uses its trimmed text verbatim as the card mapping key. It does not infer a UID or guess the card format. The physical card must be inspected with a compatible reader, and its supported record format must be documented before configuring `cardMappings` in `src/data/mockData.js`. The mapping array is currently empty. The fictional student records and seeded sample log entries are explicitly illustrative; they are not physical NFC reads. Unit tests use isolated `fixture-card-*` values and do not populate operational card mappings.

A USB PC/SC reader is not automatically exposed through Web NFC. Supporting one would require an explicitly approved local hardware bridge or a browser-compatible API; no bridge or backend is included.

## Data and prototype boundaries

Generated events are stored in this browser's local storage under `campus-identity-events-v1`. Local browser data is not a secure production database and can be modified by a user with browser access. Use **Reset sample activity** in the sidebar to return the visible log to its original illustrative examples.

Frontend authorization logic can be bypassed; mock records are not authoritative university records; a readable NFC card does not prove authenticity; and this prototype does not unlock doors. Production use requires trusted server-side authorization, secure credential handling, access controls, protected audit logging, and approved integration with university systems.
# nfc_id
