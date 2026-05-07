import type {
  PolygonRings,
  Vec3,
  ViewerCityObject,
  ViewerDataset,
  ViewerFeature,
  ViewerObjectGeometry,
  ViewerSemanticSurface,
  ViewerValidationError,
} from '@/types/cityjson'

type CityJsonTransform = {
  scale?: number[]
  translate?: number[]
}

type CityJsonGeometry = {
  type?: string
  lod?: string
  boundaries?: unknown
  semantics?: CityJsonSemantics
}

type CityJsonSemanticSurface = {
  type?: string
} & Record<string, unknown>

type CityJsonSemantics = {
  surfaces?: CityJsonSemanticSurface[]
  values?: unknown
}

type CityJsonObject = {
  type?: string
  attributes?: Record<string, unknown>
  geometry?: CityJsonGeometry[]
  parents?: string[]
  children?: string[]
}

type CityJsonHeader = {
  type?: string
  version?: string
  transform?: CityJsonTransform
  metadata?: Record<string, unknown>
}

type CityJsonDocument = CityJsonHeader & {
  CityObjects?: Record<string, CityJsonObject>
  vertices?: number[][]
}

type ViewerDatasetInfo = {
  cityJsonVersion: string | null
  transform: { scale: Vec3; translate: Vec3 } | null
  metadata: Record<string, unknown> | null
}

type CityJsonFeature = {
  type?: string
  id?: string
  CityObjects?: Record<string, CityJsonObject>
  vertices?: number[][]
}

type Val3dityError = {
  code?: number
  description?: string
  id?: string
  info?: string
}

type Val3dityFeature = {
  id?: string
  validity?: boolean
  errors?: Val3dityError[]
}

type Val3dityReport = {
  features?: Val3dityFeature[]
}

export async function loadCityJsonSequenceFromUrl(url: string, sourceName: string) {
  return loadCityJsonFromUrl(url, sourceName)
}

export async function loadCityJsonFromUrl(url: string, sourceName: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch ${sourceName}.`)
  }

  const text = await response.text()
  return parseCityJson(text, sourceName)
}

export async function loadCityJsonSequenceFromFile(file: File) {
  return loadCityJsonFromFile(file)
}

export async function loadCityJsonFromFile(file: File) {
  let text: string
  try {
    text = await file.text()
  } catch (caughtError) {
    throw new Error(
      `Could not read ${file.name} (${formatByteSize(file.size)}). Very large CityJSON files can exceed browser memory limits.`,
      { cause: caughtError },
    )
  }

  if (!hasNonWhitespace(text) && file.size > 0) {
    throw new Error(
      `Could not read text from ${file.name} (${formatByteSize(file.size)}). The browser returned an empty text buffer for a non-empty file, which usually means the file is too large to read this way.`,
    )
  }

  return parseCityJson(text, file.name)
}

export async function loadValidationReportFromUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch validation report from ${url}.`)
  }

  const text = await response.text()
  return parseValidationReport(text)
}

export async function loadValidationReportFromFile(file: File) {
  const text = await file.text()
  return parseValidationReport(text)
}

function formatByteSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function hasNonWhitespace(text: string) {
  return /\S/.test(text)
}

export function parseCityJson(text: string, sourceName: string): ViewerDataset {
  if (!hasNonWhitespace(text)) {
    throw new Error('CityJSON input is empty.')
  }

  try {
    const parsed = JSON.parse(text) as unknown
    if (!isRecord(parsed) || Array.isArray(parsed)) {
      throw new Error('CityJSON input must be a JSON object or a CityJSON feature sequence.')
    }

    const type = parsed.type
    if (type === 'CityJSON') {
      return parseCityJsonDocument(parsed as CityJsonDocument, sourceName)
    }

    if (type === 'CityJSONFeature') {
      throw new Error('Expected a CityJSON feature sequence with a header line before feature objects.')
    }

    throw new Error('Expected a CityJSON object or a CityJSON feature sequence.')
  } catch (caughtError) {
    if (!(caughtError instanceof SyntaxError)) {
      throw caughtError
    }
  }

  return parseCityJsonSequence(text, sourceName)
}

