// Country names for region codes ("US" → "United States").

let regionNames: Intl.DisplayNames | null = null

export function regionName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}
