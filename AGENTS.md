# Time Tracker — Agent Guide

Project-level context for AI agents working on this codebase.

> **Reminder:** Update this file as you learn things about the project—new conventions, gotchas, patterns, or preferences. Keep it current so future sessions benefit.
> **Reminder:** `.requirements` is where I am putting my requirement files. Ask questions when you are reading one of them. Refer to them sometimes when discussing new requirements to make sure we consistent.

## Overview

A time-tracking web app for logging work entries by client and ticket, with task and calendar views, todos, and Jira integration. Data is stored in IndexedDB (with migration from legacy localStorage).

## Tech Stack

- **Runtime**: Bun
- **Build**: Vite 7
- **UI**: React 19
- **Storage**: IndexedDB via `idb` package
- **Deploy**: Cloudflare Workers (wrangler.jsonc)

## Project Structure

```
src/
  App.jsx          # Main app, task view, calendar view, sidebar
  SearchModal.jsx  # Global search (Ctrl/Cmd+Q)
  main.jsx
  index.css
  services/
    db.ts           # IndexedDB setup, migration from localStorage
    types.ts        # TimeEntry, DayEntries, Todo interfaces
    timeEntryService.ts
    todoService.ts
    searchService.ts
.requirements/      # Feature/change specs (e.g. 001-move-dates.md)
```

## Data Models

- **TimeEntry**: `id`, `startTime`, `endTime`, `client`, `ticket`, `description`, `disabled`
- **Todo**: `id`, `description`, `client?`, `ticket?`, `completed`, `completedDate?`, `createdDate`
- Dates use `yyyy-MM-dd` format; times use `HH:mm` (24h).

## Conventions

- **JSX vs TSX**: App and SearchModal are `.jsx`; services are `.ts`. Prefer TypeScript for new code.
- **State**: React `useState`; some persisted to localStorage (clients, settings, dark mode, etc.).
- **Data flow**: Services read/write IndexedDB; App coordinates UI and calls services.
- **Date keys**: `dateKey` = `currentDate.toISOString().split('T')[0]` for lookups.

## Development

**Use `bun` only** (not npm or yarn) for install, run, add, remove.
```bash
bun install
bun run build    # Production build
```

### NEVER RUN EVER

```bash
bun run dev
```

## Requirements

Check `.requirements/` for planned changes (e.g. date handling, component refactors). Reference these when implementing features.
