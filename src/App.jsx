import React, { useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  ContactRound,
  FileClock,
  Fingerprint,
  GraduationCap,
  Info,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Nfc,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { authorizationCategories, facilities, initialEvents, students, cardMappings } from "./data/mockData.js";
import { createNfcScan, getNfcCapability, nfcErrorMessage } from "./services/nfc.js";
import { evaluateVerification } from "./services/verification.js";
import { loadEvents, resetStoredEvents, saveEvents } from "./services/persistence.js";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "scan", label: "Scan & Verify", icon: Nfc },
  { id: "students", label: "Students", icon: ContactRound },
  { id: "facilities", label: "Facilities", icon: Building2 },
  { id: "logs", label: "Identification Logs", icon: FileClock },
];

const modeLabels = {
  identity: "Identity verification",
  facility: "Facility access",
  authorization: "Authorization",
};

function formatTime(value, options = {}) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: options.dateStyle ?? "medium",
    timeStyle: options.timeStyle ?? "short",
  }).format(new Date(value));
}

function eventTarget(event) {
  if (event.facilityId) return facilities.find((item) => item.facilityId === event.facilityId)?.name ?? "Unknown facility";
  if (event.authorizationId) return authorizationCategories.find((item) => item.authorizationId === event.authorizationId)?.name ?? "Unknown authorization";
  return "Identity check";
}

function eventOutcomeLabel(outcome) {
  return ({
    granted: "Granted",
    denied: "Denied",
    identity_verified: "Identity verified",
    identity_unverified: "Identity unverified",
    read_failed: "Read failed",
  })[outcome] ?? "Unknown";
}

function OutcomeBadge({ outcome, mode }) {
  const kind = outcome === "granted" || outcome === "identity_verified"
    ? "success"
    : outcome === "read_failed"
      ? "warning"
      : "danger";
  const label = mode === "authorization" && outcome === "granted" ? "Approved" : eventOutcomeLabel(outcome);
  return <span className={`badge badge-${kind}`}>{label}</span>;
}

