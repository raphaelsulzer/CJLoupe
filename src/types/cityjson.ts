export type Vec3 = [number, number, number]
export type PolygonRings = number[][]

export type ViewerGeometryDisplayMode =
  | {
      kind: 'best'
    }
  | {
      kind: 'lod'
      lod: string
    }

export type ViewerPickingMode = 'none' | 'object' | 'face' | 'vertex'

export interface ViewerSemanticSurface {
  surfaceIndex: number
  type: string
  attributes: Record<string, unknown>
}

export interface ViewerValidationError {
  code: number
  description: string
  id: string
  info: string
  cityObjectId: string | null
  geometryIndex: number | null
  shellIndex: number | null
  faceIndex: number | null
  location: Vec3 | null
}

export type ViewerFocusTarget =
  | {
      kind: 'feature'
      featureId: string
    }
  | {
      kind: 'vertex'
      featureId: string
      objectId: string | null
      vertexIndex: number
    }
    | {
      kind: 'error'
      featureId: string
      objectId: string | null
      geometryIndex: number | null
      faceIndex: number | null
      location: Vec3 | null
      preserveCameraOffset?: boolean
    }
  | null

export interface ViewerDataset {
  sourceName: string
  center: Vec3
  extent: [number, number, number, number, number, number]
  features: ViewerFeature[]
  cityJsonVersion: string | null
  cityJsonKind: 'CityJSON' | 'CityJSONFeatures'
  transform: { scale: Vec3; translate: Vec3 } | null
  metadata: Record<string, unknown> | null
}

export interface ViewerFeature {
  id: string
  label: string
  rootObjectId: string
  type: string
  validity: boolean | null
  errors: ViewerValidationError[]
  attributes: Record<string, unknown>
  vertices: Vec3[]
  objects: ViewerCityObject[]
  extent: [number, number, number, number, number, number]
}

export interface ViewerObjectGeometry {
  index: number
  geometryType: string | null
  lod: string | null
  polygons: PolygonRings[]
  semanticSurfaces: Array<ViewerSemanticSurface | null>
  sourceFaceIndices: number[]
  vertexIndices: number[]
}

export interface ViewerCityObject {
  id: string
  type: string
  attributes: Record<string, unknown>
  geometries: ViewerObjectGeometry[]
  bestGeometryIndex: number | null
  hasRenderableChildren: boolean
  parentIds: string[]
  childIds: string[]
}
