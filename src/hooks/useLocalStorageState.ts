import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { notifyStorageParseFailure } from '../services/toastService'

export const STORAGE_KEYS = {
  CURRENT_VIEW: 'currentView',
  CLIENTS: 'clients',
  CLIENT_COLORS: 'clientColors',
  JIRA_BASE_URL: 'jiraBaseUrl',
  DEFAULT_START_TIME: 'defaultStartTime',
  CALENDAR_INTERVAL: 'calendarInterval',
  CALENDAR_START_TIME: 'calendarStartTime',
  CALENDAR_END_TIME: 'calendarEndTime',
  OPEN_REMINDER_TIME: 'openReminderTime',
  CLOSE_REMINDER_TIME: 'closeReminderTime',
  LAST_OPEN_REMINDER_DATE: 'lastOpenReminderDate',
  LAST_CLOSE_REMINDER_DATE: 'lastCloseReminderDate',
  DARK_MODE: 'darkMode',
  SIDEBAR_VISIBLE: 'sidebarVisible',
  COLLAPSED_SECTIONS: 'collapsedSections',
  PINNED_TICKETS: 'pinnedTickets',
  TAG_TYPES: 'tagTypes'
} as const

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

interface LocalStorageStateOptions<T> {
  parse?: (rawValue: string) => T
  serialize?: (value: T) => string
}

const LOCAL_STORAGE_MIGRATION_KEY = 'useLocalStorageState:migrated:v2'
const LEGACY_PLAIN_STRING_KEYS: StorageKey[] = [
  STORAGE_KEYS.CURRENT_VIEW,
  STORAGE_KEYS.JIRA_BASE_URL,
  STORAGE_KEYS.DEFAULT_START_TIME,
  STORAGE_KEYS.CALENDAR_START_TIME,
  STORAGE_KEYS.CALENDAR_END_TIME,
  STORAGE_KEYS.OPEN_REMINDER_TIME,
  STORAGE_KEYS.CLOSE_REMINDER_TIME,
  STORAGE_KEYS.LAST_OPEN_REMINDER_DATE,
  STORAGE_KEYS.LAST_CLOSE_REMINDER_DATE
]

let hasRunLocalStorageMigration = false

const migrateLegacyPlainStringSettings = (): void => {
  if (hasRunLocalStorageMigration) return
  hasRunLocalStorageMigration = true

  try {
    if (localStorage.getItem(LOCAL_STORAGE_MIGRATION_KEY) === '1') {
      return
    }

    LEGACY_PLAIN_STRING_KEYS.forEach((key) => {
      const storedValue = localStorage.getItem(key)
      if (storedValue === null) return

      try {
        JSON.parse(storedValue)
      } catch {
        localStorage.setItem(key, JSON.stringify(storedValue))
      }
    })

    localStorage.setItem(LOCAL_STORAGE_MIGRATION_KEY, '1')
  } catch (error) {
    console.warn('Failed localStorage legacy string migration', error)
  }
}

const defaultParse = <T,>(rawValue: string): T => {
  try {
    return JSON.parse(rawValue) as T
  } catch (error) {
    const trimmed = rawValue.trim()
    const startsLikeJson =
      trimmed.startsWith('{') ||
      trimmed.startsWith('[') ||
      trimmed.startsWith('"') ||
      trimmed === 'true' ||
      trimmed === 'false' ||
      trimmed === 'null' ||
      /^-?\d/.test(trimmed)

    if (startsLikeJson) {
      throw error
    }

    return rawValue as T
  }
}

const defaultSerialize = <T,>(value: T): string => {
  return JSON.stringify(value)
}

function useLocalStorageState<T>(
  key: StorageKey,
  initialValue: T,
  options?: LocalStorageStateOptions<T>
): [T, Dispatch<SetStateAction<T>>] {
  const parse = options?.parse ?? defaultParse<T>
  const serialize = options?.serialize ?? defaultSerialize<T>

  const [state, setState] = useState<T>(() => {
    migrateLegacyPlainStringSettings()

    const storedValue = localStorage.getItem(key)
    if (storedValue === null) {
      return initialValue
    }

    try {
      return parse(storedValue)
    } catch (error) {
      console.warn(`Failed to parse localStorage value for key "${key}"`, error)
      notifyStorageParseFailure(key)
      return initialValue
    }
  })

  const setStoredState: Dispatch<SetStateAction<T>> = useCallback((nextState) => {
    setState((prevState) => {
      const resolvedState = typeof nextState === 'function'
        ? (nextState as (prev: T) => T)(prevState)
        : nextState

      try {
        localStorage.setItem(key, serialize(resolvedState))
      } catch (error) {
        console.error(`Failed to write localStorage value for key "${key}"`, error)
      }

      return resolvedState
    })
  }, [key, serialize])

  return [state, setStoredState]
}

export default useLocalStorageState
