export function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}
