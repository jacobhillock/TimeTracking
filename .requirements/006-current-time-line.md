# 006-current-time-line.md

## Feature

Add a "current time" indicator to Calendar View that draws a horizontal line from the time label column across all visible day columns.

## Requested Behavior (explicit)

1. The line represents the actual current time (not just the hovered/selected time slot).
2. The line starts at the time-label area and continues to the far right edge of the calendar grid.
3. If current time is before the configured calendar range, pin the indicator to the top of the calendar grid.
4. If current time is after the configured calendar range, pin the indicator to the bottom of the calendar grid.
5. Indicator styling must have strong contrast in both light and dark mode.
6. Current time text should be visible near the line.

## Implementation Plan

### 1. Add live "now" state and refresh cadence in `CalendarView`

- Add `now` state initialized with `new Date()`.
- Add a visibility/focus-aware scheduler in `useEffect`:
  - When tab/window is active (`document.visibilityState === 'visible'` and `window` has focus), run updates.
  - When inactive (hidden or blurred), stop scheduled updates to avoid unnecessary work and drift.
  - On regain of focus/visibility, immediately set `now` to `new Date()` so the line snaps to current real time right away.
- Align updates to real clock boundaries instead of fixed intervals:
  - Compute delay to next minute boundary: `(60 - now.getSeconds()) * 1000 - now.getMilliseconds()`.
  - Use `setTimeout` for this first boundary-aligned update, then continue with `setInterval(..., 60000)`.
  - This prevents lag like `11:01:28` when the true minute changed at `11:01:00`.
- Clear timer on unmount.
- Use current local time for display/positioning.

### 2. Compute indicator position against visible calendar range

- Reuse existing `timeToMinutes` + `getVisibleMinutes` output.
- Compute `currentMinutes = now.getHours() * 60 + now.getMinutes()`.
- Derive position mode:
  - `before` when `currentMinutes <= visibleStart`
  - `after` when `currentMinutes >= visibleEnd`
  - `within` otherwise
- Convert to percentage:
  - `before => 0%`
  - `after => 100%`
  - `within => ((currentMinutes - visibleStart) / visibleDuration) * 100`
- Clamp percent to `[0, 100]` for safety.

### 3. Render a dedicated overlay in the calendar grid

- Add an absolutely positioned overlay inside `.calendar-grid`, after column markup so it visually sits above slots.
- Use `pointer-events: none` on overlay so dragging/resizing entries continues to work unchanged.
- Overlay structure:
  - One full-width horizontal line positioned by computed top percent.
  - One compact time chip/label near the left side of the line (adjacent to time column boundary).
- Keep z-index below modals but above slots/entries as needed for visibility.

### 4. Ensure line starts at label area and spans to calendar end

- Anchor overlay to full `.calendar-grid` width (`left: 0; right: 0;`).
- Draw line full width so it crosses time-label column + all day columns.
- Place label close to the left side so it is clearly associated with the line.

### 5. Add contrast-safe styling in `index.css`

- Add new classes (example names):
  - `.calendar-current-time-overlay`
  - `.calendar-current-time-line`
  - `.calendar-current-time-label`
- Light mode: use a high-contrast red/orange line and white label background with dark text (or inverse depending on visual tests).
- Dark mode override: brighter, saturated line and dark label background with light text.
- Add subtle border/shadow so the label remains legible over entries of arbitrary client colors.

### 6. Handle top/bottom pinning label placement

- For `before` mode (top): place label just below top edge to avoid clipping.
- For `after` mode (bottom): place label just above bottom edge to avoid clipping.
- For `within`: center label vertically on the line.
- Keep line on exact boundary while offsetting only label if necessary.

### 7. Accessibility and formatting

- Expose readable time text in 12h or existing 24h style; keep consistent with app conventions (current code uses 24h in calendar labels, so keep 24h).
- Add `aria-label`/title on time chip if needed for clarity.
- No keyboard interaction required (pure visual indicator).

## Edge Cases

1. `calendarStartTime` and `calendarEndTime` changed by user settings: indicator recalculates automatically.
2. Very small/large intervals: indicator remains independent from slot height and still maps to true time.
3. Scrolled grid: indicator stays aligned because it is in the same scroll container.
4. Week shown is not current week: indicator still reflects actual current clock time (requested behavior is time-based, not date-based).

## Verification Plan (after implementation)

1. Manual check in light mode:
   - Set range including current time and verify line matches expected slot.
   - Set start time after current time and verify line pins top.
   - Set end time before current time and verify line pins bottom.
2. Manual check in dark mode for contrast and readability.
3. Verify line does not block:
   - creating drag selection,
   - resizing entries,
   - clicking entries.
4. Verify time chip updates as time advances (wait one refresh interval).

## Files Planned To Change (implementation phase only)

- `src/components/CalendarView.tsx`
- `src/index.css`

## Acceptance Criteria

1. A visible current-time line is always present on Calendar View.
2. It spans from the label column through the full calendar width.
3. It tracks real current time and updates without reload.
4. It pins to top/bottom when current time is out of visible range.
5. Time text near the line remains readable in both light and dark mode.
6. Existing calendar interactions continue to function.