function StatusBadge({ status }) {
  const label = status === "active" ? "Active" : status === "operational" ? "Operational" : status[0].toUpperCase() + status.slice(1);
  const kind = status === "active" || status === "operational"
    ? "success"
    : status === "restricted" || status === "expired"
      ? "warning"
      : "neutral";
  return <span className={`badge badge-${kind}`}>{label}</span>;
}

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function EmptyState({ icon: Icon = CircleHelp, title, description }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={20} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function StudentAvatar({ student, size = "" }) {
  return <span className={`avatar ${size}`}>{student?.initials ?? "?"}</span>;
}

function EventTable({ events, onSelect, compact = false }) {
  const displayed = compact ? events.slice(0, 5) : events;
  if (!displayed.length) {
    return <EmptyState icon={FileClock} title="No verification activity" description="Completed attempts will appear here." />;
  }
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Mode</th>
            <th>Target</th>
            <th>Time</th>
            <th>Outcome</th>
            {!compact && <th>Source</th>}
          </tr>
        </thead>
        <tbody>
          {displayed.map((event) => {
            const student = students.find((item) => item.studentId === event.studentId);
            const studentLabel = student?.fullName ?? (event.cardReadStatus === "failed" ? "No card read" : "Unknown card");
            return (
              <tr key={event.eventId} className={onSelect ? "clickable-row" : ""} tabIndex={onSelect ? 0 : undefined} aria-label={onSelect ? `View verification details for ${studentLabel}` : undefined} onClick={() => onSelect?.(event)} onKeyDown={(keyboardEvent) => {
                if (onSelect && (keyboardEvent.key === "Enter" || keyboardEvent.key === " ")) {
                  keyboardEvent.preventDefault();
                  onSelect(event);
                }
              }}>
                <td>
                  <div className="identity-cell">
                    <StudentAvatar student={student} />
                    <div><strong>{studentLabel}</strong><small>{student?.studentId ?? "No student match"}</small></div>
                  </div>
                </td>
                <td>{modeLabels[event.scanMode] ?? "Unknown mode"}</td>
                <td>{eventTarget(event)}</td>
                <td className="nowrap">{formatTime(event.timestamp, { dateStyle: "short" })}<small className="time-detail">{formatTime(event.timestamp, { dateStyle: undefined })}</small></td>
                <td><OutcomeBadge outcome={event.outcome} mode={event.scanMode} /></td>
                {!compact && <td><span className={`source-label source-${event.source}`}>{event.source === "web_nfc" ? "Web NFC" : event.source === "browser_attempt" ? "Browser attempt" : "Sample data"}</span></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailDialog({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button></header>
        {children}
      </section>
    </div>
  );
}

function StudentDetails({ student }) {
  return (
    <div className="detail-content">
      <div className="student-detail-head"><StudentAvatar student={student} size="avatar-large" /><div><h3>{student.fullName}</h3><span>{student.studentId}</span></div></div>
      <div className="detail-grid">
        <DetailItem label="Programme" value={student.programme} />
        <DetailItem label="Department" value={student.department} />
        <DetailItem label="Faculty" value={student.faculty} />
        <DetailItem label="Academic level" value={`Level ${student.level}`} />
        <DetailItem label="Enrolment" value={<StatusBadge status={student.enrolmentStatus} />} />
        <DetailItem label="Card status" value={<StatusBadge status={student.cardStatus} />} />
      </div>
      <div className="detail-section"><h4>Facility permissions</h4><div className="tag-list">{student.allowedFacilities.map((id) => <span className="soft-tag" key={id}>{facilities.find((item) => item.facilityId === id)?.name ?? id}</span>)}</div></div>
      <div className="detail-section"><h4>Authorization eligibility</h4><div className="eligibility-list">{authorizationCategories.map((category) => <div key={category.authorizationId}><span>{category.name}</span><span className={student.authorizationEligibility[category.eligibilityKey] ? "eligible" : "ineligible"}>{student.authorizationEligibility[category.eligibilityKey] ? "Eligible" : "Not eligible"}</span></div>)}</div></div>
    </div>
  );
}

function DetailItem({ label, value }) {
  return <div className="detail-item"><small>{label}</small><div>{value}</div></div>;
}

function FacilityDetails({ facility, events }) {
  const recent = events.filter((event) => event.facilityId === facility.facilityId).slice(0, 3);
  return (
    <div className="detail-content">
      <div className="facility-detail-head"><span className="facility-icon"><Building2 size={22} /></span><div><h3>{facility.name}</h3><span>{facility.category} · {facility.location}</span></div></div>
      <p className="detail-description">{facility.description}</p>
      <div className="detail-grid"><DetailItem label="Operational status" value={<StatusBadge status={facility.status} />} /><DetailItem label="Facility ID" value={facility.facilityId} /></div>
      <div className="detail-section"><h4>Access rules</h4><div className="rule-callout"><ShieldCheck size={17} /><span>{facility.accessRules.summary}</span></div></div>
      <div className="detail-section"><h4>Recent verification activity</h4>{recent.length ? <div className="mini-event-list">{recent.map((event) => <div key={event.eventId}><span>{students.find((student) => student.studentId === event.studentId)?.fullName ?? "Unknown card"}</span><OutcomeBadge outcome={event.outcome} mode={event.scanMode} /></div>)}</div> : <p className="muted small">No attempts recorded for this facility.</p>}</div>
    </div>
  );
}

function LogDetails({ event }) {
  const student = students.find((item) => item.studentId === event.studentId);
  return (
    <div className="detail-content">
      <div className="log-result-head"><OutcomeBadge outcome={event.outcome} mode={event.scanMode} /><span className="muted">Event {event.eventId}</span></div>
      <div className="detail-grid">
        <DetailItem label="Timestamp" value={formatTime(event.timestamp, { dateStyle: "full" })} />
        <DetailItem label="Verification mode" value={modeLabels[event.scanMode]} />
        <DetailItem label="Card read status" value={event.cardReadStatus === "read" ? "NDEF data read" : "Read failed"} />
        <DetailItem label="Event source" value={event.source === "web_nfc" ? "Actual Web NFC event" : event.source === "browser_attempt" ? "Browser attempt; NFC unavailable" : "Seeded sample activity"} />
        <DetailItem label="Student" value={student ? `${student.fullName} · ${student.studentId}` : "No student matched"} />
        <DetailItem label="Target" value={eventTarget(event)} />
        <DetailItem label="Reason code" value={event.reasonCode} />
      </div>
      <div className="detail-section"><h4>Decision explanation</h4><p className="reason-text">{event.reason}</p></div>
      {event.source === "sample_data" && <div className="notice notice-amber"><Info size={16} /><span>This is illustrative seed data, not a physical card scan.</span></div>}
      {event.source === "browser_attempt" && <div className="notice notice-amber"><Info size={16} /><span>No physical NFC read occurred because this browser does not support Web NFC.</span></div>}
    </div>
  );
}

function App() {
  const initialStorage = useMemo(() => loadEvents(initialEvents), []);
  const [activePage, setActivePage] = useState("overview");
  const [events, setEvents] = useState(initialStorage.events);
  const [storageNotice, setStorageNotice] = useState(initialStorage.warning);
  const [mode, setMode] = useState("identity");
  const [facilityId, setFacilityId] = useState("");
  const [authorizationId, setAuthorizationId] = useState("");
  const [scanState, setScanState] = useState("idle");
  const [scanError, setScanError] = useState("");
  const [latestResult, setLatestResult] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatus, setStudentStatus] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [logOutcome, setLogOutcome] = useState("all");
  const [logMode, setLogMode] = useState("all");
  const [logFacility, setLogFacility] = useState("all");
  const [facilitySearch, setFacilitySearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scanRef = useRef(null);
  const scanningRef = useRef(false);

  const capability = getNfcCapability();
  const sortedEvents = useMemo(() => [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)), [events]);
  const pushEvent = (event) => {
    const next = [event, ...events];
    setEvents(next);
    setStorageNotice(saveEvents(next));
  };

  const goTo = (page) => {
    setActivePage(page);
    setMobileNavOpen(false);
    if (page !== "scan" && scanningRef.current) cancelScan();
  };

  function cancelScan() {
    scanRef.current?.cancel();
    scanRef.current = null;
    scanningRef.current = false;
    setScanState("idle");
    setScanError("Scan cancelled. Start a new scan when ready.");
  }

  const beginScan = async () => {
    if (scanningRef.current) return;
    if ((mode === "facility" && !facilityId) || (mode === "authorization" && !authorizationId)) {
      setScanError(`Select ${mode === "facility" ? "a facility" : "an authorization category"} before scanning.`);
      return;
    }
    setScanError("");
    setLatestResult(null);
    if (!capability.supported) {
      setScanState("unsupported");
      setScanError(capability.message);
      pushEvent({
        eventId: createEventId(),
        timestamp: new Date().toISOString(),
        scanMode: mode,
        cardReadStatus: "failed",
        studentId: null,
        facilityId: mode === "facility" ? facilityId : null,
        authorizationId: mode === "authorization" ? authorizationId : null,
        outcome: "read_failed",
        reason: capability.message,
        reasonCode: "NFC_UNSUPPORTED",
        source: "browser_attempt",
      });
      return;
    }
    setScanState("checking_support");
    try {
      const scan = createNfcScan();
      scanRef.current = scan;
      scanningRef.current = true;
      setScanState("scanning");
      const cardValue = await scan.promise;
      scanningRef.current = false;
      scanRef.current = null;
      setScanState("reading");
      setScanState("matching_student");
      setScanState("verifying");
      const result = evaluateVerification({
        mode,
        cardValue,
        mappings: cardMappings,
        studentRecords: students,
        facilityRecords: facilities,
        authorizationRecords: authorizationCategories,
        facilityId,
        authorizationId,
      });
      setLatestResult(result);
      setScanState(result.success ? "success" : result.reasonCode.startsWith("UNKNOWN") || result.reasonCode === "STUDENT_NOT_FOUND" ? "unrecognized_card" : "denied");
      pushEvent({
        eventId: createEventId(),
        timestamp: new Date().toISOString(),
        scanMode: mode,
        cardReadStatus: "read",
        studentId: result.student?.studentId ?? null,
        facilityId: mode === "facility" ? facilityId : null,
        authorizationId: mode === "authorization" ? authorizationId : null,
        outcome: result.outcome,
        reason: result.message,
        reasonCode: result.reasonCode,
        source: "web_nfc",
      });
    } catch (error) {
      scanningRef.current = false;
      scanRef.current = null;
      const message = nfcErrorMessage(error);
      if (error?.name === "AbortError") {
        setScanState("idle");
        setScanError(message);
        return;
      }
      setScanState("read_error");
      setScanError(message);
      pushEvent({
        eventId: createEventId(),
        timestamp: new Date().toISOString(),
        scanMode: mode,
        cardReadStatus: "failed",
        studentId: null,
        facilityId: mode === "facility" ? facilityId : null,
        authorizationId: mode === "authorization" ? authorizationId : null,
        outcome: "read_failed",
        reason: message,
        reasonCode: error?.name === "NotAllowedError" ? "NFC_PERMISSION_DENIED" : "NFC_READ_FAILED",
        source: "web_nfc",
      });
    }
  };

  const resetData = () => {
    if (!window.confirm("Reset local verification activity to the original sample data? This only affects this browser prototype.")) return;
    const storageError = resetStoredEvents();
    setEvents(initialEvents);
    setStorageNotice(storageError);
    setLatestResult(null);
    setSelectedEvent(null);
  };

  const filteredStudents = students.filter((student) => {
    const query = studentSearch.trim().toLowerCase();
    return (!query || `${student.fullName} ${student.studentId} ${student.programme}`.toLowerCase().includes(query))
      && (studentStatus === "all" || student.enrolmentStatus === studentStatus);
  });
  const filteredFacilities = facilities.filter((facility) => `${facility.name} ${facility.category} ${facility.location}`.toLowerCase().includes(facilitySearch.toLowerCase()));
  const filteredEvents = sortedEvents.filter((event) => {
    const student = students.find((item) => item.studentId === event.studentId);
    const queryMatch = !logSearch || `${student?.fullName ?? "unknown"} ${student?.studentId ?? ""} ${event.reason}`.toLowerCase().includes(logSearch.toLowerCase());
    const facilityMatch = logFacility === "all" || event.facilityId === logFacility;
    return queryMatch && facilityMatch && (logOutcome === "all" || event.outcome === logOutcome) && (logMode === "all" || event.scanMode === logMode);
  });
  const grantedCount = events.filter((event) => event.outcome === "granted").length;
  const deniedCount = events.filter((event) => event.outcome === "denied").length;
  const identityCount = events.filter((event) => event.outcome === "identity_verified").length;
  const activeTitle = navigation.find((item) => item.id === activePage)?.label ?? "Overview";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Landmark size={21} strokeWidth={2.2} /></div>
          <div><strong>Campus Identity</strong><span>VERIFICATION CONSOLE</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${activePage === id ? "nav-link-active" : ""}`} onClick={() => goTo(id)} aria-current={activePage === id ? "page" : undefined}>
              <Icon size={18} /><span>{label}</span>{id === "logs" && <span className="nav-count">{events.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className={`status-dot ${capability.supported ? "dot-green" : "dot-amber"}`} /><div><strong>{capability.supported ? "NFC available" : "NFC unavailable"}</strong><small>{capability.supported ? "Reader availability unconfirmed" : "Browser support required"}</small></div></div>
          <div className="operator-card"><span className="operator-avatar">OP</span><div><strong>Prototype operator</strong><small>Local demonstration</small></div><ChevronDown size={15} /></div>
          <button className="reset-link" onClick={resetData}>Reset sample activity</button>
        </div>
      </aside>
      {mobileNavOpen && <button className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />}
      <main className="main-area">
        <div className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumb"><span>University operations</span><span className="breadcrumb-sep">/</span><strong>{activeTitle}</strong></div>
          <div className="topbar-right"><span className="prototype-pill"><span />Prototype environment</span><span className="topbar-date"><Clock3 size={15} />{new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short" }).format(new Date())}</span></div>
        </div>
        <div className="content">
          {storageNotice && <div className="notice notice-amber storage-notice"><AlertCircle size={16} /><span>{storageNotice}</span><button className="icon-button" onClick={() => setStorageNotice(null)} aria-label="Dismiss storage notice"><X size={16} /></button></div>}
          {activePage === "overview" && <Overview events={sortedEvents} counts={{ students: students.length, facilities: facilities.length, granted: grantedCount, denied: deniedCount, identity: identityCount }} onStart={() => goTo("scan")} onOpenLogs={() => goTo("logs")} />}
          {activePage === "scan" && <ScanPage mode={mode} setMode={setMode} setLatestResult={setLatestResult} setScanError={setScanError} setScanState={setScanState} facilityId={facilityId} setFacilityId={setFacilityId} authorizationId={authorizationId} setAuthorizationId={setAuthorizationId} capability={capability} scanState={scanState} scanError={scanError} latestResult={latestResult} onStart={beginScan} onCancel={cancelScan} events={sortedEvents} onOpenStudent={setSelectedStudent} />}
          {activePage === "students" && <StudentsPage search={studentSearch} setSearch={setStudentSearch} status={studentStatus} setStatus={setStudentStatus} students={filteredStudents} onSelect={setSelectedStudent} />}
          {activePage === "facilities" && <FacilitiesPage search={facilitySearch} setSearch={setFacilitySearch} facilities={filteredFacilities} onSelect={setSelectedFacility} />}
          {activePage === "logs" && <LogsPage events={filteredEvents} search={logSearch} setSearch={setLogSearch} outcome={logOutcome} setOutcome={setLogOutcome} mode={logMode} setMode={setLogMode} facility={logFacility} setFacility={setLogFacility} onSelect={setSelectedEvent} />}
          <footer className="app-footer"><span>Campus Identity prototype</span><span>Frontend-only · Local browser data · No physical access control</span></footer>
        </div>
      </main>
      {selectedStudent && <DetailDialog title="Student record" onClose={() => setSelectedStudent(null)}><StudentDetails student={selectedStudent} /></DetailDialog>}
      {selectedFacility && <DetailDialog title="Facility details" onClose={() => setSelectedFacility(null)}><FacilityDetails facility={selectedFacility} events={sortedEvents} /></DetailDialog>}
      {selectedEvent && <DetailDialog title="Verification event" onClose={() => setSelectedEvent(null)}><LogDetails event={selectedEvent} /></DetailDialog>}
    </div>
  );
}

function Overview({ events, counts, onStart, onOpenLogs }) {
  const metrics = [
    { label: "Registered students", value: counts.students, note: "Fictional prototype records", icon: GraduationCap, accent: "blue" },
    { label: "Configured facilities", value: counts.facilities, note: "Across campus locations", icon: Building2, accent: "purple" },
    { label: "Verification attempts", value: events.length, note: "Includes seeded sample activity", icon: Activity, accent: "slate" },
    { label: "Access granted", value: counts.granted, note: `${counts.denied} denied access requests`, icon: BadgeCheck, accent: "green" },
  ];
  return (
    <>
      <PageHeader eyebrow="OPERATIONS / OVERVIEW" title="Good morning, operator" description="A clear view of identity checks and access activity across your campus." action={<button className="button button-primary" onClick={onStart}><Nfc size={17} />Start verification<ArrowRight size={16} /></button>} />
      <div className="welcome-strip"><div className="welcome-icon"><ShieldCheck size={21} /></div><div><strong>Student identity, verified with context</strong><span>Read a supported NFC card, match a student record, then evaluate the requested access or authorization.</span></div><span className="welcome-tag">PROTOTYPE</span></div>
      <section className="metric-grid" aria-label="Verification metrics">
        {metrics.map(({ label, value, note, icon: Icon, accent }) => <article className="metric-card" key={label}><div className={`metric-icon metric-${accent}`}><Icon size={18} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>)}
      </section>
      <div className="overview-lower">
        <section className="panel activity-panel">
          <div className="panel-heading"><div><h2>Recent activity</h2><p>Latest recorded verification events</p></div><button className="text-button" onClick={onOpenLogs}>View identification logs <ArrowRight size={15} /></button></div>
          <EventTable events={events} compact />
        </section>
        <aside className="panel snapshot-panel">
          <div className="panel-heading"><div><h2>Verification snapshot</h2><p>From the current event collection</p></div></div>
          <div className="snapshot-rows">
            <div className="snapshot-row"><span><span className="snapshot-dot dot-teal" />Identity verified</span><strong>{counts.identity}</strong></div>
            <div className="snapshot-row"><span><span className="snapshot-dot dot-green" />Access granted</span><strong>{counts.granted}</strong></div>
            <div className="snapshot-row"><span><span className="snapshot-dot dot-red" />Access denied</span><strong>{counts.denied}</strong></div>
            <div className="snapshot-row"><span><span className="snapshot-dot dot-amber" />Read failures</span><strong>{events.filter((event) => event.outcome === "read_failed").length}</strong></div>
          </div>
          <div className="snapshot-foot"><Info size={14} />An identity check is not an access grant.</div>
        </aside>
      </div>
      <div className="bottom-note"><LockKeyhole size={15} /><span>Frontend prototype only. Decisions are evaluated locally and must not be used to control real access.</span></div>
    </>
  );
}

function createEventId() {
  return globalThis.crypto?.randomUUID?.() ?? `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ScanPage({ mode, setMode, setLatestResult, setScanError, setScanState, facilityId, setFacilityId, authorizationId, setAuthorizationId, capability, scanState, scanError, latestResult, onStart, onCancel, events, onOpenStudent }) {
  const busy = ["checking_support", "scanning", "reading", "matching_student", "verifying"].includes(scanState);
  const modeCards = [
    { id: "identity", title: "Identity", description: "Confirm the student record and credential status.", icon: Fingerprint, step: "01" },
    { id: "facility", title: "Facility access", description: "Evaluate permissions for a campus facility.", icon: Building2, step: "02" },
    { id: "authorization", title: "Authorization", description: "Check eligibility for a service or process.", icon: BadgeCheck, step: "03" },
  ];
  const student = latestResult?.student;
  const resultTone = latestResult?.success ? "result-success" : latestResult ? "result-denied" : "";
  const currentState = {
    scanning: "Waiting for a physical NFC card",
    checking_support: "Checking browser support",
    reading: "Card data received",
    matching_student: "Matching student record",
    verifying: "Evaluating verification rules",
    unsupported: "NFC unavailable",
    read_error: "NFC read failed",
    unrecognized_card: "Card not recognized",
    denied: "Verification denied",
    success: "Verification complete",
    idle: "Ready when you are",
  }[scanState] ?? "Ready when you are";

  return (
    <>
      <PageHeader eyebrow="OPERATIONS / LIVE CHECK" title="Scan & verify" description="Choose a verification purpose, then read a physical card using a supported browser NFC interface." />
      <section className="mode-section">
        <div className="section-title-row"><div><h2>Choose verification mode</h2><p>One card read; one decision for the selected purpose.</p></div><span className="step-count">STEP 1 OF 2</span></div>
        <div className="mode-grid">
          {modeCards.map(({ id, title, description, icon: Icon, step }) => <button key={id} className={`mode-card ${mode === id ? "mode-selected" : ""}`} disabled={busy} onClick={() => { setMode(id); setLatestResult(null); setScanError(""); setScanState("idle"); }} aria-pressed={mode === id}><span className="mode-step">{step}</span><span className="mode-icon"><Icon size={19} /></span><strong>{title}</strong><span className="mode-description">{description}</span>{mode === id && <span className="mode-check"><Check size={14} /></span>}</button>)}
        </div>
      </section>
      <div className="scan-layout">
        <section className="panel scan-panel">
          <div className="scan-panel-top"><div><span className="eyebrow">STEP 2 / CARD READING</span><h2>{modeLabels[mode]}</h2></div><span className={`reader-pill ${capability.supported ? "reader-ready" : "reader-unavailable"}`}><span className="status-dot" />{capability.supported ? "NFC available" : "NFC unavailable"}</span></div>
          {mode === "facility" && <label className="field-label">Select facility <span className="required">*</span><select value={facilityId} onChange={(event) => setFacilityId(event.target.value)} disabled={busy}><option value="">Choose a facility…</option>{facilities.map((facility) => <option key={facility.facilityId} value={facility.facilityId}>{facility.name} · {facility.status}</option>)}</select>{!facilityId && <span className="field-hint">Choose a facility to enable scanning.</span>}</label>}
          {mode === "authorization" && <label className="field-label">Authorization category <span className="required">*</span><select value={authorizationId} onChange={(event) => setAuthorizationId(event.target.value)} disabled={busy}><option value="">Choose a category…</option>{authorizationCategories.map((category) => <option key={category.authorizationId} value={category.authorizationId}>{category.name}</option>)}</select>{!authorizationId && <span className="field-hint">Choose a category to enable scanning.</span>}</label>}
          <div className={`nfc-stage ${busy ? "nfc-stage-active" : ""} ${latestResult ? "nfc-stage-result" : ""}`}>
            <div className="nfc-orbit"><div className="nfc-core">{busy ? <LoaderCircle size={28} className="spin" /> : <Nfc size={29} />}</div></div>
            <strong>{currentState}</strong>
            <p>{busy ? "Hold the physical card near the NFC reader. The scan will finish when a supported NDEF tag is detected." : "Present a physical NFC card after starting a scan. A readable tag is not proof of identity or authorization."}</p>
            {scanState === "scanning" ? <button className="button button-secondary" onClick={onCancel}><X size={16} />Cancel scan</button> : <button className="button button-primary scan-action" onClick={onStart} disabled={busy || (mode === "facility" && !facilityId) || (mode === "authorization" && !authorizationId)}><Nfc size={17} />Start NFC scan<ArrowRight size={16} /></button>}
          </div>
          {scanError && <div className="notice notice-amber scan-notice"><AlertCircle size={16} /><span>{scanError}</span></div>}
          <div className="reader-note"><Info size={15} /><span>{capability.message} This browser API reads NDEF records; it does not expose a universal card UID.</span></div>
          <div className="notice notice-amber mapping-notice"><Info size={15} /><span>{cardMappings.length === 0 ? <>No card-to-student mappings are configured yet. A card may read successfully but will remain unrecognized until its supported identifier is mapped in <code>src/data/mockData.js</code>.</> : `${cardMappings.length} card-to-student mapping${cardMappings.length === 1 ? "" : "s"} configured.`}</span></div>
          <div className="privacy-note"><LockKeyhole size={14} /><span>Raw card data is not saved in verification logs.</span></div>
        </section>
        <section className={`panel result-panel ${resultTone}`}>
          <div className="panel-heading"><div><h2>Verification result</h2><p>Decision from the selected ruleset</p></div>{latestResult && <OutcomeBadge outcome={latestResult.outcome} mode={mode} />}</div>
          {!latestResult ? <div className="result-empty"><span className="result-empty-icon"><ShieldCheck size={24} /></span><strong>Awaiting a card read</strong><p>The student identity and result will appear here after a real NFC read.</p><div className="result-separator" /><div className="result-hint"><Check size={14} />Card read status is separate from access outcome</div></div> : <div className="result-body">
            <div className="decision-head"><span className={`decision-icon ${latestResult.success ? "decision-ok" : "decision-no"}`}>{latestResult.success ? <Check size={20} /> : <X size={20} />}</span><div><span className="eyebrow">{latestResult.success ? "VERIFICATION PASSED" : "VERIFICATION NOT PASSED"}</span><h3>{latestResult.outcome === "identity_verified" ? "Identity verified" : latestResult.outcome === "granted" ? mode === "facility" ? "Access granted" : "Authorization approved" : latestResult.reasonCode === "UNKNOWN_CARD" ? "Unknown card" : "Access denied"}</h3></div></div>
            <p className="reason-text">{latestResult.message}</p>
            {student ? <div className="matched-student"><StudentAvatar student={student} size="avatar-large" /><div><strong>{student.fullName}</strong><span>{student.studentId} · {student.programme}</span></div><button className="icon-button" aria-label="View matched student record" onClick={() => onOpenStudent(student)}><ArrowUpRight size={16} /></button></div> : <div className="unknown-match"><CircleHelp size={17} /><span>No student identity was matched to this card data.</span></div>}
            <div className="check-list">{latestResult.checks.map((check) => <div key={check.name}><span className={check.passed ? "check-dot check-pass" : "check-dot check-fail"}>{check.passed ? <Check size={11} /> : <X size={11} />}</span><span>{check.name}</span><strong>{check.passed ? "Passed" : "Not passed"}</strong></div>)}</div>
            <div className="reason-code">Decision code <code>{latestResult.reasonCode}</code></div>
          </div>}
        </section>
      </div>
      <section className="panel scan-recent"><div className="panel-heading"><div><h2>Recent scans</h2><p>Most recent recorded activity across all modes</p></div><span className="record-count">{events.length} events</span></div><EventTable events={events} compact /></section>
    </>
  );
}

function StudentsPage({ search, setSearch, status, setStatus, students: visibleStudents, onSelect }) {
  return (
    <>
      <PageHeader eyebrow="DIRECTORY / STUDENT RECORDS" title="Students" description="Search fictional student records and review the eligibility data used by the prototype." />
      <section className="panel directory-panel">
        <div className="directory-toolbar"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, student ID, or programme…" aria-label="Search students" /></div><label className="filter-field"><SlidersHorizontal size={15} /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by enrolment status"><option value="all">All enrolment statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select></label><span className="record-count">{visibleStudents.length} students</span></div>
        {visibleStudents.length ? <div className="table-scroll"><table><thead><tr><th>Student</th><th>Programme</th><th>Department</th><th>Level</th><th>Enrolment</th><th>Card status</th></tr></thead><tbody>{visibleStudents.map((student) => <tr key={student.studentId} className="clickable-row" tabIndex={0} aria-label={`View student record for ${student.fullName}`} onClick={() => onSelect(student)} onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); onSelect(student); } }}><td><div className="identity-cell"><StudentAvatar student={student} /><div><strong>{student.fullName}</strong><small>{student.studentId}</small></div></div></td><td>{student.programme}</td><td>{student.department}</td><td>Level {student.level}</td><td><StatusBadge status={student.enrolmentStatus} /></td><td><StatusBadge status={student.cardStatus} /></td></tr>)}</tbody></table></div> : <EmptyState icon={Search} title="No students found" description="Try a different search term or enrolment filter." />}
        <div className="panel-footnote"><Info size={14} />Fictional demonstration records. Student records are not authoritative.</div>
      </section>
    </>
  );
}

function FacilitiesPage({ search, setSearch, facilities: visibleFacilities, onSelect }) {
  return (
    <>
      <PageHeader eyebrow="DIRECTORY / CAMPUS LOCATIONS" title="Facilities" description="Configured places and their access rules. Organizational departments are managed separately from physical facilities." />
      <div className="directory-toolbar facilities-toolbar"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search facilities, categories, or locations…" aria-label="Search facilities" /></div><span className="record-count">{visibleFacilities.length} facilities</span></div>
      {visibleFacilities.length ? <div className="facility-grid">{visibleFacilities.map((facility) => <button className="facility-card" key={facility.facilityId} onClick={() => onSelect(facility)}><div className="facility-card-top"><span className="facility-icon"><Building2 size={19} /></span><StatusBadge status={facility.status} /></div><span className="eyebrow">{facility.category}</span><h2>{facility.name}</h2><p>{facility.description}</p><div className="facility-location"><Landmark size={14} />{facility.location}</div><div className="facility-rule-preview"><ShieldCheck size={15} /><span>{facility.accessRules.summary}</span></div><span className="card-link">View facility details <ArrowRight size={14} /></span></button>)}</div> : <EmptyState icon={Search} title="No facilities found" description="Try a different name, category, or location." />}
    </>
  );
}

function LogsPage({ events, search, setSearch, outcome, setOutcome, mode, setMode, facility, setFacility, onSelect }) {
  return (
    <>
      <PageHeader eyebrow="AUDIT / IDENTIFICATION LOGS" title="Identification logs" description="Review recorded verification attempts, outcomes, and decision explanations." />
      <section className="panel logs-panel">
        <div className="logs-toolbar">
          <div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, ID, or reason…" aria-label="Search identification logs" /></div>
          <label className="filter-field"><select value={outcome} onChange={(event) => setOutcome(event.target.value)} aria-label="Filter by outcome"><option value="all">All outcomes</option><option value="granted">Granted</option><option value="denied">Denied</option><option value="identity_verified">Identity verified</option><option value="identity_unverified">Identity unverified</option><option value="read_failed">Read failed</option></select></label>
          <label className="filter-field"><select value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Filter by mode"><option value="all">All modes</option><option value="identity">Identity</option><option value="facility">Facility access</option><option value="authorization">Authorization</option></select></label>
          <label className="filter-field"><select value={facility} onChange={(event) => setFacility(event.target.value)} aria-label="Filter by facility"><option value="all">All facilities</option>{facilities.map((item) => <option key={item.facilityId} value={item.facilityId}>{item.name}</option>)}</select></label>
          <span className="record-count">{events.length} results</span>
        </div>
        {events.length ? <EventTable events={events} onSelect={onSelect} /> : <EmptyState icon={Search} title="No matching events" description="No logs match those filters. Adjust the search or choose a different outcome." />}
        <div className="panel-footnote"><Info size={14} />Web NFC events contain no raw card payload. Sample data is clearly identified in event details.</div>
      </section>
    </>
  );
}

export default App;
