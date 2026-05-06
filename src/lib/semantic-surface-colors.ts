const SEMANTIC_SURFACE_COLORS: Record<string, string> = {
  roofsurface: '#c65a3a',
  groundsurface: '#6f9d4b',
  wallsurface: '#a7adb5',
  closuresurface: '#7d8fa3',
  outerceilingsurface: '#ec4899',
  outerfloorsurface: '#6ea892',
  window: '#55b7cf',
  door: '#b8793f',
  interiorwallsurface: '#b9a7c8',
  ceilingsurface: '#c1bdd3',
  floorsurface: '#b99b72',
  watersurface: '#3f8fc5',
  watergroundsurface: '#4c7f90',
  waterclosuresurface: '#4aa2a0',
  trafficarea: '#6f7680',
  auxiliarytrafficarea: '#8f9568',
  transportationmarking: '#d4b84a',
  transportationhole: '#3f454d',
}

const FALLBACK_SEMANTIC_SURFACE_COLORS = [
  '#c68b3f',
  '#70a95b',
  '#4da6b6',
  '#668fc2',
  '#9a7fbd',
  '#bd6d93',
  '#8f9a57',
] as const

export function semanticSurfaceColor(surfaceType: string) {
  const key = surfaceType.trim().toLowerCase()
  const matched = SEMANTIC_SURFACE_COLORS[key]
  if (matched) {
    return matched
  }

  const hash = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return FALLBACK_SEMANTIC_SURFACE_COLORS[hash % FALLBACK_SEMANTIC_SURFACE_COLORS.length]
}
