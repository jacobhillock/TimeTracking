import { createContext, useContext } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import useLocalStorageState, { STORAGE_KEYS } from "../hooks/useLocalStorageState";
import type { ClientColors, CollapsedSections, PinnedTicket, ViewMode } from "../types/app";

const DEFAULT_TAG_TYPES = ["Admin", "Research", "Development", "Design"];

const parseCurrentView = (rawValue: string): ViewMode => {
  return rawValue === "task" || rawValue === "calendar" ? rawValue : "calendar";
};

const parseNumber =
  (fallback: number) =>
  (rawValue: string): number => {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

const normalizeTagPart = (value: string): string => value.trim();

const normalizeTagList = (values: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const tag = normalizeTagPart(value);
    if (!tag) return;

    const lookup = tag.toLowerCase();
    if (seen.has(lookup)) return;

    seen.add(lookup);
    normalized.push(tag);
  });

  return normalized;
};

const parseTagTypes = (rawValue: string): string[] => {
  return normalizeTagList(JSON.parse(rawValue) as string[]);
};

export interface SettingsContextValue {
  currentView: ViewMode;
  setCurrentView: Dispatch<SetStateAction<ViewMode>>;
  clients: string[];
  setClients: Dispatch<SetStateAction<string[]>>;
  clientColors: ClientColors;
  setClientColors: Dispatch<SetStateAction<ClientColors>>;
  jiraBaseUrl: string;
  setJiraBaseUrl: Dispatch<SetStateAction<string>>;
  defaultStartTime: string;
  setDefaultStartTime: Dispatch<SetStateAction<string>>;
  calendarInterval: number;
  setCalendarInterval: Dispatch<SetStateAction<number>>;
  calendarStartTime: string;
  setCalendarStartTime: Dispatch<SetStateAction<string>>;
  calendarEndTime: string;
  setCalendarEndTime: Dispatch<SetStateAction<string>>;
  openReminderTime: string | null;
  setOpenReminderTime: Dispatch<SetStateAction<string | null>>;
  lastOpenReminderDate: string | null;
  setLastOpenReminderDate: Dispatch<SetStateAction<string | null>>;
  closeReminderTime: string | null;
  setCloseReminderTime: Dispatch<SetStateAction<string | null>>;
  lastCloseReminderDate: string | null;
  setLastCloseReminderDate: Dispatch<SetStateAction<string | null>>;
  darkMode: boolean;
  setDarkMode: Dispatch<SetStateAction<boolean>>;
  sidebarVisible: boolean;
  setSidebarVisible: Dispatch<SetStateAction<boolean>>;
  collapsedSections: CollapsedSections;
  setCollapsedSections: Dispatch<SetStateAction<CollapsedSections>>;
  pinnedTickets: PinnedTicket[];
  setPinnedTickets: Dispatch<SetStateAction<PinnedTicket[]>>;
  tagTypes: string[];
  setTagTypes: Dispatch<SetStateAction<string[]>>;
  useClassicColors: boolean;
  setUseClassicColors: Dispatch<SetStateAction<boolean>>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useLocalStorageState<ViewMode>(
    STORAGE_KEYS.CURRENT_VIEW,
    "calendar",
    {
      parse: parseCurrentView,
    },
  );
  const [clients, setClients] = useLocalStorageState<string[]>(STORAGE_KEYS.CLIENTS, []);
  const [clientColors, setClientColors] = useLocalStorageState<ClientColors>(
    STORAGE_KEYS.CLIENT_COLORS,
    {},
  );
  const [jiraBaseUrl, setJiraBaseUrl] = useLocalStorageState<string>(
    STORAGE_KEYS.JIRA_BASE_URL,
    "",
  );
  const [defaultStartTime, setDefaultStartTime] = useLocalStorageState<string>(
    STORAGE_KEYS.DEFAULT_START_TIME,
    "09:00",
  );
  const [calendarInterval, setCalendarInterval] = useLocalStorageState<number>(
    STORAGE_KEYS.CALENDAR_INTERVAL,
    15,
    {
      parse: parseNumber(15),
      serialize: (value) => String(value),
    },
  );
  const [calendarStartTime, setCalendarStartTime] = useLocalStorageState<string>(
    STORAGE_KEYS.CALENDAR_START_TIME,
    "00:00",
  );
  const [calendarEndTime, setCalendarEndTime] = useLocalStorageState<string>(
    STORAGE_KEYS.CALENDAR_END_TIME,
    "23:59",
  );
  const [openReminderTime, setOpenReminderTime] = useLocalStorageState<string | null>(
    STORAGE_KEYS.OPEN_REMINDER_TIME,
    null,
  );
  const [closeReminderTime, setCloseReminderTime] = useLocalStorageState<string | null>(
    STORAGE_KEYS.CLOSE_REMINDER_TIME,
    null,
  );
  const [lastOpenReminderDate, setLastOpenReminderDate] = useLocalStorageState<string | null>(
    STORAGE_KEYS.LAST_OPEN_REMINDER_DATE,
    null,
  );
  const [lastCloseReminderDate, setLastCloseReminderDate] = useLocalStorageState<string | null>(
    STORAGE_KEYS.LAST_CLOSE_REMINDER_DATE,
    null,
  );
  const [darkMode, setDarkMode] = useLocalStorageState<boolean>(STORAGE_KEYS.DARK_MODE, false);
  const [sidebarVisible, setSidebarVisible] = useLocalStorageState<boolean>(
    STORAGE_KEYS.SIDEBAR_VISIBLE,
    true,
  );
  const [collapsedSections, setCollapsedSections] = useLocalStorageState<CollapsedSections>(
    STORAGE_KEYS.COLLAPSED_SECTIONS,
    {},
  );
  const [pinnedTickets, setPinnedTickets] = useLocalStorageState<PinnedTicket[]>(
    STORAGE_KEYS.PINNED_TICKETS,
    [],
  );
  const [tagTypes, setTagTypes] = useLocalStorageState<string[]>(
    STORAGE_KEYS.TAG_TYPES,
    DEFAULT_TAG_TYPES,
    { parse: parseTagTypes },
  );
  const [useClassicColors, setUseClassicColors] = useLocalStorageState<boolean>(
    STORAGE_KEYS.USE_CLASSIC_COLORS,
    false,
  );

  return (
    <SettingsContext.Provider
      value={{
        currentView,
        setCurrentView,
        clients,
        setClients,
        clientColors,
        setClientColors,
        jiraBaseUrl,
        setJiraBaseUrl,
        defaultStartTime,
        setDefaultStartTime,
        calendarInterval,
        setCalendarInterval,
        calendarStartTime,
        setCalendarStartTime,
        calendarEndTime,
        setCalendarEndTime,
        openReminderTime,
        setOpenReminderTime,
        lastOpenReminderDate,
        setLastOpenReminderDate,
        closeReminderTime,
        setCloseReminderTime,
        lastCloseReminderDate,
        setLastCloseReminderDate,
        darkMode,
        setDarkMode,
        sidebarVisible,
        setSidebarVisible,
        collapsedSections,
        setCollapsedSections,
        pinnedTickets,
        setPinnedTickets,
        tagTypes,
        setTagTypes,
        useClassicColors,
        setUseClassicColors,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }

  return context;
}
