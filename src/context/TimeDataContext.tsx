import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from "react";
import type { Dispatch, SetStateAction } from "react";
import { migrateFromLocalStorage } from "../services/db";
import { getEntriesForDay, getEntriesForDays, setEntriesForDay } from "../services/timeEntryService";
import {
  getTimeLogSummariesForDay,
  updateTimeLogSummaryDescription,
} from "../services/timeLogSummaryService";
import {
  mergeTimeLogSummariesForDate,
} from "../services/timeLogSummaryHelpers";
import {
  addTodo as addTodoRecord,
  deleteTodo as deleteTodoRecord,
  getAllTodos,
  toggleTodoCompletion as toggleTodoCompletionRecord,
  updateTodo as updateTodoRecord,
} from "../services/todoService";
import type { EntriesByDate } from "../types/app";
import type { TimeEntry, TimeLogSummary, Todo } from "../services/types";

interface TimeDataState {
  entries: EntriesByDate;
  summariesByDate: Record<string, TimeLogSummary[]>;
  todos: Todo[];
  isLoadingEntries: boolean;
}

type TimeDataAction =
  | { type: "set_entries"; value: EntriesByDate }
  | { type: "set_summaries"; value: Record<string, TimeLogSummary[]> }
  | { type: "set_todos"; value: Todo[] }
  | { type: "set_loading"; value: boolean };

interface TimeDataContextValue extends TimeDataState {
  setEntries: Dispatch<SetStateAction<EntriesByDate>>;
  setSummariesByDate: Dispatch<SetStateAction<Record<string, TimeLogSummary[]>>>;
  setTodos: Dispatch<SetStateAction<Todo[]>>;
  setIsLoadingEntries: Dispatch<SetStateAction<boolean>>;
  loadEntriesForDay: (dateKey: string) => Promise<void>;
  loadEntriesForDays: (dateKeys: string[]) => Promise<void>;
  loadSummariesForDay: (dateKey: string) => Promise<void>;
  loadTodosForDate: (dateKey: string) => Promise<void>;
  replaceDayEntries: (dateKey: string, entries: TimeEntry[]) => Promise<void>;
  updateSummaryDescription: (
    dateKey: string,
    entry: TimeEntry,
    summaryDescription?: string,
  ) => Promise<void>;
  addTodo: (
    description: string,
    dateKey: string,
    client?: string,
    ticket?: string,
  ) => Promise<Todo | null>;
  toggleTodoCompletion: (id: number, dateKey: string) => Promise<boolean>;
  deleteTodo: (id: number, dateKey: string) => Promise<boolean>;
  updateTodo: (
    id: number,
    description: string,
    dateKey: string,
    client?: string,
    ticket?: string,
  ) => Promise<boolean>;
}

const TimeDataContext = createContext<TimeDataContextValue | null>(null);

function normalizeEntryTags<T extends TimeEntry>(entry: T): T {
  const tags = Array.isArray(entry.tags) ? [...new Set(entry.tags.map((tag) => tag.trim()).filter(Boolean))] : [];
  return {
    ...entry,
    client: entry.client.trim(),
    ticket: entry.ticket.trim(),
    description: entry.description.trim(),
    tags,
  };
}

function reducer(state: TimeDataState, action: TimeDataAction): TimeDataState {
  switch (action.type) {
    case "set_entries":
      return { ...state, entries: action.value };
    case "set_summaries":
      return { ...state, summariesByDate: action.value };
    case "set_todos":
      return { ...state, todos: action.value };
    case "set_loading":
      return { ...state, isLoadingEntries: action.value };
    default:
      return state;
  }
}

function applyUpdater<T>(value: T, updater: SetStateAction<T>): T {
  return typeof updater === "function" ? (updater as (prevState: T) => T)(value) : updater;
}

