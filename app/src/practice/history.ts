/** How many distinct local calendar days the given times fall on. */
export function daysPracticed(isoTimes: string[]): number {
  return new Set(isoTimes.map((iso) => new Date(iso).toDateString())).size;
}