export function parseCityJsonSequence(text: string, sourceName: string): ViewerDataset {
  const lines = text.split(/\r?\n/)
  const headerLineIndex = lines.findIndex(hasNonWhitespace)

  if (headerLineIndex < 0) {
    throw new Error('Expected a CityJSON feature sequence with a header line and at least one feature line.')
  }

  const header = JSON.parse(lines[headerLineIndex]) as CityJsonHeader
  const transform = header.transform ?? {}
  const info = extractDatasetInfo(header)

  const features: ViewerFeature[] = []

  for (let lineIndex = headerLineIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    if (!hasNonWhitespace(line)) {
      continue
    }

    const feature = JSON.parse(line) as CityJsonFeature
    if (feature.type !== 'CityJSONFeature' || !feature.CityObjects || !feature.vertices) {
      continue
    }

    const worldVertices = transformVerticesInPlace(feature.vertices, transform)
    const objects = Object.entries(feature.CityObjects)
    if (objects.length === 0) {
      continue
    }

    const roots = objects.filter(([, object]) => !object.parents || object.parents.length === 0)
    const rootEntry =
      objects.find(([id]) => id === feature.id) ?? roots[0] ?? objects[0]
    const [rootObjectId, rootObject] = rootEntry
    const viewerFeature = createViewerFeature({
      featureId: feature.id ?? rootObjectId,
      rootObjectId,
      rootObject,
      cityObjects: feature.CityObjects,
      vertices: worldVertices,
    })

    if (viewerFeature) {
      features.push(viewerFeature)
    }
  }

  return createViewerDataset(sourceName, features, info, 'CityJSONFeatures')
}

function parseCityJsonDocument(document: CityJsonDocument, sourceName: string): ViewerDataset {
  if (!isCityObjectsRecord(document.CityObjects)) {
    throw new Error('CityJSON object must contain a top-level "CityObjects" object.')
  }

  if (!Array.isArray(document.vertices)) {
    throw new Error('CityJSON object must contain a top-level "vertices" array.')
  }

  const transform = document.transform ?? {}
  const info = extractDatasetInfo(document)
  const worldVertices = transformVerticesInPlace(document.vertices, transform)
  const featureRootIds = collectFeatureRootIds(document.CityObjects)
  const features: ViewerFeature[] = []
  const processedObjectIds = new Set<string>()

  for (const rootObjectId of featureRootIds) {
    const rootObject = document.CityObjects[rootObjectId]
    if (!rootObject) {
      continue
    }

    const cityObjects = collectCityObjectSubtree(rootObjectId, document.CityObjects)
    for (const objectId of Object.keys(cityObjects)) {
      processedObjectIds.add(objectId)
    }

    const localized = localizeCityObjects(cityObjects, worldVertices)
    const viewerFeature = createViewerFeature({
      featureId: rootObjectId,
      rootObjectId,
      rootObject,
      cityObjects: localized.cityObjects,
      vertices: localized.vertices,
    })

    if (viewerFeature) {
      features.push(viewerFeature)
    }
  }

  for (const [objectId, object] of Object.entries(document.CityObjects)) {
    if (processedObjectIds.has(objectId)) {
      continue
    }

    const localized = localizeCityObjects({ [objectId]: object }, worldVertices)
    const viewerFeature = createViewerFeature({
      featureId: objectId,
      rootObjectId: objectId,
      rootObject: object,
      cityObjects: localized.cityObjects,
      vertices: localized.vertices,
    })

    if (viewerFeature) {
      features.push(viewerFeature)
    }
  }

  return createViewerDataset(sourceName, features, info, 'CityJSON')
}

function createViewerDataset(
  sourceName: string,
  features: ViewerFeature[],
  info: ViewerDatasetInfo,
  cityJsonKind: 'CityJSON' | 'CityJSONFeatures',
): ViewerDataset {
  if (features.length === 0) {
    throw new Error('No renderable CityJSON features were found.')
  }

  features.sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))

  const globalMin: Vec3 = [Infinity, Infinity, Infinity]
  const globalMax: Vec3 = [-Infinity, -Infinity, -Infinity]

  for (const feature of features) {
    updateGlobalExtent(globalMin, globalMax, feature.extent)
  }

  const extent: ViewerDataset['extent'] = [
    globalMin[0],
    globalMin[1],
    globalMin[2],
    globalMax[0],
    globalMax[1],
    globalMax[2],
  ]
  const center: Vec3 = [
    (extent[0] + extent[3]) / 2,
    (extent[1] + extent[4]) / 2,
    (extent[2] + extent[5]) / 2,
  ]

  return {
    sourceName,
    center,
    extent,
    features,
    ...info,
    cityJsonKind,
  }
}