export function TimeDataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    entries: {},
    summariesByDate: {},
    todos: [],
    isLoadingEntries: true,
  });
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setEntries: Dispatch<SetStateAction<EntriesByDate>> = useCallback((updater) => {
    dispatch({ type: "set_entries", value: applyUpdater(stateRef.current.entries, updater) });
  }, []);

  const setSummariesByDate: Dispatch<SetStateAction<Record<string, TimeLogSummary[]>>> = useCallback((updater) => {
    dispatch({
      type: "set_summaries",
      value: applyUpdater(stateRef.current.summariesByDate, updater),
    });
  }, []);

  const setTodos: Dispatch<SetStateAction<Todo[]>> = useCallback((updater) => {
    dispatch({ type: "set_todos", value: applyUpdater(stateRef.current.todos, updater) });
  }, []);

  const setIsLoadingEntries: Dispatch<SetStateAction<boolean>> = useCallback((updater) => {
    dispatch({
      type: "set_loading",
      value: applyUpdater(stateRef.current.isLoadingEntries, updater),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        await migrateFromLocalStorage();
      } catch (error) {
        console.error("Failed to initialize database:", error);
      } finally {
        if (!cancelled) {
          setIsLoadingEntries(false);
        }
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadEntriesForDay = useCallback(async (dateKey: string): Promise<void> => {
    const dayEntries = await getEntriesForDay(dateKey);
    setEntries((prev) => ({ ...prev, [dateKey]: dayEntries }));
  }, [setEntries]);

  const loadEntriesForDays = useCallback(async (dateKeys: string[]): Promise<void> => {
    const weekEntries = await getEntriesForDays(dateKeys);
    if (Object.keys(weekEntries).length > 0) {
      setEntries((prev) => ({ ...prev, ...weekEntries }));
    }
  }, [setEntries]);

  const loadSummariesForDay = useCallback(async (dateKey: string): Promise<void> => {
    const daySummaries = await getTimeLogSummariesForDay(dateKey);
    setSummariesByDate((prev) => ({ ...prev, [dateKey]: daySummaries }));
  }, [setSummariesByDate]);

  const loadTodosForDate = useCallback(async (dateKey: string): Promise<void> => {
    const dayTodos = await getAllTodos(dateKey);
    setTodos(dayTodos);
  }, [setTodos]);

  const replaceDayEntries = useCallback(async (dateKey: string, entries: TimeEntry[]): Promise<void> => {
    const normalizedEntries = entries.map(normalizeEntryTags);
    const nextSummaries = mergeTimeLogSummariesForDate(
      dateKey,
      normalizedEntries,
      stateRef.current.summariesByDate[dateKey] || [],
    );

    setEntries((prev) => ({ ...prev, [dateKey]: normalizedEntries }));
    setSummariesByDate((prev) => ({ ...prev, [dateKey]: nextSummaries }));

    await setEntriesForDay(dateKey, normalizedEntries);
  }, [setEntries, setSummariesByDate]);

  const updateEntrySummaryDescription = useCallback(async (
    dateKey: string,
    entry: TimeEntry,
    summaryDescription?: string,
  ): Promise<void> => {
    const client = entry.client.trim();
    const ticket = entry.ticket.trim();
    if (!client || !ticket || summaryDescription === undefined) return;

    await updateTimeLogSummaryDescription(dateKey, client, ticket, summaryDescription.trim());
    await loadSummariesForDay(dateKey);
  }, [loadSummariesForDay]);

  const addTodo = useCallback(async (
    description: string,
    dateKey: string,
    client?: string,
    ticket?: string,
  ): Promise<Todo | null> => {
    const todo = await addTodoRecord(description, client, ticket, dateKey);
    if (todo) {
      await loadTodosForDate(dateKey);
    }
    return todo;
  }, [loadTodosForDate]);

  const toggleTodoCompletion = useCallback(async (id: number, dateKey: string): Promise<boolean> => {
    const success = await toggleTodoCompletionRecord(id);
    if (success) {
      await loadTodosForDate(dateKey);
    }
    return success;
  }, [loadTodosForDate]);

  const deleteTodo = useCallback(async (id: number, dateKey: string): Promise<boolean> => {
    const success = await deleteTodoRecord(id);
    if (success) {
      await loadTodosForDate(dateKey);
    }
    return success;
  }, [loadTodosForDate]);

  const updateTodo = useCallback(async (
    id: number,
    description: string,
    dateKey: string,
    client?: string,
    ticket?: string,
  ): Promise<boolean> => {
    const success = await updateTodoRecord(id, description, client, ticket);
    if (success) {
      await loadTodosForDate(dateKey);
    }
    return success;
  }, [loadTodosForDate]);

  return (
    <TimeDataContext.Provider
      value={{
        entries: state.entries,
        summariesByDate: state.summariesByDate,
        todos: state.todos,
        isLoadingEntries: state.isLoadingEntries,
        setEntries,
        setSummariesByDate,
        setTodos,
        setIsLoadingEntries,
        loadEntriesForDay,
        loadEntriesForDays,
        loadSummariesForDay,
        loadTodosForDate,
        replaceDayEntries,
        updateSummaryDescription: updateEntrySummaryDescription,
        addTodo,
        toggleTodoCompletion,
        deleteTodo,
        updateTodo,
      }}
    >
      {children}
    </TimeDataContext.Provider>
  );
}

export function useTimeData(): TimeDataContextValue {
  const context = useContext(TimeDataContext);
  if (!context) {
    throw new Error("useTimeData must be used within a TimeDataProvider");
  }

  return context;
}
