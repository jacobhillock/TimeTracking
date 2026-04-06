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

- **JSX vs TSX**: App/SearchModal/components are `.tsx`; services are `.ts`. Prefer TypeScript for new code.
- **State**: React `useState`; use `useLocalStorageState` (`src/hooks/useLocalStorageState.ts`) for localStorage-backed UI settings instead of per-state sync `useEffect`s.
- **Data flow**: Services read/write IndexedDB; App coordinates UI and calls services.
- **IndexedDB helpers**: Reusable low-level DB helpers live in `src/services/db.ts`; feature services should use those instead of ad hoc `db.get`/`db.put` calls when adding new storage logic.
- **Hooks**: Minimize hooks when possible.
- **Date keys**: `dateKey` = `currentDate.toISOString().split('T')[0]` for lookups.
- **Pinned tickets**: Persisted in localStorage via `STORAGE_KEYS.PINNED_TICKETS` (not IndexedDB) with friendly-name metadata.
- **Todo retrieval behavior**: `getAllTodos(dateKey)` returns active todos plus todos completed on that `dateKey`.
- **Todo indexes**: IndexedDB `todos` store supports indexed active/completed-day reads via derived fields (`completedIndex`, `completedDateIndex`) because boolean values are not valid IndexedDB keys. Query through the helpers/constants in `src/services/db.ts`.
- **Base UI usage**: Use `@base-ui-components/react` for relevant shared primitives. Todo controls currently use Base UI `Checkbox` and `Input`; descriptions use native `textarea` with auto-resize.

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

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ built-in commands (`vp dev`, `vp build`, `vp test`, etc.) always run the Vite+ built-in tool, not any `package.json` script of the same name. To run a custom script that shares a name with a built-in command, use `vp run <script>`. For example, if you have a custom `dev` script that runs multiple services concurrently, run it with `vp run dev`, not `vp dev` (which always starts Vite's dev server).
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## CI Integration

For GitHub Actions, consider using [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) to replace separate `actions/setup-node`, package-manager setup, cache, and install steps with a single action.

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    cache: true
- run: vp check
- run: vp test
```

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to validate changes.
<!--VITE PLUS END-->