function extractDatasetInfo(header: CityJsonHeader): ViewerDatasetInfo {
  const version = typeof header.version === 'string' ? header.version : null
  const metadata = isRecord(header.metadata) ? (header.metadata as Record<string, unknown>) : null
  const rawTransform = header.transform
  let transform: { scale: Vec3; translate: Vec3 } | null = null
  if (rawTransform && (Array.isArray(rawTransform.scale) || Array.isArray(rawTransform.translate))) {
    const scale = rawTransform.scale ?? [1, 1, 1]
    const translate = rawTransform.translate ?? [0, 0, 0]
    transform = {
      scale: [scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1],
      translate: [translate[0] ?? 0, translate[1] ?? 0, translate[2] ?? 0],
    }
  }
  return { cityJsonVersion: version, transform, metadata }
}

function createViewerFeature({
  featureId,
  rootObjectId,
  rootObject,
  cityObjects,
  vertices,
}: {
  featureId: string
  rootObjectId: string
  rootObject: CityJsonObject
  cityObjects: Record<string, CityJsonObject>
  vertices: Vec3[]
}): ViewerFeature | null {
  const renderableObjects = createRenderableObjects(cityObjects)
  if (renderableObjects.length === 0) {
    return null
  }

  const vertexIndices = uniqueVertexIndices(
    renderableObjects.flatMap((object) =>
      object.geometries.flatMap((geometry) => geometry.polygons),
    ),
  )
  const extent = calculateExtentFromIndices(vertices, vertexIndices)
  if (!extent) {
    return null
  }

  return {
    id: featureId,
    label: deriveFeatureLabel(featureId),
    rootObjectId,
    type: rootObject.type ?? 'CityObject',
    validity: null,
    errors: [],
    attributes: rootObject.attributes ?? {},
    vertices,
    objects: renderableObjects,
    extent,
  }
}

export function parseValidationReport(text: string) {
  let reportData: unknown

  try {
    reportData = JSON.parse(text)
  } catch {
    throw new Error('Validation report is not valid JSON.')
  }

  if (!reportData || typeof reportData !== 'object' || Array.isArray(reportData)) {
    throw new Error('Validation report must be a JSON object with a top-level "features" array.')
  }

  const report = reportData as Val3dityReport
  if (!Array.isArray(report.features)) {
    throw new Error('Validation report must contain a top-level "features" array.')
  }

  if (report.features.length === 0) {
    throw new Error('Validation report contains no features.')
  }

  const annotations = new Map<
    string,
    {
      validity: boolean
      errors: ViewerValidationError[]
    }
  >()

  for (const feature of report.features) {
    if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
      throw new Error('Validation report contains an invalid feature entry.')
    }

    const featureId = feature.id
    if (typeof featureId !== 'string' || featureId.trim().length === 0) {
      throw new Error('Validation report contains a feature without a valid string id.')
    }

    if ('validity' in feature && typeof feature.validity !== 'boolean') {
      throw new Error(`Validation report feature "${featureId}" is missing a valid boolean "validity" field.`)
    }

    if ('errors' in feature && !Array.isArray(feature.errors)) {
      throw new Error(`Validation report feature "${featureId}" has an invalid "errors" field.`)
    }

    annotations.set(featureId.trim(), {
      validity: feature.validity ?? false,
      errors: (feature.errors ?? []).map(parseValidationError),
    })
  }

  return annotations
}

export function assertValidationAnnotationsMatchDataset(
  dataset: ViewerDataset,
  annotations: Map<string, { validity: boolean; errors: ViewerValidationError[] }>,
) {
  const datasetFeatureIds = new Set(dataset.features.map((feature) => feature.id))
  let matchingFeatureCount = 0

  for (const featureId of annotations.keys()) {
    if (datasetFeatureIds.has(featureId)) {
      matchingFeatureCount += 1
    }
  }

  if (matchingFeatureCount === 0) {
    throw new Error('Validation report does not match the currently loaded CityJSON features.')
  }
}

