import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, IDBPTransaction } from 'idb';
import type { TimeEntry, Todo } from './types';

const DB_NAME = 'timeTrackerDB';
const DB_VERSION = 4;
export const TIME_ENTRY_STORE_NAME = 'timeEntries';
export const TODO_STORE_NAME = 'todos';
export const TODO_INDEX_COMPLETED = 'by-completed';
export const TODO_INDEX_COMPLETED_DATE = 'by-completed-date';

interface TimeTrackerDB extends DBSchema {
  [TIME_ENTRY_STORE_NAME]: {
    key: string; // yyyy-MM-dd format
    value: TimeEntry[];
  };
  [TODO_STORE_NAME]: {
    key: number;
    value: Todo;
    indexes: {
      [TODO_INDEX_COMPLETED]: boolean;
      [TODO_INDEX_COMPLETED_DATE]: string;
    };
  };
}

type StoreName = keyof TimeTrackerDB;
type StoreValue<T extends StoreName> = TimeTrackerDB[T]['value'];
type StoreKey<T extends StoreName> = TimeTrackerDB[T]['key'];
type StoreIndexMap<T extends StoreName> = TimeTrackerDB[T] extends { indexes: infer Indexes } ? Indexes : never;
type StoreIndexName<T extends StoreName> = keyof StoreIndexMap<T> & string;
type StoreIndexKey<T extends StoreName, I extends StoreIndexName<T>> = StoreIndexMap<T>[I];
type TxMode = 'readonly' | 'readwrite';

let dbInstance: IDBPDatabase<TimeTrackerDB> | null = null;

function ensureTodoIndexes(
  database: IDBPDatabase<TimeTrackerDB>,
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], 'versionchange'>
): void {
  const todoStore = database.objectStoreNames.contains(TODO_STORE_NAME)
    ? transaction.objectStore(TODO_STORE_NAME)
    : database.createObjectStore(TODO_STORE_NAME, { autoIncrement: true });

  if (!todoStore.indexNames.contains(TODO_INDEX_COMPLETED)) {
    todoStore.createIndex(TODO_INDEX_COMPLETED, 'completed');
  }

  if (!todoStore.indexNames.contains(TODO_INDEX_COMPLETED_DATE)) {
    todoStore.createIndex(TODO_INDEX_COMPLETED_DATE, 'completedDate');
  }
}

export async function getDB(): Promise<IDBPDatabase<TimeTrackerDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await openDB<TimeTrackerDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains(TIME_ENTRY_STORE_NAME)) {
            db.deleteObjectStore(TIME_ENTRY_STORE_NAME);
          }
          db.createObjectStore(TIME_ENTRY_STORE_NAME);
        }
        if (oldVersion < 3) {
          ensureTodoIndexes(db, transaction);
        }
        if (oldVersion < 4) {
          ensureTodoIndexes(db, transaction);
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
        await db.put(TIME_ENTRY_STORE_NAME, dayEntries, date);
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

export async function getTx<T extends StoreName[], M extends TxMode = 'readonly'>(
  storeNames: [...T],
  mode: M = 'readonly' as M
): Promise<[IDBPTransaction<TimeTrackerDB, T, M>, () => Promise<void>]> {
  const db = await getDB();
  const tx = db.transaction<T, M>(storeNames, mode);
  return [tx, async () => await tx.done];
}

export async function getByKey<T extends StoreName>(
  storeName: T,
  key: StoreKey<T>
): Promise<StoreValue<T> | undefined> {
  const db = await getDB();
  return await db.get(storeName, key) as StoreValue<T> | undefined;
}

export async function getManyByKeys<T extends StoreName>(
  storeName: T,
  keys: StoreKey<T>[]
): Promise<Array<StoreValue<T> | undefined>> {
  const [tx, close] = await getTx([storeName], 'readonly');
  const store = tx.objectStore(storeName);
  const values: Array<StoreValue<T> | undefined> = [];

  for (const key of keys) {
    values.push(await store.get(key) as StoreValue<T> | undefined);
  }

  await close();
  return values;
}

export async function getAll<T extends StoreName>(storeName: T): Promise<StoreValue<T>[]> {
  const db = await getDB();
  return await db.getAll(storeName) as StoreValue<T>[];
}

export async function addRecord<T extends StoreName>(
  storeName: T,
  value: StoreValue<T>,
  key?: StoreKey<T>
): Promise<StoreKey<T>> {
  const db = await getDB();

  if (key === undefined) {
    return await db.add(storeName, value) as StoreKey<T>;
  }

  return await db.add(storeName, value, key) as StoreKey<T>;
}

export async function putRecord<T extends StoreName>(
  storeName: T,
  value: StoreValue<T>,
  key: StoreKey<T>
): Promise<StoreKey<T>> {
  const db = await getDB();
  return await db.put(storeName, value, key) as StoreKey<T>;
}

export async function deleteRecord<T extends StoreName>(
  storeName: T,
  key: StoreKey<T>
): Promise<void> {
  const db = await getDB();
  await db.delete(storeName, key);
}

export async function getAllByIndex<
  T extends StoreName,
  I extends StoreIndexName<T>,
>(
  storeName: T,
  indexName: I,
  query: StoreIndexKey<T, I> | IDBKeyRange
): Promise<StoreValue<T>[]> {
  const db = await getDB();
  return await db.getAllFromIndex(storeName, indexName, query) as StoreValue<T>[];
}
