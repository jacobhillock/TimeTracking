import {
  getAll,
  getAllByIndex,
  getByKey,
  getTx,
  TIME_LOG_SUMMARY_DATE_INDEX,
  TIME_LOG_SUMMARY_STORE_NAME,
  type TimeLogSummaryRecord,
} from "./db";
import type { TimeEntry, TimeLogSummary } from "./types";
import {
  buildTimeLogSummariesForDate,
  getTimeLogSummaryKey,
  getTimeLogSummaryId,
  mergeTimeLogSummariesForDate,
} from "./timeLogSummaryHelpers";

export async function getTimeLogSummaryForEntry(
  date: string,
  client: string,
  ticket: string,
): Promise<TimeLogSummary | undefined> {
  const id = getTimeLogSummaryId(date, client, ticket);
  try {
    return (await getByKey(TIME_LOG_SUMMARY_STORE_NAME, id)) as TimeLogSummary | undefined;
  } catch (error) {
    console.error(`Failed to get summary ${id}:`, error);
    return undefined;
  }
}

export async function getTimeLogSummariesForDay(date: string): Promise<TimeLogSummary[]> {
  try {
    return (await getAllByIndex(
      TIME_LOG_SUMMARY_STORE_NAME,
      TIME_LOG_SUMMARY_DATE_INDEX,
      date,
    )) as TimeLogSummary[];
  } catch (error) {
    console.error(`Failed to get summaries for ${date}:`, error);
    return [];
  }
}

export async function getTimeLogSummariesForDays(
  dates: string[],
): Promise<Record<string, TimeLogSummary[]>> {
  try {
    const result: Record<string, TimeLogSummary[]> = {};
    const summariesByDate = await Promise.all(
      dates.map(async (date) => [date, await getTimeLogSummariesForDay(date)] as const),
    );

    for (const [date, summaries] of summariesByDate) {
      if (summaries.length > 0) {
        result[date] = summaries;
      }
    }

    return result;
  } catch (error) {
    console.error("Failed to get summaries for days:", error);
    return {};
  }
}

export async function getAllTimeLogSummaries(): Promise<TimeLogSummary[]> {
  try {
    return (await getAll(TIME_LOG_SUMMARY_STORE_NAME)) as TimeLogSummary[];
  } catch (error) {
    console.error("Failed to get all summaries:", error);
    return [];
  }
}

export async function setTimeLogSummariesForDay(
  date: string,
  entries: TimeEntry[],
): Promise<void> {
  const [tx, close] = await getTx(TIME_LOG_SUMMARY_STORE_NAME, "readwrite");
  const store = tx.objectStore(TIME_LOG_SUMMARY_STORE_NAME);
  const existingSummaries = (await store.index(TIME_LOG_SUMMARY_DATE_INDEX).getAll(date)) as TimeLogSummaryRecord[];
  const summaries = mergeTimeLogSummariesForDate(date, entries, existingSummaries);

  for (const summary of existingSummaries) {
    await store.delete(summary.id);
  }

  for (const summary of summaries) {
    await store.put(summary);
  }

  await close();
}

export async function updateTimeLogSummaryDescription(
  date: string,
  client: string,
  ticket: string,
  description: string,
): Promise<void> {
  const summaryId = getTimeLogSummaryId(date, client, ticket);
  const summaryKey = getTimeLogSummaryKey(client, ticket);
  const [tx, close] = await getTx(TIME_LOG_SUMMARY_STORE_NAME, "readwrite");
  const store = tx.objectStore(TIME_LOG_SUMMARY_STORE_NAME);
  const summary = (await store.get(summaryId)) as TimeLogSummaryRecord | undefined;

  await store.put({
    id: summaryId,
    key: summary?.key || summaryKey,
    client,
    ticket,
    date,
    description,
    logged: summary?.logged || false,
    totalMinutes: summary?.totalMinutes || 0,
    jiraId: summary?.jiraId,
  });

  await close();
}

export async function syncTimeLogSummariesForDay(
  date: string,
  entries: TimeEntry[],
): Promise<void> {
  try {
    await setTimeLogSummariesForDay(date, entries);
  } catch (error) {
    console.error(`Failed to sync summaries for ${date}:`, error);
    throw new Error("Failed to sync summaries");
  }
}

export async function rebuildAllTimeLogSummaries(
  entriesByDate: Record<string, TimeEntry[]>,
): Promise<void> {
  const summaries = Object.entries(entriesByDate).flatMap(([date, entries]) =>
    buildTimeLogSummariesForDate(date, entries),
  );

  const [tx, close] = await getTx(TIME_LOG_SUMMARY_STORE_NAME, "readwrite");
  const store = tx.objectStore(TIME_LOG_SUMMARY_STORE_NAME);
  const existingSummaries = (await store.getAll()) as TimeLogSummaryRecord[];

  for (const summary of existingSummaries) {
    await store.delete(summary.id);
  }

  for (const summary of summaries) {
    await store.put(summary);
  }

  await close();
}