export function mergeValidationAnnotations(
  dataset: ViewerDataset,
  annotations: Map<string, { validity: boolean; errors: ViewerValidationError[] }>,
) {
  return {
    ...dataset,
    features: dataset.features.map((feature) => {
      const annotation = annotations.get(feature.id)
      return {
        ...feature,
        validity: annotation?.validity ?? null,
        errors: annotation?.errors ?? [],
      }
    }),
  }
}

function createRenderableObjects(cityObjects: Record<string, CityJsonObject>) {
  const objects = Object.entries(cityObjects).map(([id, object]) => {
    const geometries = extractRenderableGeometries(object.geometry ?? [])

    return {
      id,
      object,
      parsed: {
        id,
        type: object.type ?? 'CityObject',
        attributes: object.attributes ?? {},
        geometries,
        bestGeometryIndex: pickBestGeometryIndex(geometries),
        hasRenderableChildren: false,
        parentIds: [],
        childIds: [],
      } satisfies ViewerCityObject,
    }
  })

  const parsedById = new Map(objects.map((entry) => [entry.id, entry]))
  const renderableIds = new Set(
    objects
      .filter((entry) => entry.parsed.geometries.length > 0)
      .map((entry) => entry.id),
  )
  const renderableObjects = objects
    .filter((entry) => entry.parsed.geometries.length > 0)
    .map((entry) => ({
      ...entry.parsed,
      hasRenderableChildren: hasRenderableChild(entry.object, parsedById),
      parentIds: (entry.object.parents ?? []).filter((parentId) => renderableIds.has(parentId)),
      childIds: (entry.object.children ?? []).filter((childId) => renderableIds.has(childId)),
    }))

  const renderableLeafObjects = renderableObjects.filter((entry) => !entry.hasRenderableChildren)
  const renderableParentObjects = renderableObjects.filter((entry) => entry.hasRenderableChildren)

  return renderableLeafObjects.length > 0
    ? [...renderableLeafObjects, ...renderableParentObjects]
    : renderableObjects
}

function collectFeatureRootIds(cityObjects: Record<string, CityJsonObject>) {
  const objectIds = new Set(Object.keys(cityObjects))
  const rootIds = Object.entries(cityObjects)
    .filter(([, object]) => !(object.parents ?? []).some((parentId) => objectIds.has(parentId)))
    .map(([id]) => id)

  return rootIds.length > 0 ? rootIds : Object.keys(cityObjects)
}

function collectCityObjectSubtree(
  rootObjectId: string,
  cityObjects: Record<string, CityJsonObject>,
) {
  const collected: Record<string, CityJsonObject> = {}
  const stack = [rootObjectId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const objectId = stack.pop()
    if (!objectId || visited.has(objectId)) {
      continue
    }

    visited.add(objectId)
    const object = cityObjects[objectId]
    if (!object) {
      continue
    }

    collected[objectId] = object
    for (const childId of object.children ?? []) {
      stack.push(childId)
    }
  }

  return collected
}

function localizeCityObjects(
  cityObjects: Record<string, CityJsonObject>,
  vertices: Vec3[],
) {
  const globalVertexIndices = collectCityObjectVertexIndices(cityObjects)
    .filter((index) => index >= 0 && index < vertices.length)
  const localVertexIndices = [...new Set(globalVertexIndices)].sort((left, right) => left - right)
  const localIndexByGlobalIndex = new Map(
    localVertexIndices.map((globalIndex, localIndex) => [globalIndex, localIndex]),
  )
  const localizedCityObjects = Object.fromEntries(
    Object.entries(cityObjects).map(([objectId, object]) => [
      objectId,
      remapCityObjectVertexIndices(object, localIndexByGlobalIndex),
    ]),
  )

  return {
    cityObjects: localizedCityObjects,
    vertices: localVertexIndices.map((index) => vertices[index]),
  }
}

function collectCityObjectVertexIndices(cityObjects: Record<string, CityJsonObject>) {
  const indices: number[] = []

  for (const object of Object.values(cityObjects)) {
    for (const geometry of object.geometry ?? []) {
      collectBoundaryVertexIndices(geometry.boundaries, indices)
    }
  }

  return indices
}

function collectBoundaryVertexIndices(value: unknown, indices: number[]) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    indices.push(value)
    return
  }

  if (!Array.isArray(value)) {
    return
  }

  for (const entry of value) {
    collectBoundaryVertexIndices(entry, indices)
  }
}

