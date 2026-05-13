export function getJiraUrl(
  jiraBaseUrl: string,
  client?: string,
  ticket?: string,
): string | undefined {
  if (jiraBaseUrl && client && ticket) {
    return `${jiraBaseUrl}/${client}-${ticket}`;
  }

  return undefined;
}
