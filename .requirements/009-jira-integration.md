# Integrating Jira into this app

This will be a 3 phased approach:

1. Consolidating log messages for ticket per dat
2. Collecting an auth token in settings and confirming that it works
3. When an entry is updated, automatically sending that change to jira in a debounced manner

### Definitions

- **TimeEntry** - Current individual times on the calendar
- **TimeLogSummary** - A single entry for total time and description

## 1. Consolidation

1. `../oil-blender` has an idb.ts file in it's `src/utilities` that I want to consume now. the data types should remain specific to this project and the indexes should be accurate
2. A new table will be added
  ```ts
  // something like
  type TimeLogSummary = {
    id: "client-ticket-yyyy-MM-dd",
    jiraId: "", // phase 3
    description: "", // log message
    logged: false,
    client: "",
    ticket: "",
    date: "yyyy-MM-dd",
  }
  ```
3. When I open an entry in the UI, the following should be true now:
   1. The description in the log message should go to the new tables description
   2. If that entry doesn't exist, it should be created and it's IDB key should be the ID
4. When an entry is updated, the time should also be updated in the log (the total time should be)
5. The summaries should pull panel should pull 

### Clean up

1. Move current descriptions into the time log summary from the entries
2. Mark the summaries as logged if they should be
3. remove unneeded fields from the entry

## 2. Jira Auth

We may need to add axios for making API requests into Jira. We can create an "external services" section for this

1. Add a new setting for Jira Auth Token
2. Add a new setting for Verified Auth Token = default false
   1. Not user editable
3. When an auth token is provided, we should make a request to jira to verify it worked

## 3. Jira automation

1. When an Log Summary is created, it should create it in Jira
2. Jira should provide a jira entry id so we should stamp that on the summary too
3. When that log is updated in some capacity, we should update the time logged and the description in jira
