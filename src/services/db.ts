import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, IDBPTransaction } from 'idb';
import type { TimeEntry, Todo } from './types';

const DB_NAME = 'timeTrackerDB';
const DB_VERSION = 6;
export const TIME_ENTRY_STORE_NAME = 'timeEntries';
export const TIME_ENTRY_DATE_INDEX = 'by-date';
export const TODO_STORE_NAME = 'todos';
export const TODO_INDEX_COMPLETED = 'by-completed';
export const TODO_INDEX_COMPLETED_DATE = 'by-completed-date';
export const TODO_COMPLETED_FALSE = 0;
export const TODO_COMPLETED_TRUE = 1;

export interface TimeEntryRecord extends TimeEntry {
  date: string;
  sortOrder: number;
}

export interface TodoRecord extends Todo {
  completedIndex: typeof TODO_COMPLETED_FALSE | typeof TODO_COMPLETED_TRUE;
  completedDateIndex?: string;
}

interface TimeTrackerDB extends DBSchema {
  [TIME_ENTRY_STORE_NAME]: {
    key: number;
    value: TimeEntryRecord;
    indexes: {
      [TIME_ENTRY_DATE_INDEX]: string;
    };
  };
  [TODO_STORE_NAME]: {
    key: number;
    value: TodoRecord;
    indexes: {
      [TODO_INDEX_COMPLETED]: number;
      [TODO_INDEX_COMPLETED_DATE]: string;
    };
  };
}

type StoreName = typeof TIME_ENTRY_STORE_NAME | typeof TODO_STORE_NAME;
type AutoIncrementStoreName = typeof TODO_STORE_NAME;
type KeyedStoreName = Exclude<StoreName, AutoIncrementStoreName>;
type StoreValue<T extends StoreName> = TimeTrackerDB[T]['value'];
type StoreKey<T extends StoreName> = TimeTrackerDB[T]['key'];
type StoreIndexMap<T extends StoreName> = TimeTrackerDB[T] extends { indexes: infer Indexes } ? Indexes : never;
type StoreIndexName<T extends StoreName> = keyof StoreIndexMap<T> & string;
type StoreIndexKey<T extends StoreName, I extends StoreIndexName<T>> = StoreIndexMap<T>[I];
type TxMode = 'readonly' | 'readwrite';

let dbInstance: IDBPDatabase<TimeTrackerDB> | null = null;

export function toTodoRecord(todo: Todo): TodoRecord {
  return {
    ...todo,
    completedIndex: todo.completed ? TODO_COMPLETED_TRUE : TODO_COMPLETED_FALSE,
    completedDateIndex: todo.completed ? todo.completedDate : undefined,
  };
}

export function fromTodoRecord(todo: TodoRecord): Todo {
  const { completedIndex: _completedIndex, completedDateIndex: _completedDateIndex, ...publicTodo } = todo;
  return publicTodo;
}

export function toTimeEntryRecord(entry: TimeEntry, date: string, sortOrder: number): TimeEntryRecord {
  return {
    ...entry,
    date,
    sortOrder,
  };
}

export function fromTimeEntryRecord(entry: TimeEntryRecord): TimeEntry {
  const { date: _date, sortOrder: _sortOrder, ...publicEntry } = entry;
  return publicEntry;
}

function ensureTodoIndex(
  store: IDBObjectStore,
  indexName: string,
  keyPath: string
): void {
  if (store.indexNames.contains(indexName)) {
    const existingKeyPath = store.index(indexName).keyPath;
    if (existingKeyPath === keyPath) {
      return;
    }
    store.deleteIndex(indexName);
  }

  store.createIndex(indexName, keyPath);
}

function ensureTodoIndexes(
  database: IDBPDatabase<TimeTrackerDB>,
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], 'versionchange'>
): void {
  const todoStore = (database.objectStoreNames.contains(TODO_STORE_NAME)
    ? transaction.objectStore(TODO_STORE_NAME)
    : database.createObjectStore(TODO_STORE_NAME, { autoIncrement: true })) as unknown as IDBObjectStore;

  ensureTodoIndex(todoStore, TODO_INDEX_COMPLETED, 'completedIndex');
  ensureTodoIndex(todoStore, TODO_INDEX_COMPLETED_DATE, 'completedDateIndex');
}

function ensureTimeEntryIndex(
  store: IDBObjectStore,
  indexName: string,
  keyPath: string
): void {
  if (store.indexNames.contains(indexName)) {
    const existingKeyPath = store.index(indexName).keyPath;
    if (existingKeyPath === keyPath) {
      return;
    }
    store.deleteIndex(indexName);
  }

  store.createIndex(indexName, keyPath);
}

function ensureTimeEntryStore(
  database: IDBPDatabase<TimeTrackerDB>,
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], 'versionchange'>
): IDBObjectStore {
  const timeEntryStore = (database.objectStoreNames.contains(TIME_ENTRY_STORE_NAME)
    ? transaction.objectStore(TIME_ENTRY_STORE_NAME)
    : database.createObjectStore(TIME_ENTRY_STORE_NAME, { keyPath: 'id' })) as unknown as IDBObjectStore;

  ensureTimeEntryIndex(timeEntryStore, TIME_ENTRY_DATE_INDEX, 'date');
  return timeEntryStore;
}

