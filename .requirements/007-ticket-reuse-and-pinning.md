# 007-ticket-reuse-and-pinning.md

## Feature

Add a ticket reuse picker to the calendar entry modal and a persistent pinned tickets area in the right sidebar.

## Goals

1. Make it faster to fill `client` + `ticket` in the modal by selecting from recent/pinned tickets.
2. Let users pin commonly used tickets from the Summary section.
3. Show/manage pinned tickets in a dedicated sidebar section with friendly naming.

## Requested Behavior (as provided)

1. In the modal, add a dropdown similar in placement/flow to client selection, labeled like `Select ticket already logged to`.
2. Dropdown source should include:
   1. Tickets used in time entries from the last 7 days.
   2. Pinned tickets.
   3. Additional ideas (see section below).
3. On dropdown selection:
   1. Clear the dropdown back to placeholder.
   2. Set modal `client` to the ticket’s client.
   3. Set modal `ticket` to the selected ticket number.
4. In Summary cards, show a small pin button for tracked tickets only.
   1. If already pinned, do not show pin button.
5. In sidebar, add `Pinned Tickets` section with:
   1. Most recent log date within the last 7 days, otherwise `> 7 days ago`.
   2. Delete/unpin button.
   3. Textbox for a user-provided friendly name.
   4. In modal dropdown, display friendly name when present: `Friendly Name (CLIENT-123)`.

## Additional ideas for dropdown sources

1. Include tickets referenced by active todos (`todo.client` + `todo.ticket`) as a secondary source.
2. ~~Include currently edited entry’s existing client/ticket as the first option when editing (quick reselect).~~
3. ~~Rank duplicate ticket keys by recency so most recent appears first.~~
4. Add group headings in the dropdown with this order: `Pinned`, `Todos`, `Recent 7 days`.
5. Do not show duplicates within any single group (example: 3 todos for same ticket appears once).
6. Todo suggestions should include:
   - active todos (`completed === false`)
   - todos completed today (`completed === true && completedDate === dateKey`)

## Data Design

Use localStorage-backed UI state for pinned ticket metadata via `useLocalStorageState` (no IndexedDB schema change).

### New localStorage key

- `STORAGE_KEYS.PINNED_TICKETS`

### New type (proposed)

```ts
interface PinnedTicket {
  key: string; // `${client}-${ticket}`
  client: string;
  ticket: string;
  friendlyName?: string;
  pinnedAt: string; // yyyy-MM-dd
}
```

### Derived modal option type (not persisted)

```ts
interface TicketOption {
  key: string; // `${client}-${ticket}`
  client: string;
  ticket: string;
  source: "pinned" | "recent" | "todo";
  friendlyName?: string;
  lastLoggedDate?: string; // yyyy-MM-dd
}
```

Sorting rule:

1. Within each group (`Pinned`, `Todos`, `Recent 7 days`), sort by most recent `lastLoggedDate` first.
2. If two items have the same date (or no date), fallback to alphabetical `${client}-${ticket}`.

## UX Details

### Modal

1. Add a select field above or near client/ticket inputs:
   - Label: `Select ticket already logged to`
   - Placeholder: `Select ticket...`
2. Selecting an option:
   - Calls `onEditEntry({ ...editingEntry, client, ticket }, editingEntryDateKey)`.
   - Resets select value to `''` so it behaves like a one-time action.
3. Option label format:
   - Friendly exists: `Friendly Name (CLIENT-123)`
   - Friendly missing: `CLIENT-123`

### Summary section pin button

1. Ticket summary cards (non-untracked only) get a small pin button in the card action area.
2. Button hidden if key already exists in pinned state.
3. Pin action stores client/ticket and default empty friendlyName.

### Pinned tickets section (right sidebar)

1. New collapsible section `Pinned Tickets`.
2. Per pinned ticket row:
   - Primary label: friendly name or `CLIENT-123`.
   - Secondary info: `Last logged: yyyy-MM-dd` if within 7 days else `Last logged: > 7 days ago`.
   - Friendly name textbox (inline editable).
   - `Delete` button to unpin.
3. Sort rows:
   - Most recently logged first, then alphabetically by `client-ticket`.

## Query/Derivation Logic

1. Build date keys from local date using an inclusive 8-day window: today through today-7.
   - Example: if today is Wednesday, include entries back to the previous Wednesday.
2. Pull entries for those days from IndexedDB using a new service helper:
   - `getEntriesForDays(dateKeys)` already exists and can be reused.
   - If missing from `entries` state cache, fetch to ensure the modal list is accurate.
