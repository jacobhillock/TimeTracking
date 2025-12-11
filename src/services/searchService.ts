import { getAllEntries } from './timeEntryService';
import type { TimeEntry } from './types';

export interface SearchResult {
  date: string;
  entry: TimeEntry;
}

function formatDateForDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
}

function normalizeSearchTerm(term: string): string {
  return term.toLowerCase().trim();
}

function matchesSearchTerm(entry: TimeEntry, date: string, searchTerm: string): boolean {
  const normalizedTerm = normalizeSearchTerm(searchTerm);
  
  if (!normalizedTerm) return false;

  const formattedDate = formatDateForDisplay(date);
  const timeRange = `${entry.startTime} - ${entry.endTime}`;
  const clientTicket = entry.ticket ? `${entry.client}-${entry.ticket}` : entry.client;

  const searchableFields = [
    formattedDate,
    date,
    entry.startTime,
    entry.endTime,
    timeRange,
    entry.client,
    entry.ticket,
    clientTicket,
    entry.description,
  ].filter(Boolean);

  return searchableFields.some(field => 
    normalizeSearchTerm(field).includes(normalizedTerm)
  );
}

export async function searchEntries(searchTerm: string): Promise<SearchResult[]> {
  try {
    if (!searchTerm || !searchTerm.trim()) {
      return [];
    }

    const allEntries = await getAllEntries();
    const results: SearchResult[] = [];

    for (const [date, entries] of Object.entries(allEntries)) {
      for (const entry of entries) {
        if (matchesSearchTerm(entry, date, searchTerm)) {
          results.push({ date, entry });
        }
      }
    }

    results.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      return a.entry.startTime.localeCompare(b.entry.startTime);
    });

    return results;
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
}

export { formatDateForDisplay };
