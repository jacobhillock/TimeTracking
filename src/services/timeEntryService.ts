import { getDB } from './db';
import type { TimeEntry, DayEntries } from './types';

const STORE_NAME = 'timeEntries';

export async function getEntriesForDay(date: string): Promise<TimeEntry[]> {
  try {
    const db = await getDB();
    const entries = await db.get(STORE_NAME, date);
    return entries || [];
  } catch (error) {
    console.error(`Failed to get entries for ${date}:`, error);
    return [];
  }
}

export async function getAllEntries(): Promise<Record<string, TimeEntry[]>> {
  try {
    const db = await getDB();
    const allKeys = await db.getAllKeys(STORE_NAME);
    const result: Record<string, TimeEntry[]> = {};
    
    for (const key of allKeys) {
      const entries = await db.get(STORE_NAME, key);
      if (entries) {
        result[key as string] = entries;
      }
    }
    
    return result;
  } catch (error) {
    console.error('Failed to get all entries:', error);
    return {};
  }
}

export async function setEntriesForDay(date: string, entries: TimeEntry[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, entries, date);
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
    const db = await getDB();
    await db.delete(STORE_NAME, date);
    console.log(`Deleted all entries for ${date}`);
  } catch (error) {
    console.error(`Failed to delete entries for ${date}:`, error);
    throw new Error('Failed to delete day entries');
  }
}
