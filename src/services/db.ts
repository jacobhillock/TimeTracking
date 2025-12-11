import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { TimeEntry, DayEntries } from './types';

const DB_NAME = 'timeTrackerDB';
const DB_VERSION = 2;
const STORE_NAME = 'timeEntries';

interface TimeTrackerDB extends DBSchema {
  [STORE_NAME]: {
    key: string; // yyyy-MM-dd format
    value: TimeEntry[];
  };
}

let dbInstance: IDBPDatabase<TimeTrackerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<TimeTrackerDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await openDB<TimeTrackerDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains(STORE_NAME)) {
            db.deleteObjectStore(STORE_NAME);
          }
          db.createObjectStore(STORE_NAME);
        }
      },
    });
    return dbInstance;
  } catch (error) {
    console.error('Failed to open IndexedDB:', error);
    throw new Error('Failed to initialize database');
  }
}

export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const entriesJson = localStorage.getItem('timeEntries');
    if (!entriesJson) {
      console.log('No localStorage data to migrate');
      return;
    }

    const entries: Record<string, TimeEntry[]> = JSON.parse(entriesJson);
    const db = await getDB();

    const migrationPromises = Object.entries(entries).map(async ([date, dayEntries]) => {
      try {
        await db.put(STORE_NAME, dayEntries, date);
        console.log(`Migrated ${dayEntries.length} entries for ${date}`);
      } catch (error) {
        console.error(`Failed to migrate data for ${date}:`, error);
      }
    });

    await Promise.all(migrationPromises);
    console.log('Migration from localStorage completed successfully');
  } catch (error) {
    console.error('Failed to migrate from localStorage:', error);
    throw new Error('Migration failed');
  }
}
