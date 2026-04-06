import {
  deleteRecord,
  getAll,
  getAllByIndex,
  getAllKeysByIndex,
  getTx,
  TIME_ENTRY_DATE_INDEX,
  TIME_ENTRY_STORE_NAME,
  toTimeEntryRecord,
  fromTimeEntryRecord,
  type TimeEntryRecord,
} from "./db";
import type { TimeEntry } from "./types";
import type { IDBPObjectStore } from "idb";

type ReadTimeEntryStore = IDBPObjectStore<any, any, typeof TIME_ENTRY_STORE_NAME, "readonly">;
type WriteTimeEntryStore = IDBPObjectStore<any, any, typeof TIME_ENTRY_STORE_NAME, "readwrite">;
type AnyTimeEntryStore = ReadTimeEntryStore | WriteTimeEntryStore;

function sortTimeEntryRecords(records: TimeEntryRecord[]): TimeEntryRecord[] {
  return [...records].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function groupRecordsByDate(records: TimeEntryRecord[]): Record<string, TimeEntry[]> {
  const grouped: Record<string, TimeEntryRecord[]> = {};

  for (const record of records) {
    const dayRecords = grouped[record.date] || [];
    dayRecords.push(record);
    grouped[record.date] = dayRecords;
  }

  const result: Record<string, TimeEntry[]> = {};
  for (const [date, dayRecords] of Object.entries(grouped)) {
    const sortedDayRecords = sortTimeEntryRecords(dayRecords);
    if (sortedDayRecords.length > 0) {
      result[date] = sortedDayRecords.map(fromTimeEntryRecord);
    }
  }

  return result;
}

async function getDayRecords(date: string, store?: AnyTimeEntryStore): Promise<TimeEntryRecord[]> {
  const entries = store
    ? await store.index(TIME_ENTRY_DATE_INDEX).getAll(date)
    : await getAllByIndex(TIME_ENTRY_STORE_NAME, TIME_ENTRY_DATE_INDEX, date);
  return sortTimeEntryRecords(entries as TimeEntryRecord[]);
}

async function getDayRecordIds(date: string, store?: AnyTimeEntryStore): Promise<number[]> {
  const recordIds = store
    ? await store.index(TIME_ENTRY_DATE_INDEX).getAllKeys(date)
    : await getAllKeysByIndex(TIME_ENTRY_STORE_NAME, TIME_ENTRY_DATE_INDEX, date);
  return recordIds as number[];
}

async function saveDayRecords(
  date: string,
  records: TimeEntryRecord[],
  store: WriteTimeEntryStore,
): Promise<void> {
  const existingIds = await getDayRecordIds(date, store);

  for (const id of existingIds) {
    await store.delete(id);
  }

  for (const record of records) {
    await store.put(record);
  }
}

async function replaceEntriesForDay(date: string, entries: TimeEntry[]): Promise<void> {
  const [tx, close] = await getTx(TIME_ENTRY_STORE_NAME, "readwrite");
  const store = tx.objectStore(TIME_ENTRY_STORE_NAME);
  const records = entries.map((entry, sortOrder) => toTimeEntryRecord(entry, date, sortOrder));
  await saveDayRecords(date, records, store);

  await close();
}

async function upsertEntryRecord(
  date: string,
  updatedEntry: TimeEntry,
  sortOrder: number,
  store?: WriteTimeEntryStore,
): Promise<void> {
  if (store) {
    await store.put(toTimeEntryRecord(updatedEntry, date, sortOrder));
    return;
  }

  const [tx, close] = await getTx(TIME_ENTRY_STORE_NAME, "readwrite");
  const txStore = tx.objectStore(TIME_ENTRY_STORE_NAME);
  await txStore.put(toTimeEntryRecord(updatedEntry, date, sortOrder));
  await close();
}

export async function getEntriesForDay(date: string): Promise<TimeEntry[]> {
  try {
    const entries = await getDayRecords(date);
    return entries.map(fromTimeEntryRecord);
  } catch (error) {
    console.error(`Failed to get entries for ${date}:`, error);
    return [];
  }
}

export async function getEntriesForDays(dates: string[]): Promise<Record<string, TimeEntry[]>> {
  try {
    const result: Record<string, TimeEntry[]> = {};
    const entriesByDate = await Promise.all(
      dates.map(async (date) => [date, await getEntriesForDay(date)] as const),
    );

    for (const [date, entries] of entriesByDate) {
      if (entries.length > 0) {
        result[date] = entries;
      }
    }

    return result;
  } catch (error) {
    console.error("Failed to get entries for days:", error);
    return {};
  }
}

export async function getAllEntries(): Promise<Record<string, TimeEntry[]>> {
  try {
    const allEntries = await getAll(TIME_ENTRY_STORE_NAME);
    return groupRecordsByDate(allEntries);
  } catch (error) {
    console.error("Failed to get all entries:", error);
    return {};
  }
}

export async function setEntriesForDay(date: string, entries: TimeEntry[]): Promise<void> {
  try {
    await replaceEntriesForDay(date, entries);
    console.log(`Saved ${entries.length} entries for ${date}`);
  } catch (error) {
    console.error(`Failed to save entries for ${date}:`, error);
    throw new Error("Failed to save entries");
  }
}

export async function addEntry(date: string, entry: TimeEntry): Promise<void> {
  try {
    const [tx, close] = await getTx(TIME_ENTRY_STORE_NAME, "readwrite");
    const store = tx.objectStore(TIME_ENTRY_STORE_NAME);
    const existingEntries = await getDayRecords(date, store);
    const nextSortOrder =
      existingEntries.length > 0
        ? Math.max(...existingEntries.map((record) => record.sortOrder)) + 1
        : 0;
    await upsertEntryRecord(date, entry, nextSortOrder, store);
    await close();
  } catch (error) {
    console.error(`Failed to add entry for ${date}:`, error);
    throw new Error("Failed to add entry");
  }
}

export async function updateEntry(date: string, updatedEntry: TimeEntry): Promise<void> {
  try {
    const [tx, close] = await getTx(TIME_ENTRY_STORE_NAME, "readwrite");
    const store = tx.objectStore(TIME_ENTRY_STORE_NAME);
    const existingEntries = await getDayRecords(date, store);
    const existingEntry = existingEntries.find((entry) => entry.id === updatedEntry.id);

    if (!existingEntry) {
      console.warn(`Entry ${updatedEntry.id} not found for ${date}`);
      await close();
      return;
    }

    const nextEntries = existingEntries.map((entry) =>
      entry.id === updatedEntry.id
        ? toTimeEntryRecord(updatedEntry, date, existingEntry.sortOrder)
        : entry,
    );
    await saveDayRecords(date, nextEntries, store);
    await close();
  } catch (error) {
    console.error(`Failed to update entry for ${date}:`, error);
    throw new Error("Failed to update entry");
  }
}

export async function deleteEntry(date: string, entryId: number): Promise<void> {
  try {
    const existingIds = await getDayRecordIds(date);
    if (!existingIds.includes(entryId)) {
      return;
    }

    await deleteRecord(TIME_ENTRY_STORE_NAME, entryId);
  } catch (error) {
    console.error(`Failed to delete entry for ${date}:`, error);
    throw new Error("Failed to delete entry");
  }
}

export async function deleteDay(date: string): Promise<void> {
  try {
    const [tx, close] = await getTx(TIME_ENTRY_STORE_NAME, "readwrite");
    const store = tx.objectStore(TIME_ENTRY_STORE_NAME);
    const existingIds = await getDayRecordIds(date, store);
    for (const id of existingIds) {
      await store.delete(id);
    }
    await close();
    console.log(`Deleted all entries for ${date}`);
  } catch (error) {
    console.error(`Failed to delete entries for ${date}:`, error);
    throw new Error("Failed to delete day entries");
  }
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function entriesOverlap(a: TimeEntry, b: TimeEntry): boolean {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

export async function findOverlappingEntries(date: string, entry: TimeEntry): Promise<TimeEntry[]> {
  const dayEntries = await getEntriesForDay(date);
  return dayEntries.filter((e) => e.id !== entry.id && entriesOverlap(e, entry));
}

export async function moveEntry(fromDate: string, toDate: string, entry: TimeEntry): Promise<void> {
  await deleteEntry(fromDate, entry.id);
  await addEntry(toDate, entry);
}
