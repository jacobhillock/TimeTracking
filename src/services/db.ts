import { openDB } from "idb";
import type { DBSchema, IDBPDatabase, IDBPObjectStore, IDBPTransaction } from "idb";
import type { TimeEntry, Todo } from "./types";

const DB_NAME = "timeTrackerDB";
const DB_VERSION = 6;
export const TIME_ENTRY_STORE_NAME = "timeEntries";
export const TIME_ENTRY_DATE_INDEX = "by-date";
export const TODO_STORE_NAME = "todos";
export const TODO_INDEX_COMPLETED = "by-completed";
export const TODO_INDEX_COMPLETED_DATE = "by-completed-date";
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
type StoreValue<T extends StoreName> = TimeTrackerDB[T]["value"];
type StoreKey<T extends StoreName> = TimeTrackerDB[T]["key"];
type StoreIndexMap<T extends StoreName> = TimeTrackerDB[T]["indexes"];
type StoreIndexName<T extends StoreName> = Extract<keyof StoreIndexMap<T>, string>;
type StoreIndexKey<T extends StoreName, I extends StoreIndexName<T>> = StoreIndexMap<T>[I];
type TxMode = "readonly" | "readwrite";

let dbInstance: IDBPDatabase<TimeTrackerDB> | null = null;

export function toTodoRecord(todo: Todo): TodoRecord {
  return {
    ...todo,
    completedIndex: todo.completed ? TODO_COMPLETED_TRUE : TODO_COMPLETED_FALSE,
    completedDateIndex: todo.completed ? todo.completedDate : undefined,
  };
}

export function fromTodoRecord(todo: TodoRecord): Todo {
  const {
    completedIndex: _completedIndex,
    completedDateIndex: _completedDateIndex,
    ...publicTodo
  } = todo;
  return publicTodo;
}

export function toTimeEntryRecord(
  entry: TimeEntry,
  date: string,
  sortOrder: number,
): TimeEntryRecord {
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

function ensureIndex(
  store: IDBPObjectStore<any, any, any, "versionchange">,
  indexName: string,
  keyPath: string,
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
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], "versionchange">,
): void {
  const todoStore = database.objectStoreNames.contains(TODO_STORE_NAME)
    ? transaction.objectStore(TODO_STORE_NAME)
    : database.createObjectStore(TODO_STORE_NAME, { autoIncrement: true });

  ensureIndex(todoStore, TODO_INDEX_COMPLETED, "completedIndex");
  ensureIndex(todoStore, TODO_INDEX_COMPLETED_DATE, "completedDateIndex");
}

function ensureTimeEntryStore(
  database: IDBPDatabase<TimeTrackerDB>,
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], "versionchange">,
): IDBPObjectStore<any, any, typeof TIME_ENTRY_STORE_NAME, "versionchange"> {
  const timeEntryStore = database.objectStoreNames.contains(TIME_ENTRY_STORE_NAME)
    ? transaction.objectStore(TIME_ENTRY_STORE_NAME)
    : database.createObjectStore(TIME_ENTRY_STORE_NAME, { keyPath: "id" });

  ensureIndex(timeEntryStore, TIME_ENTRY_DATE_INDEX, "date");
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
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], "versionchange">,
): Promise<void> {
  const legacyStore = transaction.objectStore(TIME_ENTRY_STORE_NAME);
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
  const timeEntryStore = database.createObjectStore(TIME_ENTRY_STORE_NAME, { keyPath: "id" });
  ensureIndex(timeEntryStore, TIME_ENTRY_DATE_INDEX, "date");

  for (const record of flattenLegacyTimeEntries(legacyEntriesByDate)) {
    await timeEntryStore.put(record);
  }
}

async function migrateTodoRecords(
  transaction: IDBPTransaction<TimeTrackerDB, StoreName[], "versionchange">,
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
        if (oldVersion < 6) {
          if (db.objectStoreNames.contains(TIME_ENTRY_STORE_NAME)) {
            await migrateTimeEntryRecords(db, transaction);
          } else {
            ensureTimeEntryStore(db, transaction);
          }
        }
      },
    });
    return dbInstance;
  } catch (error) {
    console.error("Failed to open IndexedDB:", error);
    throw new Error("Failed to initialize database");
  }
}

export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const entriesJson = localStorage.getItem("timeEntries");
    if (!entriesJson) {
      console.log("No localStorage data to migrate");
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
      localStorage.removeItem("timeEntries");
    }
    console.log("Migration from localStorage completed successfully");
  } catch (error) {
    console.error("Failed to migrate from localStorage:", error);
    throw new Error("Migration failed");
  }
}

export async function getTx<T extends StoreName, M extends TxMode>(
  storeName: T,
  mode: M = "readonly" as M,
): Promise<[IDBPTransaction<TimeTrackerDB, [T], M>, () => Promise<void>]> {
  const db = await getDB();
  const tx = db.transaction(storeName, mode);
  return [tx, async () => await tx.done];
}

export async function getByKey<T extends StoreName>(
  storeName: T,
  key: StoreKey<T>,
): Promise<StoreValue<T> | undefined> {
  const db = await getDB();
  return await db.get(storeName, key);
}

export async function getManyByKeys<T extends StoreName>(
  storeName: T,
  keys: StoreKey<T>[],
): Promise<Array<StoreValue<T> | undefined>> {
  const [tx, close] = await getTx(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const values: Array<StoreValue<T> | undefined> = [];

  for (const key of keys) {
    values.push(await store.get(key));
  }

  await close();
  return values;
}

export async function getAll<T extends StoreName>(storeName: T): Promise<Array<StoreValue<T>>> {
  const db = await getDB();
  return await db.getAll(storeName);
}

export async function addRecord<T extends StoreName>(
  storeName: T,
  value: StoreValue<T>,
  key?: StoreKey<T>,
): Promise<StoreKey<T>> {
  const db = await getDB();

  if (key === undefined) {
    return await db.add(storeName, value);
  }

  return await db.add(storeName, value, key);
}

export async function putRecord<T extends StoreName>(
  storeName: T,
  value: StoreValue<T>,
  key?: StoreKey<T>,
): Promise<StoreKey<T>> {
  const db = await getDB();
  if (key === undefined) {
    return await db.put(storeName, value);
  }

  return await db.put(storeName, value, key);
}

export async function deleteRecord<T extends StoreName>(
  storeName: T,
  key: StoreKey<T>,
): Promise<void> {
  const db = await getDB();
  await db.delete(storeName, key);
}

export async function getAllByIndex<T extends StoreName, I extends StoreIndexName<T>>(
  storeName: T,
  indexName: I,
  query: StoreIndexKey<T, I> | IDBKeyRange,
): Promise<Array<StoreValue<T>>> {
  const [tx, close] = await getTx(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);
  const values = await index.getAll(query as never);
  await close();
  return values as Array<StoreValue<T>>;
}

export async function getAllKeysByIndex<T extends StoreName, I extends StoreIndexName<T>>(
  storeName: T,
  indexName: I,
  query: StoreIndexKey<T, I> | IDBKeyRange,
): Promise<Array<StoreKey<T>>> {
  const [tx, close] = await getTx(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);
  const keys = await index.getAllKeys(query as never);
  await close();
  return keys as Array<StoreKey<T>>;
}