function flattenLegacyTimeEntries(entriesByDate: Record<string, TimeEntry[]>): TimeEntryRecord[] {
  const flattened: TimeEntryRecord[] = [];

  for (const [date, dayEntries] of Object.entries(entriesByDate)) {
    dayEntries.forEach((entry, sortOrder) => {
      flattened.push(toTimeEntryRecord(entry, date, sortOrder));
    });
  }

  return flattened;
}

async function migrateTimeEntryRecords(
  database: IDBPDatabase<TimeTrackerDB>,
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], 'versionchange'>
): Promise<void> {
  const legacyStore = transaction.objectStore(TIME_ENTRY_STORE_NAME) as unknown as IDBObjectStore;
  const legacyKeys = (await legacyStore.getAllKeys()) as unknown as string[];
  const legacyEntries = (await legacyStore.getAll()) as unknown as TimeEntry[][];
  const legacyEntriesByDate: Record<string, TimeEntry[]> = {};

  legacyKeys.forEach((key, index) => {
    const date = String(key);
    const entries = legacyEntries[index];
    if (entries) {
      legacyEntriesByDate[date] = entries;
    }
  });

  database.deleteObjectStore(TIME_ENTRY_STORE_NAME);
  const timeEntryStore = database.createObjectStore(TIME_ENTRY_STORE_NAME, { keyPath: 'id' }) as unknown as IDBObjectStore;
  ensureTimeEntryIndex(timeEntryStore, TIME_ENTRY_DATE_INDEX, 'date');

  for (const record of flattenLegacyTimeEntries(legacyEntriesByDate)) {
    await timeEntryStore.put(record);
  }
}

async function migrateTodoRecords(
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], 'versionchange'>
): Promise<void> {
  const todoStore = transaction.objectStore(TODO_STORE_NAME);
  const todos = await todoStore.getAll();

  for (const todo of todos) {
    const normalizedTodo = toTodoRecord(todo);
    await todoStore.put(normalizedTodo, normalizedTodo.id);
  }
}

export async function getDB(): Promise<IDBPDatabase<TimeTrackerDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await openDB<TimeTrackerDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 6) {
          if (db.objectStoreNames.contains(TIME_ENTRY_STORE_NAME)) {
            await migrateTimeEntryRecords(db, transaction);
          } else {
            const timeEntryStore = ensureTimeEntryStore(db, transaction);
            ensureTimeEntryIndex(timeEntryStore, TIME_ENTRY_DATE_INDEX, 'date');
          }
        }
        if (oldVersion < 3) {
          ensureTodoIndexes(db, transaction);
        }
        if (oldVersion < 4) {
          ensureTodoIndexes(db, transaction);
        }
        if (oldVersion < 5 && db.objectStoreNames.contains(TODO_STORE_NAME)) {
          ensureTodoIndexes(db, transaction);
          await migrateTodoRecords(transaction);
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

    const flattenedEntries = flattenLegacyTimeEntries(entries);
    let hasFailures = false;
    const migrationPromises = flattenedEntries.map(async (entry) => {
      try {
        await db.put(TIME_ENTRY_STORE_NAME, entry);
      } catch (error) {
        hasFailures = true;
        console.error(`Failed to migrate entry ${entry.id} for ${entry.date}:`, error);
      }
    });

    await Promise.all(migrationPromises);
    if (!hasFailures) {
      localStorage.removeItem('timeEntries');
    }
    console.log('Migration from localStorage completed successfully');
  } catch (error) {
    console.error('Failed to migrate from localStorage:', error);
    throw new Error('Migration failed');
  }
}

export async function getTx(
  storeNames: StoreName[],
  mode: TxMode = 'readonly'
): Promise<[any, () => Promise<void>]> {
  const db = await getDB();
  const tx = db.transaction(storeNames as any, mode);
  return [tx, async () => await tx.done];
}

export async function getByKey(
  storeName: StoreName,
  key: IDBValidKey
): Promise<any> {
  const db = await getDB();
  return await (db as any).get(storeName, key);
}

export async function getManyByKeys(
  storeName: StoreName,
  keys: IDBValidKey[]
): Promise<any[]> {
  const [tx, close] = await getTx([storeName], 'readonly');
  const store = tx.objectStore(storeName);
  const values: any[] = [];

  for (const key of keys) {
    values.push(await store.get(key));
  }

  await close();
  return values;
}

export async function getAll(storeName: StoreName): Promise<any[]> {
  const db = await getDB();
  return await (db as any).getAll(storeName);
}

export async function addRecord(
  storeName: StoreName,
  value: any,
  key?: IDBValidKey
): Promise<any> {
  const db = await getDB();
  const dbAny = db as any;

  if (key === undefined) {
    return await dbAny.add(storeName, value);
  }

  return await dbAny.add(storeName, value, key);
}

export async function putRecord(
  storeName: StoreName,
  value: any,
  key: IDBValidKey
): Promise<any> {
  const db = await getDB();
  return await (db as any).put(storeName, value, key);
}

export async function deleteRecord(
  storeName: StoreName,
  key: IDBValidKey
): Promise<void> {
  const db = await getDB();
  await (db as any).delete(storeName, key);
}

export async function getAllByIndex(
  storeName: StoreName,
  indexName: string,
  query: IDBValidKey | IDBKeyRange
): Promise<any[]> {
  const db = await getDB();
  return await (db as any).getAllFromIndex(storeName, indexName, query);
}

export async function getAllKeysByIndex(
  storeName: StoreName,
  indexName: string,
  query: IDBValidKey | IDBKeyRange
): Promise<any[]> {
  const db = await getDB();
  return await (db as any).getAllKeysFromIndex(storeName, indexName, query);
}
