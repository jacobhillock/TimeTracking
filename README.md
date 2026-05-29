# Time Tracking

A time-tracking web app for logging work entries by client and ticket, with task and calendar views, todos, and Jira integration.

## Setup

```bash
bun install
```

## Development

```bash
bun run dev
```

## Build

```bash
bun run build
```

## Manual Data Export

This exports all non-config data from IndexedDB. It includes time entries and todos, and it also falls back to legacy `localStorage.timeEntries` if you still have data in the old format. It does not include localStorage-backed settings such as theme, pinned tickets, collapsed sections, or client colors.

If the export still looks empty, open the app once first so the legacy `timeEntries` payload can migrate into IndexedDB, then run the export again.

Run this in the browser console:

```js
const openDB = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("timeTrackerDB");

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const readLegacyTimeEntries = () => {
  const saved = localStorage.getItem("timeEntries");
  if (!saved) return {};

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const flattenLegacyTimeEntries = (legacyEntries) =>
  Object.entries(legacyEntries).flatMap(([date, dayEntries]) =>
    dayEntries.map((entry, sortOrder) => ({
      ...entry,
      date,
      sortOrder,
    })),
  );

const stripTodoIndexes = (record) => {
  const { completedIndex, completedDateIndex, ...todo } = record;
  return todo;
};

const exportData = async () => {
  const db = await openDB();
  const tx = db.transaction(["timeEntries", "todos"], "readonly");
  const [timeEntries, todos] = await Promise.all([
    requestToPromise(tx.objectStore("timeEntries").getAll()),
    requestToPromise(tx.objectStore("todos").getAll()),
  ]);
  const legacyTimeEntries = flattenLegacyTimeEntries(readLegacyTimeEntries());

  const payload = {
    timeEntries: timeEntries.length > 0 ? timeEntries : legacyTimeEntries,
    todos: todos.map(stripTodoIndexes),
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "time-tracking-export.json";
  link.click();

  db.close();
  URL.revokeObjectURL(url);
};

exportData();
```

## Manual Data Import

Import accepts a JSON string. It normalizes any literal control characters that were introduced by pasting before calling `JSON.parse`, so `\n` in descriptions is preserved.

```js
const openDB = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("timeTrackerDB");

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const normalizeJsonText = (jsonText) => {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of jsonText) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      output += char;
      inString = !inString;
      continue;
    }

    if (inString && char === "\n") {
      output += "\\n";
      continue;
    }

    if (inString && char === "\r") {
      continue;
    }

    output += char;
  }

  return output;
};

const importData = async (jsonString) => {
  const parsed = JSON.parse(normalizeJsonText(jsonString));

  const db = await openDB();
  const tx = db.transaction(["timeEntries", "todos"], "readwrite");
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  if (Array.isArray(parsed.timeEntries)) {
    const timeEntryStore = tx.objectStore("timeEntries");
    timeEntryStore.clear();

    for (const entry of parsed.timeEntries) {
      timeEntryStore.put(entry);
    }
  }

  if (Array.isArray(parsed.todos)) {
    const todoStore = tx.objectStore("todos");
    todoStore.clear();

    for (const todo of parsed.todos) {
      todoStore.put({
        ...todo,
        completedIndex: todo.completed ? 1 : 0,
        completedDateIndex: todo.completed ? todo.completedDate : undefined,
      });
    }
  }

  await done;
  db.close();
};
```

## Notes

- The app stores non-config data in IndexedDB.
- App settings are stored separately in localStorage.
- If you add new data stores later, update the export/import shape so the README stays accurate.