3. Extract unique tracked ticket keys (`client` and non-empty `ticket`).
4. Compute `lastLoggedDate` for each key using max date in the 7-day window.
5. Merge pinned + recent (+ optional todos) into one deduplicated list.
   - Group order/priority: pinned > todo > recent.
   - Always preserve pinned friendlyName.
   - De-duplicate by normalized key `${client}-${ticket}` inside each group.

## Implementation Plan (no code yet)

### 1. Types and storage key wiring

1. Add `PINNED_TICKETS` to `STORAGE_KEYS` in `src/hooks/useLocalStorageState.ts`.
2. Add pinned ticket interfaces to `src/types/app.ts` (or a dedicated types file if cleaner).

### 2. App-level state and helpers

1. In `src/App.tsx`, add:
   - `const [pinnedTickets, setPinnedTickets] = useLocalStorageState<PinnedTicket[]>(...)`.
2. Add helper functions:
   - `makeTicketKey(client, ticket)`.
   - `pinTicket(client, ticket)`.
   - `unpinTicket(key)`.
   - `updatePinnedFriendlyName(key, value)`.
3. Add derived computations:
   - `recentTicketStats` (last 7 days, with most recent date).
   - `pinnedTicketsWithRecency`.
   - `modalTicketOptions`.

### 3. Sidebar UI: summary pin + pinned section

1. In summary card rendering (`src/App.tsx`), add pin button for tracked items when not already pinned.
2. Add `CollapsibleSection` named `pinnedTickets`.
3. Render list with:
   - label + last logged text
   - friendly-name input
   - delete/unpin button
4. Add minimal CSS classes in `src/index.css` for clean spacing and dark mode parity.

### 4. Calendar modal UI behavior

1. In `src/components/CalendarView.tsx`, extend props with:
   - `ticketOptions`
   - `onTicketQuickSelect`
2. Add new modal select field with label text.
3. Render grouped options in this order:
   - `Pinned`
   - `Todos`
   - `Recent 7 days`
4. On selection, call parent handler to set client/ticket and clear dropdown local state.

### 5. Prop plumbing

1. Extend `CalendarViewProps` in `src/types/app.ts`.
2. Pass new props from `App.tsx` into `CalendarView`.

### 6. Safeguards and edge behavior

1. Exclude untracked entries from all selectable ticket sources.
2. Trim client/ticket before keying to avoid duplicate keys caused by whitespace.
3. Preserve existing modal behavior for manually typed ticket/client.
4. Keep pin controls hidden for untracked summary items.
5. For todo suggestions, only include:
   - `completed === false`
   - or `completed === true && completedDate === dateKey`

### 7. Validation

1. Manual checks:
   - Pin from summary, verify appears in pinned section.
   - Friendly name updates and persists across reload.
   - Modal dropdown shows pinned + recent options.
   - Selecting option fills client/ticket and clears dropdown value.
   - Unpin removes from section and pinned subset of dropdown.
   - Recency text shows exact date for <=7 days else `> 7 days ago`.
2. Build validation:
   - `bun run build`

## Files Planned To Change (implementation phase)

1. `src/App.tsx`
2. `src/components/CalendarView.tsx`
3. `src/types/app.ts`
4. `src/hooks/useLocalStorageState.ts`
5. `src/index.css`

## Open Questions

1. Should pinned tickets remain visible in dropdown even if they have never been logged in the last 7 days? (Plan assumes yes.)
   A: Yes

2. For the sidebar “Delete button” wording: should the UI label be `Delete` exactly, or `Unpin`?
   A: Unpin

3. If two clients share the same ticket number (example `ABC-123`, `XYZ-123`), should dropdown group by full key and show both independently? (Plan assumes yes.)
   A: Show both independantly

4. Should friendly names be unique, or can multiple pinned tickets share the same friendly name?
   A: They do not have to be unique

5. Should friendly-name edits save on every keystroke, on blur, or with an explicit save control? (Plan assumes save-on-change for simplicity.)
   A: debounced on the keystroke

6. In the modal, where should the new selector be placed:
   1. Above `Client`
   2. Between `Client` and `Ticket #`
   3. Below `Ticket #`
      A: To the right of `Client`

7. Should we cap dropdown list size (example top 30 by recency) to avoid very long lists?
   A: That will be fine, 30 for most recent. no cap for todo or pins though

## Out of Scope (for this change)

1. Search/filter input inside ticket dropdown.
2. Migrating pinned tickets into IndexedDB.
3. Bulk import/export of pinned tickets.
