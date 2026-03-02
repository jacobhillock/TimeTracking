import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export const STORAGE_KEYS = {
  CURRENT_VIEW: 'currentView',
  CLIENTS: 'clients',
  CLIENT_COLORS: 'clientColors',
  JIRA_BASE_URL: 'jiraBaseUrl',
  DEFAULT_START_TIME: 'defaultStartTime',
  CALENDAR_INTERVAL: 'calendarInterval',
  CALENDAR_START_TIME: 'calendarStartTime',
  CALENDAR_END_TIME: 'calendarEndTime',
  DARK_MODE: 'darkMode',
  SIDEBAR_VISIBLE: 'sidebarVisible',
  COLLAPSED_SECTIONS: 'collapsedSections'
} as const

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

interface LocalStorageStateOptions<T> {
  parse?: (rawValue: string) => T
  serialize?: (value: T) => string
}

const defaultParse = <T,>(rawValue: string): T => {
  try {
    return JSON.parse(rawValue) as T
  } catch {
    return rawValue as T
  }
}

const defaultSerialize = <T,>(value: T): string => {
  if (typeof value === 'string') {
    return value
  }
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
    const storedValue = localStorage.getItem(key)
    if (storedValue === null) {
      return initialValue
    }

    try {
      return parse(storedValue)
    } catch (error) {
      console.warn(`Failed to parse localStorage value for key "${key}"`, error)
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
