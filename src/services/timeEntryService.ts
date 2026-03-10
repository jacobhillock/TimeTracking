import {
  deleteRecord,
  getByKey,
  getManyByKeys,
  getTx,
  putRecord,
  TIME_ENTRY_STORE_NAME,
} from './db';
import type { TimeEntry } from './types';

export async function getEntriesForDay(date: string): Promise<TimeEntry[]> {
  try {
    const entries = await getByKey(TIME_ENTRY_STORE_NAME, date);
    return entries || [];
  } catch (error) {
    console.error(`Failed to get entries for ${date}:`, error);
    return [];
  }
}

export async function getEntriesForDays(dates: string[]): Promise<Record<string, TimeEntry[]>> {
  try {
    const result: Record<string, TimeEntry[]> = {};
    const entriesByDate = await getManyByKeys(TIME_ENTRY_STORE_NAME, dates);

    dates.forEach((date, index) => {
      const entries = entriesByDate[index];
      if (entries && entries.length > 0) {
        result[date] = entries;
      }
    });

    return result;
  } catch (error) {
    console.error('Failed to get entries for days:', error);
    return {};
  }
}

export async function getAllEntries(): Promise<Record<string, TimeEntry[]>> {
  try {
    const [tx, close] = await getTx([TIME_ENTRY_STORE_NAME], 'readonly');
    const allKeys = await tx.store.getAllKeys();
    const allEntries = await tx.store.getAll();
    const result: Record<string, TimeEntry[]> = {};

    allKeys.forEach((key, index) => {
      const entries = allEntries[index];
      if (entries) {
        result[key as string] = entries;
      }
    });

    await close();
    return result;
  } catch (error) {
    console.error('Failed to get all entries:', error);
    return {};
  }
}

export async function setEntriesForDay(date: string, entries: TimeEntry[]): Promise<void> {
  try {
    await putRecord(TIME_ENTRY_STORE_NAME, entries, date);
    console.log(`Saved ${entries.length} entries for ${date}`);
  } catch (error) {
    console.error(`Failed to save entries for ${date}:`, error);
    throw new Error('Failed to save entries');
  }
}

export async function addEntry(date: string, entry: TimeEntry): Promise<void> {
  try {
    const existingEntries = await getEntriesForDay(date);
    const updatedEntries = [...existingEntries, entry];
    await setEntriesForDay(date, updatedEntries);
  } catch (error) {
    console.error(`Failed to add entry for ${date}:`, error);
    throw new Error('Failed to add entry');
  }
}

export async function updateEntry(date: string, updatedEntry: TimeEntry): Promise<void> {
  try {
    const existingEntries = await getEntriesForDay(date);
    const index = existingEntries.findIndex(e => e.id === updatedEntry.id);
    
    if (index === -1) {
      console.warn(`Entry ${updatedEntry.id} not found for ${date}`);
      return;
    }
    
    const updatedEntries = [...existingEntries];
    updatedEntries[index] = updatedEntry;
    await setEntriesForDay(date, updatedEntries);
  } catch (error) {
    console.error(`Failed to update entry for ${date}:`, error);
    throw new Error('Failed to update entry');
  }
}

export async function deleteEntry(date: string, entryId: number): Promise<void> {
  try {
    const existingEntries = await getEntriesForDay(date);
    const updatedEntries = existingEntries.filter(e => e.id !== entryId);
    await setEntriesForDay(date, updatedEntries);
  } catch (error) {
    console.error(`Failed to delete entry for ${date}:`, error);
    throw new Error('Failed to delete entry');
  }
}

export async function deleteDay(date: string): Promise<void> {
  try {
    await deleteRecord(TIME_ENTRY_STORE_NAME, date);
    console.log(`Deleted all entries for ${date}`);
  } catch (error) {
    console.error(`Failed to delete entries for ${date}:`, error);
    throw new Error('Failed to delete day entries');
  }
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
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