function remapCityObjectVertexIndices(
  object: CityJsonObject,
  localIndexByGlobalIndex: Map<number, number>,
): CityJsonObject {
  return {
    ...object,
    geometry: object.geometry?.map((geometry) => ({
      ...geometry,
      boundaries: remapBoundaryVertexIndices(geometry.boundaries, localIndexByGlobalIndex),
    })),
  }
}

function remapBoundaryVertexIndices(
  value: unknown,
  localIndexByGlobalIndex: Map<number, number>,
): unknown {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return localIndexByGlobalIndex.get(value) ?? value
  }

  if (!Array.isArray(value)) {
    return value
  }

  return value.map((entry) => remapBoundaryVertexIndices(entry, localIndexByGlobalIndex))
}

function hasRenderableChild(
  object: CityJsonObject,
  parsedById: Map<string, { object: CityJsonObject; parsed: ViewerCityObject }>,
): boolean {
  for (const childId of object.children ?? []) {
    const child = parsedById.get(childId)
    if (!child) {
      continue
    }

    if (child.parsed.geometries.length > 0 || hasRenderableChild(child.object, parsedById)) {
      return true
    }
  }

  return false
}

function extractRenderableGeometries(geometries: CityJsonGeometry[]) {
  return geometries.flatMap((geometry, index) => {
    const polygons = extractPolygons(geometry.type ?? '', geometry.boundaries)
    if (polygons.length === 0) {
      return []
    }

    const semanticSurfaces = extractSemanticSurfaces(
      geometry.type ?? '',
      geometry.semantics,
      polygons.length,
    )

    return [{
      index,
      geometryType: geometry.type ?? null,
      lod: geometry.lod ?? null,
      polygons,
      semanticSurfaces,
      sourceFaceIndices: polygons.map((_, polygonIndex) => polygonIndex),
      vertexIndices: uniqueVertexIndices(polygons),
    } satisfies ViewerObjectGeometry]
  })
}

function pickBestGeometryIndex(geometries: ViewerObjectGeometry[]) {
  let bestGeometryIndex: number | null = null
  let bestScore = -Infinity

  for (const geometry of geometries) {
    const lodScore = Number.parseFloat(geometry.lod ?? '0') || 0
    const typeScore = geometry.geometryType?.includes('Solid') ? 1 : 0
    const score = lodScore * 10 + typeScore

    if (score > bestScore) {
      bestGeometryIndex = geometry.index
      bestScore = score
    }
  }

  return bestGeometryIndex
}

function extractPolygons(geometryType: string, boundaries: unknown): PolygonRings[] {
  if (!boundaries || !Array.isArray(boundaries)) {
    return []
  }

  if (geometryType === 'MultiSurface' || geometryType === 'CompositeSurface') {
    return boundaries.filter(isPolygonRings)
  }

  if (geometryType === 'Solid') {
    return boundaries.flatMap((shell) =>
      Array.isArray(shell) ? shell.filter(isPolygonRings) : [],
    )
  }

  if (geometryType === 'MultiSolid' || geometryType === 'CompositeSolid') {
    return boundaries.flatMap((solid) =>
      Array.isArray(solid)
        ? solid.flatMap((shell) => (Array.isArray(shell) ? shell.filter(isPolygonRings) : []))
        : [],
    )
  }

  return []
}

function extractSemanticSurfaces(
  geometryType: string,
  semantics: CityJsonSemantics | undefined,
  polygonCount: number,
): Array<ViewerSemanticSurface | null> {
  const surfaceRefs = extractSemanticSurfaceRefs(geometryType, semantics?.values)
  const surfaces = semantics?.surfaces ?? []

  return Array.from({ length: polygonCount }, (_, polygonIndex) => {
    const surfaceRef = surfaceRefs[polygonIndex]
    if (surfaceRef == null || surfaceRef < 0) {
      return null
    }

    const surface = surfaces[surfaceRef]
    if (!surface) {
      return null
    }

    const { type, ...attributes } = surface
    return {
      surfaceIndex: surfaceRef,
      type: typeof type === 'string' && type.trim().length > 0 ? type : 'UnknownSurface',
      attributes,
    }
  })
}

