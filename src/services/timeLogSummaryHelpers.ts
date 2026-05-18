import type { TimeEntry, TimeLogSummary } from "./types";

export function normalizeSummaryPart(value: string): string {
  return value.trim();
}

export function getTimeLogSummaryId(date: string, client: string, ticket: string): string {
  return `${getTimeLogSummaryKey(client, ticket)}-${date}`;
}

export function getTimeLogSummaryKey(client: string, ticket: string): string {
  return `${normalizeSummaryPart(client)}-${normalizeSummaryPart(ticket)}`;
}

function timeToMinutes(timeStr: string): number {
  const [hoursRaw, minutesRaw] = timeStr.split(":").map(Number);
  return hoursRaw * 60 + minutesRaw;
}

function getEntryMinutes(entry: TimeEntry): number {
  return timeToMinutes(entry.endTime) - timeToMinutes(entry.startTime);
}

function joinDescriptions(entries: TimeEntry[]): string {
  const descriptions: string[] = [];
  const seen = new Set<string>();

  entries.forEach((entry) => {
    const description = entry.description.trim();
    if (!description) return;

    const lookup = description.toLowerCase();
    if (seen.has(lookup)) return;

    seen.add(lookup);
    descriptions.push(description);
  });

  return descriptions.join("; ");
}

export function buildTimeLogSummariesForDate(
  date: string,
  entries: TimeEntry[],
): TimeLogSummary[] {
  const grouped = new Map<
    string,
    {
      key: string;
      client: string;
      ticket: string;
      entries: TimeEntry[];
    }
  >();

  entries.forEach((entry) => {
    const client = normalizeSummaryPart(entry.client);
    const ticket = normalizeSummaryPart(entry.ticket);
    if (!client || !ticket) return;

    const key = getTimeLogSummaryKey(client, ticket);
    const existing = grouped.get(key);
    if (existing) {
      existing.entries.push({
        ...entry,
        client,
        ticket,
        description: entry.description.trim(),
      });
      return;
    }

    grouped.set(key, {
      key,
      client,
      ticket,
      entries: [
        {
          ...entry,
          client,
          ticket,
          description: entry.description.trim(),
        },
      ],
    });
  });

  return [...grouped.entries()].map(([id, group]) => {
    const totalMinutes = group.entries.reduce((sum, entry) => sum + getEntryMinutes(entry), 0);
    const logged = group.entries.length > 0 && group.entries.every((entry) => entry.disabled);

    return {
      id: getTimeLogSummaryId(date, group.client, group.ticket),
      client: group.client,
      ticket: group.ticket,
      key: group.key,
      date,
      description: joinDescriptions(group.entries),
      logged,
      totalMinutes,
    };
  });
}

export function buildTimeLogSummariesByDate(
  entriesByDate: Record<string, TimeEntry[]>,
): TimeLogSummary[] {
  const summaries: TimeLogSummary[] = [];

  for (const [date, entries] of Object.entries(entriesByDate)) {
    summaries.push(...buildTimeLogSummariesForDate(date, entries));
  }

  return summaries;
}

export function mergeTimeLogSummariesForDate(
  date: string,
  entries: TimeEntry[],
  existingSummaries: TimeLogSummary[],
): TimeLogSummary[] {
  const existingSummariesByKey = new Map(existingSummaries.map((summary) => [summary.key, summary] as const));

  return buildTimeLogSummariesForDate(date, entries).map((summary) => {
    const existing = existingSummariesByKey.get(summary.key);
    if (!existing) {
      return summary;
    }

    const existingDescription = existing.description.trim();

    return {
      ...summary,
      description: existingDescription || summary.description,
      jiraId: existing.jiraId,
      logged: summary.logged,
    };
  });
}
