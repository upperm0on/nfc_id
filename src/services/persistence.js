const STORAGE_KEY = "campus-identity-events-v1";

export function loadEvents(fallback) {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return { events: fallback, warning: null };
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((event) => !event.eventId || !event.timestamp)) {
      return {
        events: fallback,
        warning: "Saved local log data was invalid. The sample activity has been restored.",
      };
    }
    return { events: parsed, warning: null };
  } catch {
    return {
      events: fallback,
      warning: "Browser storage could not be read. Changes may not persist in this browser.",
    };
  }
}

export function saveEvents(events) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    return null;
  } catch {
    return "Unable to save logs in browser storage. The current session still shows the event, but it may not persist.";
  }
}

export function resetStoredEvents() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return "Unable to clear browser storage. The visible event list has been reset for this session.";
  }
}