function extractSemanticSurfaceRefs(geometryType: string, values: unknown): Array<number | null> {
  if (!values || !Array.isArray(values)) {
    return []
  }

  if (geometryType === 'MultiSurface' || geometryType === 'CompositeSurface') {
    return values.map(parseSemanticSurfaceRef)
  }

  if (geometryType === 'Solid') {
    return values.flatMap((shell) =>
      Array.isArray(shell) ? shell.map(parseSemanticSurfaceRef) : [],
    )
  }

  if (geometryType === 'MultiSolid' || geometryType === 'CompositeSolid') {
    return values.flatMap((solid) =>
      Array.isArray(solid)
        ? solid.flatMap((shell) => (Array.isArray(shell) ? shell.map(parseSemanticSurfaceRef) : []))
        : [],
    )
  }

  return []
}

function parseSemanticSurfaceRef(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function isPolygonRings(value: unknown): value is PolygonRings {
  return Array.isArray(value) && value.every((ring) => Array.isArray(ring))
}

function uniqueVertexIndices(polygons: PolygonRings[]) {
  const indices = new Set<number>()

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const index of ring) {
        if (typeof index === 'number') {
          indices.add(index)
        }
      }
    }
  }

  return [...indices].sort((left, right) => left - right)
}

function deriveFeatureLabel(featureId: string) {
  const prefix = 'NL.IMBAG.Pand.'
  return featureId.startsWith(prefix) ? featureId.slice(prefix.length) : featureId
}

function parseValidationError(error: Val3dityError): ViewerValidationError {
  const rawId = error.id ?? ''
  const parts = Object.fromEntries(
    rawId.split('|').map((part) => {
      const [key, value] = part.split('=')
      return [key, value]
    }),
  )

  return {
    code: error.code ?? -1,
    description: error.description ?? 'UNKNOWN',
    id: rawId,
    info: error.info ?? '',
    cityObjectId: parts.coid ?? null,
    geometryIndex: parseNullableInteger(parts.geom),
    shellIndex: parseNullableInteger(parts.shell),
    faceIndex: parseNullableInteger(parts.face),
    location: parseValidationLocation(error.info, error.description),
  }
}

function parseNullableInteger(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function parseValidationLocation(...sources: Array<string | undefined>) {
  const coordinatePattern =
    /\(\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\)/i

  for (const source of sources) {
    if (!source) {
      continue
    }

    const match = source.match(coordinatePattern)
    if (!match) {
      continue
    }

    const coordinates = match.slice(1, 4).map((entry) => Number.parseFloat(entry))
    if (coordinates.some((value) => Number.isNaN(value))) {
      continue
    }

    return coordinates as Vec3
  }

  return null
}

function transformVerticesInPlace(vertices: number[][], transform: CityJsonTransform): Vec3[] {
  const scale = transform.scale ?? [1, 1, 1]
  const translate = transform.translate ?? [0, 0, 0]

  for (const vertex of vertices) {
    vertex[0] = (vertex[0] ?? 0) * (scale[0] ?? 1) + (translate[0] ?? 0)
    vertex[1] = (vertex[1] ?? 0) * (scale[1] ?? 1) + (translate[1] ?? 0)
    vertex[2] = (vertex[2] ?? 0) * (scale[2] ?? 1) + (translate[2] ?? 0)
  }

  return vertices as Vec3[]
}

function calculateExtentFromIndices(
  vertices: Vec3[],
  indices: number[],
): ViewerFeature['extent'] | null {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  let hasVertex = false

  for (const index of indices) {
    const vertex = vertices[index]
    if (!vertex) {
      continue
    }

    hasVertex = true
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], vertex[axis])
      max[axis] = Math.max(max[axis], vertex[axis])
    }
  }

  return hasVertex ? [min[0], min[1], min[2], max[0], max[1], max[2]] : null
}

function updateGlobalExtent(
  globalMin: Vec3,
  globalMax: Vec3,
  extent: ViewerFeature['extent'],
) {
  globalMin[0] = Math.min(globalMin[0], extent[0])
  globalMin[1] = Math.min(globalMin[1], extent[1])
  globalMin[2] = Math.min(globalMin[2], extent[2])
  globalMax[0] = Math.max(globalMax[0], extent[3])
  globalMax[1] = Math.max(globalMax[1], extent[4])
  globalMax[2] = Math.max(globalMax[2], extent[5])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCityObjectsRecord(value: unknown): value is Record<string, CityJsonObject> {
  if (!isRecord(value)) {
    return false
  }

  return Object.values(value).every((entry) => isRecord(entry))
}
