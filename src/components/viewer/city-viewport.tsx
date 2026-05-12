import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

import type {
  PolygonRings,
  Vec3,
  ViewerAttributeColorState,
  ViewerCityObject,
  ViewerDataset,
  ViewerFeature,
  ViewerFocusTarget,
  ViewerGeometryDisplayMode,
  ViewerObjectGeometry,
  ViewerPickingMode,
  ViewerSemanticSurface,
  ViewerValidationError,
} from '@/types/cityjson'
import {
  getObjectGeometryByIndex,
  resolveObjectGeometry,
  resolveObjectGeometryIndex,
} from '@/lib/object-geometry'
import { errorColor } from '@/lib/error-palette'
import { semanticSurfaceColor } from '@/lib/semantic-surface-colors'
import { viewerObjectKey } from '@/lib/utils'

type Theme = 'light' | 'dark'

const VIEWPORT_FOG_DENSITY = {
  light: 0.000005,
  dark: 0.000005,
} as const

const PLANARITY_DISTANCE_TOLERANCE = 0.0001
const PLANARITY_RELATIVE_TOLERANCE = 1e-7
const NON_PLANAR_NORMAL_EXTRA_VERTEX_RATIO = 0.1
const NON_PLANAR_NORMAL_EXTRA_VERTEX_MIN_BUDGET = 10000
const NON_PLANAR_NORMAL_EXTRA_VERTEX_MAX_BUDGET = 500000
const BATCH_TARGET_OBJECT_COUNT = 500
const BATCH_MAX_OBJECT_COUNT = 900
const BATCH_MAX_VERTEX_COUNT = 60000
const BATCH_MAX_INDEX_COUNT = 120000
const EDIT_VERTEX_PICK_RADIUS_PIXELS = 14
const SELECTION_OUTLINE_THICKNESS_PIXELS = 4
const EMPTY_FACE_INDEX_SET = new Set<number>()

const SELECTION_EFFECT_COLORS: Record<Theme, { outline: string; overlay: string; overlayOpacity: number }> = {
  light: {
    outline: '#7ee7e7',
    overlay: '#7ee7e7',
    overlayOpacity: 0.24,
  },
  dark: {
    outline: '#7ee7e7',
    overlay: '#7ee7e7',
    overlayOpacity: 0.3,
  },
}

const OBJECT_TYPE_COLORS: Record<Theme, Record<string, string>> = {
  light: {
    bridge: '#7aa6b8',
    bridgeconstructiveelement: '#6f99aa',
    bridgefurniture: '#96a7af',
    bridgeinstallation: '#89b6c4',
    bridgepart: '#86adbc',
    bridgeroom: '#9db5bf',
    building: '#b8aa94',
    buildingconstructiveelement: '#a99b86',
    buildingfurniture: '#c1b195',
    buildinginstallation: '#c3aa83',
    buildingpart: '#c2b29a',
    buildingroom: '#d0c0a4',
    cityfurniture: '#d1a14b',
    cityobjectgroup: '#8d98a6',
    genericcityobject: '#9aa3ad',
    landuse: '#9cad72',
    otherconstruction: '#9b9390',
    plantcover: '#77a66a',
    railway: '#646d76',
    relieffeature: '#a99a7c',
    road: '#6d747c',
    solitaryvegetationobject: '#5f9862',
    square: '#8a8177',
    tinrelief: '#a58f6c',
    transportationobject: '#737b84',
    transportsquare: '#8a8177',
    tunnel: '#8b7b9d',
    tunnelconstructiveelement: '#7e6f91',
    tunnelfurniture: '#9a8aa8',
    tunnelhollowspace: '#9b8caf',
    tunnelinstallation: '#8f80a2',
    tunnelpart: '#9484a7',
    waterbody: '#4f93b5',
    waterway: '#4d89aa',
  },
  dark: {
    bridge: '#6f9aae',
    bridgeconstructiveelement: '#638c9f',
    bridgefurniture: '#879aa4',
    bridgeinstallation: '#78a8b9',
    bridgepart: '#7ea2b2',
    bridgeroom: '#8fa9b5',
    building: '#9d927f',
    buildingconstructiveelement: '#918675',
    buildingfurniture: '#ab9b82',
    buildinginstallation: '#a98f6d',
    buildingpart: '#aa9b85',
    buildingroom: '#b7a98f',
    cityfurniture: '#b88939',
    cityobjectgroup: '#7f8b99',
    genericcityobject: '#8b96a1',
    landuse: '#879863',
    otherconstruction: '#89817f',
    plantcover: '#67945e',
    railway: '#5c6670',
    relieffeature: '#938568',
    road: '#626b74',
    solitaryvegetationobject: '#528857',
    square: '#7a736b',
    tinrelief: '#907d5f',
    transportationobject: '#68717b',
    transportsquare: '#7a736b',
    tunnel: '#7d6f93',
    tunnelconstructiveelement: '#716485',
    tunnelfurniture: '#897b9c',
    tunnelhollowspace: '#8a7ca1',
    tunnelinstallation: '#817397',
    tunnelpart: '#857697',
    waterbody: '#477f9f',
    waterway: '#467895',
  },
}

const FALLBACK_OBJECT_TYPE_COLORS: Record<Theme, readonly string[]> = {
  light: ['#8b96a1', '#938c81', '#879672', '#7e97a3', '#998b9f'],
  dark: ['#7f8b97', '#827b72', '#788a67', '#728b98', '#887c93'],
}

type CityViewportProps = {
  data: ViewerDataset | null
  cameraFocalLength: number
  hideOccludedEditEdges: boolean
  isolateSelectedFeature: boolean
  geometryRevision: number
  viewportResetRevision: number
  focusRevision: number
  focusTarget: ViewerFocusTarget
  selectedFeatureIds: string[]
  selectedFeatureId: string | null
  activeObjectId: string | null
  geometryDisplayMode: ViewerGeometryDisplayMode
  activeGeometryIndex: number | null
  editMode: boolean
  selectedFaceIndex: number | null
  selectedFaceRingIndex: number
  selectedVertexIndex: number | null
  showSemanticSurfaces: boolean
  pickingMode: ViewerPickingMode
  showVertexGizmo: boolean
  attributeColor: ViewerAttributeColorState | null
  mobileInteraction: boolean
  mobileSelectionMode: 'object' | 'surface'
  onSelectFeature: (featureId: string, objectId?: string | null) => void
  onSelectFace: (faceIndex: number | null) => void
  onSelectVertex: (vertexIndex: number | null) => void
  onSelectSemanticSurface: (surface: {
    featureId: string
    objectId: string
    geometryIndex: number
    faceIndex: number
    surface: ViewerSemanticSurface | null
  } | null) => void
  onVertexCommit: (featureId: string, vertices: Vec3[]) => void
  onViewportCenterChange: (center: Vec3 | null) => void
  theme: Theme
}

type Runtime = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  arcball: ArcballControls
  transform: TransformControls
  rootGroup: THREE.Group
  cameraLightRig: THREE.Group
  handleGroup: THREE.Group
  edgeGroup: THREE.Group
  annotationGroup: THREE.Group
  selectionOutlineScene: THREE.Scene
  selectionOutlineGroup: THREE.Group
  selectionOutlineOccluderScene: THREE.Scene
  selectionOutlineOccluderGroup: THREE.Group
  selectionOutlineTargets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  selectionOutlineSeedQuad: FullScreenQuad
  selectionOutlineJfaQuad: FullScreenQuad
  selectionOverlayQuad: FullScreenQuad
  selectionOutlineEffectQuad: FullScreenQuad
  selectionOutlineSeedMaterial: SelectionOutlineSeedMaterial
  selectionOverlayMaterial: SelectionOverlayMaterial
  selectionOutlineDepthMaterial: THREE.MeshBasicMaterial
  selectionOutlineObjectKey: string[]
  selectionOutlineVisible: boolean
  raycaster: THREE.Raycaster
  pointer: THREE.Vector2
  meshesByObjectKey: Map<string, THREE.Mesh>
  meshesByFeatureId: Map<string, THREE.Mesh[]>
  batchedMeshes: THREE.BatchedMesh[]
  batchedObjectsByObjectKey: Map<string, BatchedObjectRecord>
  batchedObjectsByFeatureId: Map<string, BatchedObjectRecord[]>
  editPoints: THREE.Points | null
  selectedEditPoint: THREE.Points | null
  transformProxy: THREE.Object3D | null
  editBaseEdges: LineSegments2 | null
  editHighlightEdges: LineSegments2 | null
  editActiveRingEdges: LineSegments2 | null
  editVertexEdges: LineSegments2 | null
  editHighlightVertexEdges: LineSegments2 | null
  editActiveRingVertexEdges: LineSegments2 | null
  annotationVertexMarkers: THREE.Points[]
  featureDrafts: Map<string, Vec3[]>
  sceneScale: number
  editPivot: Vec3 | null
  theme: Theme
  showSemanticSurfaces: boolean
  attributeColor: ViewerAttributeColorState | null
  attributeColorSharedUniforms: AttributeColorSharedUniforms
  semanticSurfaceSharedUniforms: SemanticSurfaceSharedUniforms
  semanticSurfaceTypeIds: Map<string, number>
  shaderObjectIdsByObjectKey: Map<string, number>
  nextShaderObjectId: number
  preparedAttributeColorValuesByObjectKey: Record<string, number> | null
  ambientLight: THREE.AmbientLight
  hemisphereLight: THREE.HemisphereLight
  keyLight: THREE.DirectionalLight
  fillLight: THREE.DirectionalLight
  rimLight: THREE.DirectionalLight
}

type ObjectGeometryBlueprint = {
  positions: Float32Array
  normals: Float32Array
  polygonTriangleIndices: number[][]
}

type TriangleFaceIndices = ArrayLike<number>

type BatchedObjectRecord = {
  key: string
  featureId: string
  objectId: string
  objectType: string
  hasRenderableChildren: boolean
  geometryIndex: number
  featureCenter: Vec3
  baseColorLight: string
  baseColorDark: string
  triangleFaceIndices: TriangleFaceIndices
  blueprint: ObjectGeometryBlueprint
  batch: THREE.BatchedMesh
  instanceId: number
  geometryId: number
}

type BatchBuildItem = Omit<BatchedObjectRecord, 'batch' | 'instanceId' | 'geometryId'> & {
  geometry: THREE.BufferGeometry
  tileKey: string
  vertexCount: number
  indexCount: number
}

type AttributeColorUniforms = {
  value: { value: number }
  hasValue: { value: number }
  directColor: { value: THREE.Color }
}

type AttributeColorSharedUniforms = {
  enabled: { value: number }
  direct: { value: number }
  min: { value: number }
  max: { value: number }
  colors: { value: THREE.Color[] }
  missingColor: { value: THREE.Color }
  valueMap: { value: THREE.DataTexture }
  valueMapSize: { value: THREE.Vector2 }
}

type SemanticSurfaceSharedUniforms = {
  enabled: { value: number }
  colors: { value: THREE.Color[] }
}

type BatchColorMode = 'base' | 'semantic' | 'continuous-attribute'

const ATTRIBUTE_COLOR_STOP_COUNT = 10
const SEMANTIC_SURFACE_COLOR_SLOT_COUNT = 64
const ATTRIBUTE_COLOR_DOMAIN_PREVIEW_EVENT = 'cjloupe:attribute-color-domain-preview'

type ViewSelection = {
  selectedFeatureIds: string[]
  selectedFeatureId: string | null
  activeObjectId: string | null
  geometryDisplayMode: ViewerGeometryDisplayMode
  activeGeometryIndex: number | null
  editMode: boolean
  selectedFaceIndex: number | null
  selectedFaceRingIndex: number
  selectedVertexIndex: number | null
}

class SelectionOutlineSeedMaterial extends THREE.ShaderMaterial {
  set negative(value: boolean) {
    this.uniforms.negative.value = value ? -1 : 1
  }

  constructor() {
    super({
      uniforms: {
        negative: { value: 1 },
      },
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>

        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;

        uniform int negative;
        #include <logdepthbuf_pars_fragment>

        void main() {
          #include <logdepthbuf_fragment>
          gl_FragColor = vec4(gl_FragCoord.xy, 10000.0 * float(negative), 1.0);
        }
      `,
    })
  }
}

class SelectionOutlineJFAMaterial extends THREE.ShaderMaterial {
  set source(value: THREE.Texture | null) {
    this.uniforms.source.value = value
  }

  set step(value: number) {
    this.uniforms.step.value = value
  }

  constructor() {
    super({
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        source: { value: null },
        step: { value: 0 },
      },
      vertexShader: /* glsl */`
        out vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        precision highp int;

        uniform sampler2D source;
        uniform int step;

        out vec4 outColor;

        void main() {
          ivec2 size = textureSize(source, 0);
          ivec2 currCoord = ivec2(gl_FragCoord.xy);
          vec3 result = texelFetch(source, currCoord, 0).rgb;
          float resultSign = sign(result.z);
          ivec2 otherCoord;
          vec3 other;

          for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
              if (x == 0 && y == 0) {
                continue;
              }

              otherCoord = currCoord + ivec2(x, y) * step;
              if (
                otherCoord.x < size.x && otherCoord.x >= 0 &&
                otherCoord.y < size.y && otherCoord.y >= 0
              ) {
                other = texelFetch(source, otherCoord, 0).rgb;
                if (other.b != 0.0) {
                  if (resultSign != sign(other.z)) {
                    float dist = length(vec2(currCoord - otherCoord));
                    if (dist < abs(result.z)) {
                      result = vec3(vec2(otherCoord), dist * resultSign);
                    }
                  } else if (any(notEqual(ivec2(other.rg), otherCoord))) {
                    float dist = length(vec2(currCoord - ivec2(other.rg)));
                    if (dist < abs(result.z)) {
                      result = vec3(other.rg, dist * resultSign);
                    }
                  }
                }
              }
            }
          }

          outColor = vec4(result, 1.0);
        }
      `,
    })
  }
}

class SelectionOutlineEffectMaterial extends THREE.ShaderMaterial {
  set map(value: THREE.Texture | null) {
    this.uniforms.map.value = value
  }

  set thickness(value: number) {
    this.uniforms.thickness.value = value
  }

  get color() {
    return this.uniforms.color.value as THREE.Color
  }

  constructor() {
    super({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        map: { value: null },
        color: { value: new THREE.Color(SELECTION_EFFECT_COLORS.dark.outline) },
        thickness: { value: SELECTION_OUTLINE_THICKNESS_PIXELS },
      },
      vertexShader: /* glsl */`
        out vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        precision highp int;

        uniform sampler2D map;
        uniform vec3 color;
        uniform float thickness;

        out vec4 outColor;

        void main() {
          ivec2 currCoord = ivec2(gl_FragCoord.xy);
          vec3 seed = texelFetch(map, currCoord, 0).rgb;

          if (seed.b == 0.0) {
            discard;
          }

          float dist = seed.b;
          float width = 0.75;
          float alpha =
            smoothstep(thickness + width, thickness - width, dist) *
            smoothstep(-width - 1.0, width - 1.0, dist);

          if (alpha <= 0.0) {
            discard;
          }

          outColor = vec4(color, alpha);
        }
      `,
    })
  }
}

class SelectionOverlayMaterial extends THREE.ShaderMaterial {
  set map(value: THREE.Texture | null) {
    this.uniforms.map.value = value
  }

  get color() {
    return this.uniforms.color.value as THREE.Color
  }

  set overlayOpacity(value: number) {
    this.uniforms.opacity.value = value
  }

  constructor() {
    super({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        map: { value: null },
        color: { value: new THREE.Color(SELECTION_EFFECT_COLORS.dark.overlay) },
        opacity: { value: 0.18 },
      },
      vertexShader: /* glsl */`
        out vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        precision highp int;

        uniform sampler2D map;
        uniform vec3 color;
        uniform float opacity;
        in vec2 vUv;

        out vec4 outColor;

        void main() {
          ivec2 size = textureSize(map, 0);
          ivec2 currCoord = ivec2(vUv * vec2(size));
          vec3 seed = texelFetch(map, currCoord, 0).rgb;

          if (seed.b >= 0.0) {
            discard;
          }

          outColor = vec4(color, opacity);
        }
      `,
    })
  }
}

function createSelectionOutlineTarget() {
  return new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: true,
    stencilBuffer: false,
  })
}

function CityViewport({
  data,
  cameraFocalLength,
  hideOccludedEditEdges,
  isolateSelectedFeature,
  geometryRevision,
  viewportResetRevision,
  focusRevision,
  focusTarget,
  selectedFeatureIds,
  selectedFeatureId,
  activeObjectId,
  geometryDisplayMode,
  activeGeometryIndex,
  editMode,
  selectedFaceIndex,
  selectedFaceRingIndex,
  selectedVertexIndex,
  showSemanticSurfaces,
  pickingMode,
  showVertexGizmo,
  attributeColor,
  mobileInteraction,
  mobileSelectionMode,
  onSelectFeature,
  onSelectFace,
  onSelectVertex,
  onSelectSemanticSurface,
  onVertexCommit,
  onViewportCenterChange,
  theme,
}: CityViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<Runtime | null>(null)
  const fittedDatasetKeyRef = useRef<string | null>(null)
  const dataRef = useRef<ViewerDataset | null>(data)
  const initialCameraFocalLengthRef = useRef(cameraFocalLength)
  const hideOccludedEditEdgesRef = useRef(hideOccludedEditEdges)
  const isolateSelectedFeatureRef = useRef(isolateSelectedFeature)
  const selectionRef = useRef({
    selectedFeatureIds,
    selectedFeatureId,
    activeObjectId,
    geometryDisplayMode,
    activeGeometryIndex,
    editMode,
    selectedFaceIndex,
    selectedFaceRingIndex,
    selectedVertexIndex,
  })
  const previousSelectionRef = useRef({
    selectedFeatureIds,
    selectedFeatureId,
    activeObjectId,
    geometryDisplayMode,
    activeGeometryIndex,
    editMode,
    selectedFaceIndex,
    selectedFaceRingIndex,
    selectedVertexIndex,
  })
  const previousIsolateSelectedFeatureRef = useRef(isolateSelectedFeature)
  const previousGeometryDisplayModeRef = useRef(geometryDisplayMode)
  const previousActiveGeometryIndexRef = useRef(activeGeometryIndex)
  const onSelectFeatureRef = useRef(onSelectFeature)
  const onSelectFaceRef = useRef(onSelectFace)
  const onSelectVertexRef = useRef(onSelectVertex)
  const onSelectSemanticSurfaceRef = useRef(onSelectSemanticSurface)
  const onVertexCommitRef = useRef(onVertexCommit)
  const onViewportCenterChangeRef = useRef(onViewportCenterChange)
  const themeRef = useRef(theme)
  const showSemanticSurfacesRef = useRef(showSemanticSurfaces)
  const attributeColorRef = useRef(attributeColor)
  const pickingModeRef = useRef(pickingMode)
  const showVertexGizmoRef = useRef(showVertexGizmo)
  const mobileInteractionRef = useRef(mobileInteraction)
  const mobileSelectionModeRef = useRef(mobileSelectionMode)
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    hideOccludedEditEdgesRef.current = hideOccludedEditEdges
  }, [hideOccludedEditEdges])

  useEffect(() => {
    isolateSelectedFeatureRef.current = isolateSelectedFeature
  }, [isolateSelectedFeature])

  useEffect(() => {
    selectionRef.current = {
      selectedFeatureIds,
      selectedFeatureId,
      activeObjectId,
      geometryDisplayMode,
      activeGeometryIndex,
      editMode,
      selectedFaceIndex,
      selectedFaceRingIndex,
      selectedVertexIndex,
    }
  }, [selectedFeatureIds, selectedFeatureId, activeObjectId, geometryDisplayMode, activeGeometryIndex, editMode, selectedFaceIndex, selectedFaceRingIndex, selectedVertexIndex])

  useEffect(() => { onSelectFeatureRef.current = onSelectFeature }, [onSelectFeature])
  useEffect(() => { onSelectFaceRef.current = onSelectFace }, [onSelectFace])
  useEffect(() => { onSelectVertexRef.current = onSelectVertex }, [onSelectVertex])
  useEffect(() => { onSelectSemanticSurfaceRef.current = onSelectSemanticSurface }, [onSelectSemanticSurface])
  useEffect(() => { onVertexCommitRef.current = onVertexCommit }, [onVertexCommit])
  useEffect(() => { onViewportCenterChangeRef.current = onViewportCenterChange }, [onViewportCenterChange])
  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { showSemanticSurfacesRef.current = showSemanticSurfaces }, [showSemanticSurfaces])
  useEffect(() => { attributeColorRef.current = attributeColor }, [attributeColor])
  useEffect(() => { pickingModeRef.current = pickingMode }, [pickingMode])
  useEffect(() => { showVertexGizmoRef.current = showVertexGizmo }, [showVertexGizmo])
  useEffect(() => { mobileInteractionRef.current = mobileInteraction }, [mobileInteraction])
  useEffect(() => { mobileSelectionModeRef.current = mobileSelectionMode }, [mobileSelectionMode])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#061120', VIEWPORT_FOG_DENSITY.dark)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500000)
    camera.filmGauge = 35
    camera.setFocalLength(initialCameraFocalLengthRef.current)
    camera.up.set(0, 0, 1)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.autoClear = true
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.style.userSelect = 'none'
    renderer.domElement.style.webkitUserSelect = 'none'
    container.appendChild(renderer.domElement)

    const arcball = new ArcballControls(camera, renderer.domElement, scene)
    arcball.enableAnimations = false
    arcball.enableFocus = false
    arcball.enableGrid = false
    arcball.setGizmosVisible(false)
    arcball.rotateSpeed = 1.15
    arcball.scaleFactor = 1.04
    arcball.unsetMouseAction('WHEEL', 'SHIFT')
    arcball.unsetMouseAction(1, 'SHIFT')

    const transform = new TransformControls(camera, renderer.domElement)
    transform.setSpace('world')
    transform.setMode('translate')
    transform.enabled = false
    scene.add(transform.getHelper())

    const cameraLightRig = new THREE.Group()
    scene.add(cameraLightRig)

    const ambientLight = new THREE.AmbientLight('#f4f6f8', 0.8)
    scene.add(ambientLight)

    const hemisphereLight = new THREE.HemisphereLight('#ebf0f4', '#51606f', 0.5)
    hemisphereLight.position.set(0, 0, 1)
    scene.add(hemisphereLight)

    const keyLight = new THREE.DirectionalLight('#fff5ea', 1.35)
    keyLight.position.set(1.8, -1.4, 1.8)
    keyLight.target.position.set(0, 0, -5)
    cameraLightRig.add(keyLight)
    cameraLightRig.add(keyLight.target)

    const fillLight = new THREE.DirectionalLight('#d7e4ee', 0.38)
    fillLight.position.set(-1.6, 1.2, 0.9)
    fillLight.target.position.set(0, 0, -5)
    cameraLightRig.add(fillLight)
    cameraLightRig.add(fillLight.target)

    const rimLight = new THREE.DirectionalLight('#f8fbff', 0.52)
    rimLight.position.set(-0.7, -2.3, 2.4)
    rimLight.target.position.set(0, 0, -4)
    cameraLightRig.add(rimLight)
    cameraLightRig.add(rimLight.target)

    const rootGroup = new THREE.Group()
    scene.add(rootGroup)

    const handleGroup = new THREE.Group()
    scene.add(handleGroup)

    const edgeGroup = new THREE.Group()
    scene.add(edgeGroup)

    const annotationGroup = new THREE.Group()
    scene.add(annotationGroup)

    const selectionOutlineScene = new THREE.Scene()
    const selectionOutlineGroup = new THREE.Group()
    selectionOutlineScene.add(selectionOutlineGroup)
    const selectionOutlineOccluderScene = new THREE.Scene()
    const selectionOutlineOccluderGroup = new THREE.Group()
    selectionOutlineOccluderScene.add(selectionOutlineOccluderGroup)
    const selectionOutlineSeedMaterial = new SelectionOutlineSeedMaterial()
    selectionOutlineSeedMaterial.side = THREE.DoubleSide
    const selectionOverlayMaterial = new SelectionOverlayMaterial()
    selectionOverlayMaterial.side = THREE.DoubleSide
    const selectionOutlineDepthMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    selectionOutlineDepthMaterial.colorWrite = false
    selectionOutlineDepthMaterial.depthWrite = true
    selectionOutlineDepthMaterial.depthTest = true
    const selectionOutlineTargets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] = [
      createSelectionOutlineTarget(),
      createSelectionOutlineTarget(),
    ]
    const selectionOutlineSeedQuad = new FullScreenQuad(selectionOutlineSeedMaterial)
    const selectionOutlineJfaQuad = new FullScreenQuad(new SelectionOutlineJFAMaterial())
    const selectionOverlayQuad = new FullScreenQuad(selectionOverlayMaterial)
    const selectionOutlineEffectQuad = new FullScreenQuad(new SelectionOutlineEffectMaterial())

    const runtime: Runtime = {
      renderer,
      scene,
      camera,
      arcball,
      transform,
      rootGroup,
      cameraLightRig,
      handleGroup,
      edgeGroup,
      annotationGroup,
      selectionOutlineScene,
      selectionOutlineGroup,
      selectionOutlineOccluderScene,
      selectionOutlineOccluderGroup,
      selectionOutlineTargets,
      selectionOutlineSeedQuad,
      selectionOutlineJfaQuad,
      selectionOverlayQuad,
      selectionOutlineEffectQuad,
      selectionOutlineSeedMaterial,
      selectionOverlayMaterial,
      selectionOutlineDepthMaterial,
      selectionOutlineObjectKey: [],
      selectionOutlineVisible: true,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      meshesByObjectKey: new Map(),
      meshesByFeatureId: new Map(),
      batchedMeshes: [],
      batchedObjectsByObjectKey: new Map(),
      batchedObjectsByFeatureId: new Map(),
      editPoints: null,
      selectedEditPoint: null,
      transformProxy: null,
      editBaseEdges: null,
      editHighlightEdges: null,
      editActiveRingEdges: null,
      editVertexEdges: null,
      editHighlightVertexEdges: null,
      editActiveRingVertexEdges: null,
      annotationVertexMarkers: [],
      featureDrafts: new Map(),
      sceneScale: 1,
      editPivot: null,
      theme: themeRef.current,
      showSemanticSurfaces: showSemanticSurfacesRef.current,
      attributeColor: attributeColorRef.current,
      attributeColorSharedUniforms: createAttributeColorSharedUniforms(),
      semanticSurfaceSharedUniforms: createSemanticSurfaceSharedUniforms(),
      semanticSurfaceTypeIds: new Map(),
      shaderObjectIdsByObjectKey: new Map(),
      nextShaderObjectId: 1,
      preparedAttributeColorValuesByObjectKey: null,
      ambientLight,
      hemisphereLight,
      keyLight,
      fillLight,
      rimLight,
    }
    runtime.raycaster.params.Points.threshold = 1
    applyViewportTheme(runtime, themeRef.current)

    runtimeRef.current = runtime
    let pendingRenderFrame: number | null = null

    const renderNow = () => {
      const activeRuntime = runtimeRef.current
      if (!activeRuntime) {
        return
      }

      renderViewport(activeRuntime)
      reportViewportCenter(activeRuntime, dataRef.current, onViewportCenterChangeRef.current)
    }

    const requestRender = () => {
      if (pendingRenderFrame != null) {
        return
      }

      pendingRenderFrame = window.requestAnimationFrame(() => {
        pendingRenderFrame = null
        renderNow()
      })
    }

    const handleResize = () => {
      const target = containerRef.current
      const activeRuntime = runtimeRef.current
      if (!target || !activeRuntime) {
        return
      }

      const width = Math.max(target.clientWidth, 1)
      const height = Math.max(target.clientHeight, 1)

      activeRuntime.camera.aspect = width / height
      activeRuntime.camera.updateProjectionMatrix()
      activeRuntime.renderer.setSize(width, height)
      updateEditWireframeResolution(activeRuntime)
      syncArcballState(activeRuntime)
      requestRender()
    }

    const handlePointerDown = (event: PointerEvent) => {
      pointerDownRef.current = {
        x: event.clientX,
        y: event.clientY,
      }
    }

    const preventCanvasGesture = (event: Event) => {
      event.preventDefault()
    }

    const preventMultiTouchBrowserGesture = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    }

    const handleClick = (event: MouseEvent) => {
      const activeRuntime = runtimeRef.current
      const currentData = dataRef.current
      if (!activeRuntime || !currentData) {
        return
      }

      const pointerDown = pointerDownRef.current
      pointerDownRef.current = null
      if (
        pointerDown &&
        Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 4
      ) {
        return
      }

      updateRaycastPointer(activeRuntime, event)

      const selection = selectionRef.current
      const usesMobileTapSelection = mobileInteractionRef.current
      const mobileSurfaceSelection =
        usesMobileTapSelection &&
        showSemanticSurfacesRef.current &&
        mobileSelectionModeRef.current === 'surface'

      if (!usesMobileTapSelection) {
        const pickingMode = pickingModeRef.current

        if (selection.editMode && pickingMode === 'vertex') {
          const nearestVertexIndex = findNearestEditVertexIndexOnScreen(
            activeRuntime,
            currentData,
            selection,
            event,
            hideOccludedEditEdgesRef.current,
          )
          if (nearestVertexIndex != null) {
            onSelectVertexRef.current(nearestVertexIndex)
          }
          return
        }

        if (selection.editMode) {
          if (pickingMode !== 'face') {
            return
          }

          const activeObjectKey =
            selection.selectedFeatureId && selection.activeObjectId
              ? viewerObjectKey(selection.selectedFeatureId, selection.activeObjectId)
              : null
          if (!activeObjectKey) {
            return
          }

          const meshHits = activeRuntime.raycaster.intersectObjects(getPickableObjects(activeRuntime), false)
          const activeHit = meshHits.find((hit) => resolveObjectHit(hit)?.key === activeObjectKey)
          const resolvedHit = activeHit ? resolveObjectHit(activeHit) : null
          const faceIndex = resolvedHit?.faceIndex ?? null

          onSelectFaceRef.current(faceIndex)
          return
        }

        if (pickingMode === 'face') {
          const meshHits = activeRuntime.raycaster.intersectObjects(
            getPickableObjects(activeRuntime),
            false,
          )
          const meshHit = meshHits[0]
          const resolvedHit = meshHit ? resolveObjectHit(meshHit) : null
          if (!resolvedHit) {
            onSelectSemanticSurfaceRef.current(null)
            onSelectFaceRef.current(null)
            return
          }

          const { featureId, objectId, geometryIndex, faceIndex } = resolvedHit

          const feature = currentData.features.find((candidate) => candidate.id === featureId) ?? null
          const object = feature?.objects.find((candidate) => candidate.id === objectId) ?? null
          const geometry = getObjectGeometryByIndex(object, geometryIndex ?? null)
          const surface = faceIndex != null ? geometry?.semanticSurfaces[faceIndex] ?? null : null

          onSelectSemanticSurfaceRef.current(
            faceIndex != null && geometryIndex != null
              ? {
                  featureId,
                  objectId,
                  geometryIndex,
                  faceIndex,
                  surface,
                }
              : null,
          )
          return
        }

        if (pickingMode !== 'object') {
          return
        }
      }

      if (mobileSurfaceSelection) {
        const meshHits = activeRuntime.raycaster.intersectObjects(
          getPickableObjects(activeRuntime),
          false,
        )
        const meshHit = meshHits[0]
        const resolvedHit = meshHit ? resolveObjectHit(meshHit) : null
        if (!resolvedHit) {
          onSelectSemanticSurfaceRef.current(null)
          return
        }

        const { featureId, objectId, geometryIndex, faceIndex } = resolvedHit

        const feature = currentData.features.find((candidate) => candidate.id === featureId) ?? null
        const object = feature?.objects.find((candidate) => candidate.id === objectId) ?? null
        const geometry = getObjectGeometryByIndex(object, geometryIndex ?? null)
        const surface = faceIndex != null ? geometry?.semanticSurfaces[faceIndex] ?? null : null

        onSelectSemanticSurfaceRef.current(
          faceIndex != null && geometryIndex != null
            ? {
                featureId,
                objectId,
                geometryIndex,
                faceIndex,
                surface,
              }
            : null,
        )
        return
      }

      const meshHits = activeRuntime.raycaster.intersectObjects(
        getPickableObjects(activeRuntime),
        false,
      )
      const meshHit = meshHits[0]
      const resolvedHit = meshHit ? resolveObjectHit(meshHit) : null
      if (resolvedHit) {
        const { featureId, objectId } = resolvedHit
        onSelectSemanticSurfaceRef.current(null)
        onSelectFeatureRef.current(featureId, objectId)
        return
      }

      if (usesMobileTapSelection) {
        onSelectSemanticSurfaceRef.current(null)
      }
      onSelectVertexRef.current(null)
    }

    const handleDoubleClick = (event: MouseEvent) => {
      const activeRuntime = runtimeRef.current
      if (!activeRuntime) {
        return
      }

      updateRaycastPointer(activeRuntime, event)
      const meshHits = activeRuntime.raycaster.intersectObjects(
        getPickableObjects(activeRuntime),
        false,
      )
      const meshHit = meshHits[0]
      if (!meshHit) {
        return
      }

      const center = getArcballCenter(activeRuntime.arcball).clone()
      const delta = new THREE.Vector3().subVectors(meshHit.point, center)
      const nextPosition = activeRuntime.camera.position.clone().add(delta)
      setArcballPose(activeRuntime, meshHit.point, nextPosition)
      requestRender()
    }

    arcball.addEventListener('change', requestRender)

    transform.addEventListener('dragging-changed', (event) => {
      const isDragging = Boolean(event.value)
      arcball.enabled = !isDragging

      if (!isDragging) {
        const featureId = selectionRef.current.selectedFeatureId
        if (!featureId) {
          return
        }

        const committedVertices = runtime.featureDrafts.get(featureId)?.map((vertex) => [...vertex] as Vec3)
        if (committedVertices) {
          onVertexCommitRef.current(featureId, committedVertices)
        }
      }
    })

    transform.addEventListener('objectChange', () => {
      const activeRuntime = runtimeRef.current
      const currentData = dataRef.current
      const featureId = selectionRef.current.selectedFeatureId
      const vertexIndex = selectionRef.current.selectedVertexIndex
      if (!activeRuntime || !currentData || !featureId || vertexIndex == null) {
        return
      }

      const handle = activeRuntime.transformProxy
      const draftVertices = activeRuntime.featureDrafts.get(featureId)
      if (!handle || !draftVertices) {
        return
      }

      const pivot = activeRuntime.editPivot ?? currentData.center
      draftVertices[vertexIndex] = [
        handle.position.x + pivot[0],
        handle.position.y + pivot[1],
        handle.position.z + pivot[2],
      ]
      rebuildFeatureGeometry(activeRuntime, currentData, featureId, selectionRef.current, vertexIndex)
      rebuildEditWireframe(
        activeRuntime,
        currentData,
        selectionRef.current,
        hideOccludedEditEdgesRef.current,
      )
      syncEditPointGeometry(activeRuntime, currentData, selectionRef.current)
      requestRender()
    })

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    window.addEventListener('resize', handleResize)
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('click', handleClick)
    renderer.domElement.addEventListener('dblclick', handleDoubleClick)
    renderer.domElement.addEventListener('touchmove', preventMultiTouchBrowserGesture, { passive: false })
    renderer.domElement.addEventListener('gesturestart', preventCanvasGesture, { passive: false })
    renderer.domElement.addEventListener('gesturechange', preventCanvasGesture, { passive: false })
    handleResize()

    return () => {
      if (pendingRenderFrame != null) {
        window.cancelAnimationFrame(pendingRenderFrame)
      }
      arcball.removeEventListener('change', requestRender)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick)
      renderer.domElement.removeEventListener('touchmove', preventMultiTouchBrowserGesture)
      renderer.domElement.removeEventListener('gesturestart', preventCanvasGesture)
      renderer.domElement.removeEventListener('gesturechange', preventCanvasGesture)
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      disposeSceneContents(runtime)
      disposeSelectionOutlineResources(runtime)
      runtime.attributeColorSharedUniforms.valueMap.value.dispose()
      transform.dispose()
      arcball.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || !data) {
      return
    }

    rebuildScene(runtime, data, selectionRef.current)
    const datasetKey = getDatasetViewKey(data)
    if (fittedDatasetKeyRef.current !== datasetKey) {
      fitCameraToDataset(runtime, data)
      fittedDatasetKeyRef.current = datasetKey
    }
    rebuildAnnotations(runtime)
    syncSelection(
      runtime,
      data,
      selectionRef.current,
      hideOccludedEditEdgesRef.current,
      isolateSelectedFeatureRef.current,
      showVertexGizmoRef.current,
    )
    previousSelectionRef.current = selectionRef.current
    previousIsolateSelectedFeatureRef.current = isolateSelectedFeatureRef.current
    renderViewport(runtime)
    reportViewportCenter(runtime, data, onViewportCenterChangeRef.current)
  }, [data])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime || !currentData) {
      return
    }

    const displayModeChanged =
      previousGeometryDisplayModeRef.current.kind !== geometryDisplayMode.kind ||
      (geometryDisplayMode.kind === 'lod' &&
        previousGeometryDisplayModeRef.current.kind === 'lod' &&
        previousGeometryDisplayModeRef.current.lod !== geometryDisplayMode.lod)
    const activeGeometryChanged =
      previousActiveGeometryIndexRef.current !== activeGeometryIndex
    previousGeometryDisplayModeRef.current = geometryDisplayMode
    previousActiveGeometryIndexRef.current = activeGeometryIndex

    if (displayModeChanged || activeGeometryChanged) {
      rebuildScene(runtime, currentData, selectionRef.current)
      rebuildAnnotations(runtime)
      syncSelection(
        runtime,
        currentData,
        selectionRef.current,
        hideOccludedEditEdgesRef.current,
        isolateSelectedFeatureRef.current,
        showVertexGizmoRef.current,
      )
    } else {
      const selection = selectionRef.current
      if (selection.selectedFeatureId) {
        const feature = currentData.features.find((candidate) => candidate.id === selection.selectedFeatureId)
        if (feature) {
          runtime.featureDrafts.set(
            feature.id,
            feature.vertices.map((vertex) => [...vertex] as Vec3),
          )
          rebuildFeatureGeometry(runtime, currentData, feature.id, selection)
        }
      }
      syncSelectionDelta(
        runtime,
        currentData,
        selection,
        selection,
        hideOccludedEditEdgesRef.current,
        isolateSelectedFeatureRef.current,
        isolateSelectedFeatureRef.current,
        showVertexGizmoRef.current,
      )
    }

    previousSelectionRef.current = selectionRef.current
    previousIsolateSelectedFeatureRef.current = isolateSelectedFeatureRef.current
    renderViewport(runtime)
    reportViewportCenter(runtime, currentData, onViewportCenterChangeRef.current)
  }, [geometryRevision, geometryDisplayMode, activeGeometryIndex])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime || !currentData) {
      return
    }

    const selection = selectionRef.current
    const previousSelection = previousSelectionRef.current
    const previousIsolateSelectedFeature = previousIsolateSelectedFeatureRef.current

    if (runtime.showSemanticSurfaces && !editMode) {
      updateSelectionSurfacePresentation(runtime, currentData, previousSelection, selection)
    }

    syncSelectionDelta(
      runtime,
      currentData,
      previousSelection,
      selection,
      hideOccludedEditEdgesRef.current,
      previousIsolateSelectedFeature,
      isolateSelectedFeatureRef.current,
      showVertexGizmoRef.current,
    )
    renderViewport(runtime)
    reportViewportCenter(runtime, currentData, onViewportCenterChangeRef.current)
    previousSelectionRef.current = selection
    previousIsolateSelectedFeatureRef.current = isolateSelectedFeatureRef.current
  }, [selectedFeatureIds, selectedFeatureId, activeObjectId, editMode, selectedFaceIndex, selectedFaceRingIndex, selectedVertexIndex, hideOccludedEditEdges, isolateSelectedFeature, showVertexGizmo])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime || !currentData || !focusTarget) {
      return
    }

    if (focusTarget.kind === 'error') {
      centerViewOnValidationError(runtime, currentData, focusTarget, selectionRef.current)
    } else if (focusTarget.kind === 'vertex') {
      centerViewOnVertex(runtime, currentData, focusTarget)
    } else {
      const feature = currentData.features.find((candidate) => candidate.id === focusTarget.featureId)
      if (!feature) {
        return
      }

      centerViewOnFeature(runtime, currentData, feature)
    }

    renderViewport(runtime)
    reportViewportCenter(runtime, currentData, onViewportCenterChangeRef.current)
  }, [focusRevision, focusTarget])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) {
      return
    }

    runtime.theme = theme
    applyViewportTheme(runtime, theme)

    const currentData = dataRef.current
    if (currentData) {
      syncSelection(
        runtime,
        currentData,
        selectionRef.current,
        hideOccludedEditEdgesRef.current,
        isolateSelectedFeatureRef.current,
        showVertexGizmoRef.current,
      )
    }
    renderViewport(runtime)
    reportViewportCenter(runtime, currentData, onViewportCenterChangeRef.current)
  }, [theme])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime) {
      return
    }

    runtime.showSemanticSurfaces = showSemanticSurfaces
    runtime.attributeColor = attributeColorRef.current
    syncAttributeColorSharedUniforms(runtime.attributeColorSharedUniforms, runtime.attributeColor)

    if (currentData) {
      const selection = selectionRef.current
      const needsRebuild = shouldRebuildForSemanticModeToggle(runtime, currentData, selection, showSemanticSurfaces)
      if (needsRebuild) {
        rebuildScene(runtime, currentData, selection)
        rebuildAnnotations(runtime)
      } else {
        syncSemanticSurfaceSharedUniforms(runtime, currentData)
        syncBatchMaterials(runtime)
      }
      syncSelection(
        runtime,
        currentData,
        selection,
        hideOccludedEditEdgesRef.current,
        isolateSelectedFeatureRef.current,
        showVertexGizmoRef.current,
      )
    }

    renderViewport(runtime)
    reportViewportCenter(runtime, currentData, onViewportCenterChangeRef.current)
  }, [showSemanticSurfaces])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime) {
      return
    }

    const previousAttributeColor = runtime.attributeColor
    const previousValuesByObjectKey = runtime.attributeColor?.valuesByObjectKey ?? null
    runtime.attributeColor = attributeColor
    syncAttributeColorSharedUniforms(runtime.attributeColorSharedUniforms, attributeColor)
    syncBatchMaterials(runtime)
    if (
      attributeColor?.mode === 'continuous' &&
      (
        previousAttributeColor?.mode !== 'continuous' ||
        previousValuesByObjectKey !== attributeColor.valuesByObjectKey
      )
    ) {
      syncBatchedAttributeValueTexture(runtime, attributeColor)
    }
    if (
      attributeColor &&
      (
        runtime.preparedAttributeColorValuesByObjectKey !== attributeColor.valuesByObjectKey ||
        previousValuesByObjectKey == null
      )
    ) {
      applyAttributeColorToScene(runtime)
      runtime.preparedAttributeColorValuesByObjectKey = attributeColor.valuesByObjectKey
    }
    if (currentData) {
      applyBatchSelectionAppearance(
        runtime,
        selectionRef.current,
        isolateSelectedFeatureRef.current,
        runtime.batchedObjectsByObjectKey.values(),
      )
    }
    renderViewport(runtime)
    reportViewportCenter(runtime, currentData, onViewportCenterChangeRef.current)
  }, [attributeColor])

  useEffect(() => {
    let pendingFrame: number | null = null
    let pendingDomain: { min: number; max: number } | null = null

    const flushPreview = () => {
      pendingFrame = null
      const runtime = runtimeRef.current
      if (!runtime?.attributeColor || runtime.attributeColor.mode !== 'continuous' || !pendingDomain) {
        return
      }

      runtime.attributeColorSharedUniforms.min.value = pendingDomain.min
      runtime.attributeColorSharedUniforms.max.value = pendingDomain.max
      renderViewport(runtime)
    }

    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<{ min: number; max: number }>).detail
      if (!detail || !Number.isFinite(detail.min) || !Number.isFinite(detail.max)) {
        return
      }

      pendingDomain = detail
      if (pendingFrame == null) {
        pendingFrame = window.requestAnimationFrame(flushPreview)
      }
    }

    window.addEventListener(ATTRIBUTE_COLOR_DOMAIN_PREVIEW_EVENT, handlePreview)
    return () => {
      window.removeEventListener(ATTRIBUTE_COLOR_DOMAIN_PREVIEW_EVENT, handlePreview)
      if (pendingFrame != null) {
        window.cancelAnimationFrame(pendingFrame)
      }
    }
  }, [])

  useEffect(() => {
    const runtime = runtimeRef.current
    const currentData = dataRef.current
    if (!runtime || !currentData) {
      return
    }

    fitCameraToDataset(runtime, currentData)
    fittedDatasetKeyRef.current = getDatasetViewKey(currentData)
    renderViewport(runtime)
    reportViewportCenter(runtime, currentData, onViewportCenterChangeRef.current)
  }, [viewportResetRevision])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) {
      return
    }

    const center = getArcballCenter(runtime.arcball).clone()
    const distanceVector = new THREE.Vector3().subVectors(runtime.camera.position, center)
    const currentDistance = distanceVector.length()
    const currentFovRadians = THREE.MathUtils.degToRad(runtime.camera.fov)

    runtime.camera.setFocalLength(cameraFocalLength)
    runtime.camera.updateProjectionMatrix()

    if (currentDistance > 0) {
      const nextFovRadians = THREE.MathUtils.degToRad(runtime.camera.fov)
      const nextDistance =
        currentDistance * (Math.tan(currentFovRadians / 2) / Math.tan(nextFovRadians / 2))
      const nextPosition = center.clone().add(distanceVector.normalize().multiplyScalar(nextDistance))
      setArcballPose(runtime, center, nextPosition)
    } else {
      syncArcballState(runtime, center)
    }
    renderViewport(runtime)
    reportViewportCenter(runtime, dataRef.current, onViewportCenterChangeRef.current)
  }, [cameraFocalLength])

  return <div ref={containerRef} className="absolute inset-0 touch-none select-none" />
}

function resolveDisplayedObjectGeometry(
  feature: ViewerFeature,
  object: ViewerCityObject,
  selection: ViewSelection,
) {
  const activeGeometryOverride =
    selection.selectedFeatureId === feature.id && selection.activeObjectId === object.id
      ? selection.activeGeometryIndex
      : null

  return resolveObjectGeometry(object, selection.geometryDisplayMode, activeGeometryOverride)
}

function rebuildScene(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
) {
  disposeSceneContents(runtime)
  runtime.shaderObjectIdsByObjectKey.clear()
  runtime.nextShaderObjectId = 1
  syncSemanticSurfaceSharedUniforms(runtime, data)
  runtime.featureDrafts = new Map(
    data.features.map((feature) => [feature.id, feature.vertices.map((vertex) => [...vertex] as Vec3)]),
  )

  const sizeX = data.extent[3] - data.extent[0]
  const sizeY = data.extent[4] - data.extent[1]
  const sizeZ = data.extent[5] - data.extent[2]
  runtime.sceneScale = Math.max(sizeX, sizeY, sizeZ)
  const batchItems: BatchBuildItem[] = []

  for (const feature of data.features) {
    const draftVertices = runtime.featureDrafts.get(feature.id)
    if (!draftVertices) {
      continue
    }

    // Center each feature's mesh geometry around the feature's own center
    // to keep float32 vertex buffer values small and avoid GPU precision jitter.
    const featureCenter: Vec3 = [
      (feature.extent[0] + feature.extent[3]) * 0.5,
      (feature.extent[1] + feature.extent[4]) * 0.5,
      (feature.extent[2] + feature.extent[5]) * 0.5,
    ]

    for (const object of feature.objects) {
      const objectGeometry = resolveDisplayedObjectGeometry(feature, object, selection)
      if (!objectGeometry) {
        continue
      }

      const nextObjectKey = viewerObjectKey(feature.id, object.id)

      if (canBatchObject(runtime, feature, object, objectGeometry)) {
        const blueprint = buildObjectGeometryBlueprint(
          objectGeometry.polygons,
          draftVertices,
          featureCenter,
          collectObjectErrorFaceIndices(
            feature.errors,
            object.id,
            objectGeometry.index,
            objectGeometry.sourceFaceIndices,
          ),
        )
        const geometry = buildUngroupedObjectGeometry(blueprint)
        applyBatchGeometryAttributes(
          geometry,
          blueprint,
          runtime,
          objectGeometry,
          nextObjectKey,
        )
        geometry.computeBoundingBox()
        batchItems.push({
          key: nextObjectKey,
          featureId: feature.id,
          objectId: object.id,
          objectType: object.type,
          hasRenderableChildren: object.hasRenderableChildren,
          geometryIndex: objectGeometry.index,
          featureCenter,
          baseColorLight: baseColorForType(object.type, 'light'),
          baseColorDark: baseColorForType(object.type, 'dark'),
          triangleFaceIndices: geometry.userData.triangleFaceIndices,
          blueprint,
          geometry,
          tileKey: getBatchTileKey(featureCenter, data),
          vertexCount: geometry.getAttribute('position')?.count ?? 0,
          indexCount: geometry.getIndex()?.count ?? 0,
        })
      } else {
        addStandaloneObjectMesh(
          runtime,
          data,
          feature,
          object,
          objectGeometry,
          draftVertices,
          featureCenter,
          nextObjectKey,
        )
      }
    }
  }

  buildSpatialBatches(runtime, data, batchItems, selection)
  syncBatchedAttributeValueTexture(runtime, runtime.attributeColor)
}

function canBatchObject(
  runtime: Runtime,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
) {
  if (runtime.showSemanticSurfaces) {
    return true
  }

  if (runtime.attributeColor) {
    return true
  }

  const { faceGroups } = computeFaceErrorGroups(
    feature.errors,
    object.id,
    objectGeometry.index,
    objectGeometry.sourceFaceIndices,
  )
  return faceGroups.size === 0
}

function shouldRebuildForSemanticModeToggle(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
  nextShowSemanticSurfaces: boolean,
) {
  if (nextShowSemanticSurfaces) {
    return runtime.meshesByObjectKey.size > 0
  }

  for (const feature of data.features) {
    for (const object of feature.objects) {
      const objectGeometry = resolveDisplayedObjectGeometry(feature, object, selection)
      if (!objectGeometry) {
        continue
      }

      const { faceGroups } = computeFaceErrorGroups(
        feature.errors,
        object.id,
        objectGeometry.index,
        objectGeometry.sourceFaceIndices,
      )
      if (faceGroups.size > 0) {
        return true
      }
    }
  }

  return false
}

function applyBatchGeometryAttributes(
  geometry: THREE.BufferGeometry,
  blueprint: ObjectGeometryBlueprint,
  runtime: Runtime,
  objectGeometry: ViewerObjectGeometry,
  objectKey: string,
) {
  const vertexCount = geometry.getAttribute('position')?.count ?? 0
  const colors = new Float32Array(vertexCount * 3)
  colors.fill(1)

  const shaderObjectId = getShaderObjectId(runtime, objectKey)
  const shaderObjectIds = new Float32Array(vertexCount)
  shaderObjectIds.fill(shaderObjectId)

  const semanticSurfaceTypeIds = new Float32Array(vertexCount)
  fillSemanticSurfaceAttributes(
    semanticSurfaceTypeIds,
    blueprint,
    objectGeometry.semanticSurfaces,
    runtime.semanticSurfaceTypeIds,
  )

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('shaderObjectId', new THREE.BufferAttribute(shaderObjectIds, 1))
  geometry.setAttribute('semanticSurfaceTypeId', new THREE.BufferAttribute(semanticSurfaceTypeIds, 1))
}

function fillSemanticSurfaceAttributes(
  semanticSurfaceTypeIds: Float32Array,
  blueprint: ObjectGeometryBlueprint,
  semanticSurfaces: Array<ViewerSemanticSurface | null>,
  semanticSurfaceTypeIdsByKey: Map<string, number>,
) {
  blueprint.polygonTriangleIndices.forEach((polygonIndices, faceIndex) => {
    const surface = semanticSurfaces[faceIndex]
    const surfaceTypeId = surface
      ? semanticSurfaceTypeIdsByKey.get(semanticSurfaceTypeKey(surface.type)) ?? 0
      : 0

    for (const vertexIndex of polygonIndices) {
      semanticSurfaceTypeIds[vertexIndex] = surfaceTypeId
    }
  })
}

function resolveInitialBatchedObjectColor(runtime: Runtime, item: BatchBuildItem) {
  if (runtime.showSemanticSurfaces) {
    return '#ffffff'
  }

  const attributeColor = runtime.attributeColor
  if (attributeColor?.mode === 'direct') {
    return attributeColor.directColorsByObjectKey?.[item.key] ?? attributeColor.missingColor
  }

  if (attributeColor?.mode === 'continuous') {
    return '#ffffff'
  }

  return runtime.theme === 'light' ? item.baseColorLight : item.baseColorDark
}

function addStandaloneObjectMesh(
  runtime: Runtime,
  data: ViewerDataset,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
  draftVertices: Vec3[],
  featureCenter: Vec3,
  objectKey: string,
) {
  const { blueprint, geometry, material } = buildObjectMeshPresentation(
    runtime,
    feature,
    object,
    objectGeometry,
    draftVertices,
    featureCenter,
  )
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(
    featureCenter[0] - data.center[0],
    featureCenter[1] - data.center[1],
    featureCenter[2] - data.center[2],
  )
  mesh.userData = {
    featureId: feature.id,
    objectId: object.id,
    objectType: object.type,
    hasRenderableChildren: object.hasRenderableChildren,
    geometryIndex: objectGeometry.index,
    featureCenter,
    baseColorLight: baseColorForType(object.type, 'light'),
    baseColorDark: baseColorForType(object.type, 'dark'),
    triangleFaceIndices: geometry.userData.triangleFaceIndices,
    geometryBlueprint: blueprint,
  }
  runtime.meshesByObjectKey.set(objectKey, mesh)
  const featureMeshes = runtime.meshesByFeatureId.get(feature.id)
  if (featureMeshes) {
    featureMeshes.push(mesh)
  } else {
    runtime.meshesByFeatureId.set(feature.id, [mesh])
  }
  runtime.rootGroup.add(mesh)
}

function getBatchTileKey(center: Vec3, data: ViewerDataset) {
  const gridDimension = Math.max(1, Math.ceil(Math.sqrt(data.features.length / BATCH_TARGET_OBJECT_COUNT)))
  const spanX = Math.max(data.extent[3] - data.extent[0], 0.000001)
  const spanY = Math.max(data.extent[4] - data.extent[1], 0.000001)
  const x = Math.min(
    gridDimension - 1,
    Math.max(0, Math.floor(((center[0] - data.extent[0]) / spanX) * gridDimension)),
  )
  const y = Math.min(
    gridDimension - 1,
    Math.max(0, Math.floor(((center[1] - data.extent[1]) / spanY) * gridDimension)),
  )
  return `${x}:${y}`
}

function buildSpatialBatches(
  runtime: Runtime,
  data: ViewerDataset,
  items: BatchBuildItem[],
  selection: ViewSelection,
) {
  if (items.length === 0) {
    return
  }

  const chunks = chunkBatchItems(items)
  const identity = new THREE.Matrix4()
  const translation = new THREE.Matrix4()
  const color = new THREE.Color()

  for (const chunk of chunks) {
    const maxInstanceCount = chunk.length
    const maxVertexCount = chunk.reduce((sum, item) => sum + item.vertexCount, 0)
    const maxIndexCount = chunk.reduce((sum, item) => sum + item.indexCount, 0)
    if (maxInstanceCount === 0 || maxVertexCount === 0 || maxIndexCount === 0) {
      for (const item of chunk) {
        item.geometry.dispose()
      }
      continue
    }

    const batch = new THREE.BatchedMesh(
      maxInstanceCount,
      maxVertexCount,
      maxIndexCount,
      createBatchMaterial(
        getBatchColorMode(runtime),
        runtime.attributeColorSharedUniforms,
        runtime.semanticSurfaceSharedUniforms,
      ),
    )
    batch.perObjectFrustumCulled = true
    batch.sortObjects = false
    batch.userData.recordsByInstanceId = new Map<number, BatchedObjectRecord>()
    runtime.batchedMeshes.push(batch)
    runtime.rootGroup.add(batch)

    for (const item of chunk) {
      const geometryId = batch.addGeometry(item.geometry)
      const instanceId = batch.addInstance(geometryId)
      translation.copy(identity)
      translation.setPosition(
        item.featureCenter[0] - data.center[0],
        item.featureCenter[1] - data.center[1],
        item.featureCenter[2] - data.center[2],
      )
      batch.setMatrixAt(instanceId, translation)
      batch.setColorAt(instanceId, color.set(resolveInitialBatchedObjectColor(runtime, item)))

      const record: BatchedObjectRecord = {
        key: item.key,
        featureId: item.featureId,
        objectId: item.objectId,
        objectType: item.objectType,
        hasRenderableChildren: item.hasRenderableChildren,
        geometryIndex: item.geometryIndex,
        featureCenter: item.featureCenter,
        baseColorLight: item.baseColorLight,
        baseColorDark: item.baseColorDark,
        triangleFaceIndices: item.triangleFaceIndices,
        blueprint: item.blueprint,
        batch,
        instanceId,
        geometryId,
      }
      ;(batch.userData.recordsByInstanceId as Map<number, BatchedObjectRecord>).set(instanceId, record)
      runtime.batchedObjectsByObjectKey.set(item.key, record)
      const featureRecords = runtime.batchedObjectsByFeatureId.get(item.featureId)
      if (featureRecords) {
        featureRecords.push(record)
      } else {
        runtime.batchedObjectsByFeatureId.set(item.featureId, [record])
      }
      item.geometry.dispose()
    }

    batch.computeBoundingSphere()
    batch.computeBoundingBox()
  }

  applyBatchSelectionAppearance(runtime, selection, false, runtime.batchedObjectsByObjectKey.values())
}

function chunkBatchItems(items: BatchBuildItem[]) {
  const sortedItems = [...items].sort((left, right) =>
    left.tileKey.localeCompare(right.tileKey) ||
    left.featureId.localeCompare(right.featureId, undefined, { numeric: true, sensitivity: 'base' }) ||
    left.objectId.localeCompare(right.objectId, undefined, { numeric: true, sensitivity: 'base' }),
  )
  const chunks: BatchBuildItem[][] = []
  let current: BatchBuildItem[] = []
  let currentTile = ''
  let vertexCount = 0
  let indexCount = 0

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current)
      current = []
      vertexCount = 0
      indexCount = 0
    }
  }

  for (const item of sortedItems) {
    const tileChanged = current.length > 0 && item.tileKey !== currentTile
    const exceedsObjectLimit = current.length >= BATCH_MAX_OBJECT_COUNT
    const exceedsVertexLimit = current.length > 0 && vertexCount + item.vertexCount > BATCH_MAX_VERTEX_COUNT
    const exceedsIndexLimit = current.length > 0 && indexCount + item.indexCount > BATCH_MAX_INDEX_COUNT
    if (tileChanged || exceedsObjectLimit || exceedsVertexLimit || exceedsIndexLimit) {
      flush()
    }

    currentTile = item.tileKey
    current.push(item)
    vertexCount += item.vertexCount
    indexCount += item.indexCount
  }

  flush()
  return chunks
}

function createBatchMaterial(
  mode: BatchColorMode,
  sharedUniforms: AttributeColorSharedUniforms,
  semanticUniforms: SemanticSurfaceSharedUniforms,
) {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.72,
    metalness: 0.02,
    vertexColors: true,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  material.userData.batchColorMode = mode
  if (mode === 'semantic') {
    applyBatchedSemanticColoringToMaterial(material, semanticUniforms)
  } else if (mode === 'continuous-attribute') {
    applyBatchedContinuousAttributeColorToMaterial(material, sharedUniforms)
  }
  return material
}

function getBatchColorMode(runtime: Runtime): BatchColorMode {
  if (runtime.showSemanticSurfaces) {
    return 'semantic'
  }

  if (runtime.attributeColor?.mode === 'continuous') {
    return 'continuous-attribute'
  }

  return 'base'
}

function syncBatchMaterials(runtime: Runtime) {
  const mode = getBatchColorMode(runtime)
  for (const batch of runtime.batchedMeshes) {
    const currentMaterials = Array.isArray(batch.material) ? batch.material : [batch.material]
    const currentMode = currentMaterials[0]?.userData.batchColorMode as BatchColorMode | undefined
    if (currentMode === mode) {
      continue
    }

    for (const material of currentMaterials) {
      material.dispose()
    }
    batch.material = createBatchMaterial(
      mode,
      runtime.attributeColorSharedUniforms,
      runtime.semanticSurfaceSharedUniforms,
    )
  }
}

function rebuildFeatureGeometry(
  runtime: Runtime,
  data: ViewerDataset,
  featureId: string,
  selection: ViewSelection,
  changedVertexIndex?: number,
) {
  const feature = data.features.find((candidate) => candidate.id === featureId)
  const vertices = runtime.featureDrafts.get(featureId)
  if (!feature || !vertices) {
    return
  }

  for (const object of feature.objects) {
    const objectGeometry = resolveDisplayedObjectGeometry(feature, object, selection)
    if (!objectGeometry) {
      continue
    }

    if (changedVertexIndex != null && !objectGeometry.vertexIndices.includes(changedVertexIndex)) {
      continue
    }

    const objectKey = viewerObjectKey(featureId, object.id)
    const mesh = runtime.meshesByObjectKey.get(objectKey)
    const batchedRecord = runtime.batchedObjectsByObjectKey.get(objectKey)
    if (!mesh && !batchedRecord) {
      continue
    }

    const center = (mesh?.userData.featureCenter as Vec3 | undefined) ?? batchedRecord?.featureCenter ?? data.center
    const nextBlueprint = buildObjectGeometryBlueprint(
      objectGeometry.polygons,
      vertices,
      center,
      collectObjectErrorFaceIndices(
        feature.errors,
        object.id,
        objectGeometry.index,
        objectGeometry.sourceFaceIndices,
      ),
    )
    if (mesh) {
      const { faceGroups } = resolveObjectFaceGroups(runtime, feature, object, objectGeometry)
      const nextGeometry = buildGroupedObjectGeometry(nextBlueprint, faceGroups)
      replaceMeshGeometry(mesh, nextGeometry)
      mesh.userData.geometryBlueprint = nextBlueprint
      mesh.userData.geometryIndex = objectGeometry.index
    } else if (batchedRecord) {
      const nextGeometry = buildUngroupedObjectGeometry(nextBlueprint)
      applyBatchGeometryAttributes(
        nextGeometry,
        nextBlueprint,
        runtime,
        objectGeometry,
        objectKey,
      )
      try {
        batchedRecord.batch.setGeometryAt(batchedRecord.geometryId, nextGeometry)
        batchedRecord.triangleFaceIndices = nextGeometry.userData.triangleFaceIndices
        batchedRecord.blueprint = nextBlueprint
        batchedRecord.geometryIndex = objectGeometry.index
        batchedRecord.batch.computeBoundingSphere()
        batchedRecord.batch.computeBoundingBox()
      } finally {
        nextGeometry.dispose()
      }
    }
  }
}

function updateSelectionSurfacePresentation(
  runtime: Runtime,
  data: ViewerDataset,
  previousSelection: ViewSelection,
  selection: ViewSelection,
) {
  const previousObjectKey =
    previousSelection.selectedFeatureId && previousSelection.activeObjectId
      ? viewerObjectKey(previousSelection.selectedFeatureId, previousSelection.activeObjectId)
      : null
  const nextObjectKey =
    selection.selectedFeatureId && selection.activeObjectId
      ? viewerObjectKey(selection.selectedFeatureId, selection.activeObjectId)
      : null
  const didSelectedObjectChange = previousObjectKey !== nextObjectKey
  const didGeometryModeChange =
    previousSelection.geometryDisplayMode.kind !== selection.geometryDisplayMode.kind ||
    (previousSelection.geometryDisplayMode.kind === 'lod' &&
      selection.geometryDisplayMode.kind === 'lod' &&
      previousSelection.geometryDisplayMode.lod !== selection.geometryDisplayMode.lod) ||
    previousSelection.activeGeometryIndex !== selection.activeGeometryIndex
  const didSelectedFaceChange = previousSelection.selectedFaceIndex !== selection.selectedFaceIndex
  const didEditModeChange = previousSelection.editMode !== selection.editMode
  const didActiveGeometryOverrideMove =
    didSelectedObjectChange &&
    (previousSelection.activeGeometryIndex != null || selection.activeGeometryIndex != null)

  if (didSelectedFaceChange && !didActiveGeometryOverrideMove && !didGeometryModeChange && !didEditModeChange) {
    return
  }

  if (!didActiveGeometryOverrideMove && !didGeometryModeChange && !didEditModeChange) {
    return
  }

  const affectedKeys = new Set<string>()
  if (previousObjectKey) {
    affectedKeys.add(previousObjectKey)
  }
  if (nextObjectKey) {
    affectedKeys.add(nextObjectKey)
  }

  for (const key of affectedKeys) {
    const [featureId, objectId] = key.split('::')
    const feature = data.features.find((candidate) => candidate.id === featureId)
    const object = feature?.objects.find((candidate) => candidate.id === objectId)
    if (!feature || !object) {
      continue
    }

    updateObjectSurfacePresentation(runtime, feature, object, selection)
  }
}

function updateObjectSurfacePresentation(
  runtime: Runtime,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  selection: ViewSelection,
) {
  const objectKey = viewerObjectKey(feature.id, object.id)
  const mesh = runtime.meshesByObjectKey.get(objectKey)
  const batchedRecord = runtime.batchedObjectsByObjectKey.get(objectKey)
  if (!mesh && !batchedRecord) {
    return
  }

  const objectGeometry = resolveDisplayedObjectGeometry(feature, object, selection)
  if (!objectGeometry) {
    return
  }

  const draftVertices = runtime.featureDrafts.get(feature.id) ?? feature.vertices
  const featureCenter: Vec3 = [
    (feature.extent[0] + feature.extent[3]) * 0.5,
    (feature.extent[1] + feature.extent[4]) * 0.5,
    (feature.extent[2] + feature.extent[5]) * 0.5,
  ]
  const existingBlueprint = mesh?.userData.geometryBlueprint as ObjectGeometryBlueprint | undefined
  const { blueprint, geometry, material } = buildObjectMeshPresentation(
    runtime,
    feature,
    object,
    objectGeometry,
    draftVertices,
    featureCenter,
    existingBlueprint,
  )
  if (mesh) {
    replaceMeshGeometry(mesh, geometry)
    replaceMeshMaterial(mesh, material)
    mesh.userData.geometryBlueprint = blueprint
    mesh.userData.geometryIndex = objectGeometry.index
    mesh.userData.triangleFaceIndices = geometry.userData.triangleFaceIndices
    return
  }

  if (batchedRecord) {
    geometry.dispose()
    const batchGeometry = buildUngroupedObjectGeometry(blueprint)
    applyBatchGeometryAttributes(
      batchGeometry,
      blueprint,
      runtime,
      objectGeometry,
      objectKey,
    )
    try {
      batchedRecord.batch.setGeometryAt(batchedRecord.geometryId, batchGeometry)
      batchedRecord.triangleFaceIndices = batchGeometry.userData.triangleFaceIndices
      batchedRecord.blueprint = blueprint
      batchedRecord.geometryIndex = objectGeometry.index
      batchedRecord.batch.computeBoundingSphere()
      batchedRecord.batch.computeBoundingBox()
    } finally {
      batchGeometry.dispose()
    }
    const materials = Array.isArray(material) ? material : [material]
    for (const entry of materials) {
      entry.dispose()
    }
  }
}

function buildObjectMeshPresentation(
  runtime: Runtime,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
  vertices: Vec3[],
  featureCenter: Vec3,
  existingBlueprint?: ObjectGeometryBlueprint,
) {
  const blueprint = existingBlueprint ?? buildObjectGeometryBlueprint(
    objectGeometry.polygons,
    vertices,
    featureCenter,
    collectObjectErrorFaceIndices(
      feature.errors,
      object.id,
      objectGeometry.index,
      objectGeometry.sourceFaceIndices,
    ),
  )
  const { faceGroups, groupColors } = resolveObjectFaceGroups(runtime, feature, object, objectGeometry)
  const geometry = buildGroupedObjectGeometry(blueprint, faceGroups)
  const baseMaterial = createMaterial(object.type, runtime.theme, runtime.showSemanticSurfaces)
  applyAttributeColorToMaterial(
    baseMaterial,
    runtime.attributeColor,
    runtime.attributeColor?.valuesByObjectKey[viewerObjectKey(feature.id, object.id)] ?? null,
    runtime.attributeColor?.directColorsByObjectKey?.[viewerObjectKey(feature.id, object.id)] ?? null,
    runtime.attributeColorSharedUniforms,
  )
  const materials = buildMaterialArray(
    baseMaterial,
    groupColors,
    runtime.showSemanticSurfaces ? createSemanticMaterial : createErrorMaterial,
  )

  return {
    blueprint,
    geometry,
    material: materials.length > 1 ? materials : baseMaterial,
  }
}

function resolveObjectFaceGroups(
  runtime: Runtime,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
) {
  return runtime.showSemanticSurfaces
    ? computeFaceSemanticGroups(objectGeometry.semanticSurfaces)
    : computeFaceErrorGroups(feature.errors, object.id, objectGeometry.index, objectGeometry.sourceFaceIndices)
}

function collectObjectErrorFaceIndices(
  errors: ViewerValidationError[],
  objectId: string,
  geometryIndex: number,
  sourceFaceIndices: number[],
) {
  const faceIndices = new Set<number>()

  for (const error of errors) {
    if (
      error.cityObjectId !== objectId ||
      error.faceIndex == null ||
      (error.geometryIndex != null && error.geometryIndex !== geometryIndex)
    ) {
      continue
    }

    const currentFaceIndex = getCurrentFaceIndexForSourceFace(sourceFaceIndices, error.faceIndex)
    if (currentFaceIndex != null) {
      faceIndices.add(currentFaceIndex)
    }
  }

  return faceIndices
}

function buildObjectGeometryBlueprint(
  polygons: PolygonRings[],
  vertices: Vec3[],
  center: Vec3,
  triangleNormalFaceIndices: ReadonlySet<number> = EMPTY_FACE_INDEX_SET,
): ObjectGeometryBlueprint {
  let vertexCapacity = countRenderablePolygonVertices(polygons, vertices)
  let positions = new Float32Array(vertexCapacity * 3)
  let normals = new Float32Array(vertexCapacity * 3)
  const polygonTriangleIndices: number[][] = []
  let offset = 0
  let nonPlanarNormalExtraVertexCount = 0
  const nonPlanarNormalExtraVertexBudget = Math.min(
    Math.max(
      Math.floor(vertexCapacity * NON_PLANAR_NORMAL_EXTRA_VERTEX_RATIO),
      NON_PLANAR_NORMAL_EXTRA_VERTEX_MIN_BUDGET,
    ),
    NON_PLANAR_NORMAL_EXTRA_VERTEX_MAX_BUDGET,
  )

  function ensureVertexCapacity(requiredVertexCount: number) {
    if (requiredVertexCount <= vertexCapacity) {
      return
    }

    const nextCapacity = Math.max(requiredVertexCount, Math.ceil(vertexCapacity * 1.5), vertexCapacity + 1024)
    const nextPositions = new Float32Array(nextCapacity * 3)
    const nextNormals = new Float32Array(nextCapacity * 3)
    nextPositions.set(positions)
    nextNormals.set(normals)
    positions = nextPositions
    normals = nextNormals
    vertexCapacity = nextCapacity
  }

  for (let polyIndex = 0; polyIndex < polygons.length; polyIndex += 1) {
    const sourcePolygon = polygons[polyIndex]
    const allowTriangleNormals = triangleNormalFaceIndices.has(polyIndex)
    if (
      sourcePolygon.length === 1 &&
      !allowTriangleNormals &&
      !hasClosingDuplicateVertex(sourcePolygon[0], vertices)
    ) {
      const ring = sourcePolygon[0]
      const polygonVertexCount = countRenderableRingVertices(ring, vertices)
      if (polygonVertexCount < 3) {
        polygonTriangleIndices.push([])
        continue
      }

      const normal = computeIndexedRingNormal(ring, vertices)
      ensureVertexCapacity(offset + polygonVertexCount)
      fillIndexedRingBuffers(ring, vertices, center, normal, positions, normals, offset * 3)

      if (polygonVertexCount === 3) {
        polygonTriangleIndices.push([offset, offset + 1, offset + 2])
      } else if (polygonVertexCount === 4 && isConvexIndexedRing(ring, vertices, normal)) {
        polygonTriangleIndices.push([offset, offset + 1, offset + 2, offset, offset + 2, offset + 3])
      } else {
        const ringVertices = collectRingVertices(ring, vertices)
        const triangles = triangulatePolygon([ringVertices])
        const polygonIndices: number[] = []
        for (const triangle of triangles) {
          polygonIndices.push(offset + triangle[0], offset + triangle[1], offset + triangle[2])
        }
        polygonTriangleIndices.push(polygonIndices)
      }

      offset += polygonVertexCount
      continue
    }

    const polygon = preparePolygonGeometry(
      sourcePolygon,
      vertices,
      allowTriangleNormals,
    )
    if (polygon.compactVertexCount === 0) {
      polygonTriangleIndices.push([])
      continue
    }

    const polygonIndices: number[] = []
    const extraTriangleVertexCount = polygon.triangleVertexCount - polygon.compactVertexCount
    const useTriangleVertices =
      polygon.isNonPlanar &&
      extraTriangleVertexCount > 0 &&
      nonPlanarNormalExtraVertexCount + extraTriangleVertexCount <= nonPlanarNormalExtraVertexBudget
    const outputVertexCount = useTriangleVertices ? polygon.triangleVertexCount : polygon.compactVertexCount
    ensureVertexCapacity(offset + outputVertexCount)
    if (useTriangleVertices) {
      const writtenVertexCount = appendTriangleRingVertexBuffers(
        polygon.rings,
        polygon.ringOffsets,
        polygon.triangles,
        center,
        polygon.normal,
        positions,
        normals,
        offset,
        polygonIndices,
      )
      offset += writtenVertexCount
      nonPlanarNormalExtraVertexCount += Math.max(writtenVertexCount - polygon.compactVertexCount, 0)
    } else {
      fillPolygonRingBuffers(polygon.rings, center, polygon.normal, positions, normals, offset * 3)
      for (const triangle of polygon.triangles) {
        polygonIndices.push(offset + triangle[0], offset + triangle[1], offset + triangle[2])
      }
      offset += polygon.compactVertexCount
    }

    polygonTriangleIndices.push(polygonIndices)
  }

  const usedComponentCount = offset * 3

  const blueprint: ObjectGeometryBlueprint = {
    positions: usedComponentCount === positions.length ? positions : positions.slice(0, usedComponentCount),
    normals: usedComponentCount === normals.length ? normals : normals.slice(0, usedComponentCount),
    polygonTriangleIndices,
  }

  return blueprint
}

function preparePolygonGeometry(
  polygon: PolygonRings,
  vertices: Vec3[],
  allowTriangleNormals: boolean,
) {
  const rings = polygon
    .map((ring) => removeClosingDuplicateVertex(collectRingVertices(ring, vertices)))
    .filter((ring) => ring.length >= 3)

  if (rings.length === 0) {
    return {
      rings: [],
      ringOffsets: [],
      triangles: [],
      normal: new THREE.Vector3(0, 0, 1),
      isNonPlanar: false,
      compactVertexCount: 0,
      triangleVertexCount: 0,
    }
  }

  const normal = computeNormal(rings[0])
  const triangles = triangulatePolygon(rings)
  let ringVertexCount = 0
  for (const ring of rings) {
    ringVertexCount += ring.length
  }
  const isNonPlanar = allowTriangleNormals && ringVertexCount > 3 && isNonPlanarPolygon(rings, normal)
  const ringOffsets = isNonPlanar ? collectRingOffsets(rings) : []

  return {
    rings,
    ringOffsets,
    triangles,
    normal,
    isNonPlanar,
    compactVertexCount: ringVertexCount,
    triangleVertexCount: triangles.length * 3,
  }
}

function collectRingOffsets(rings: Vec3[][]) {
  const ringOffsets: number[] = []
  let offset = 0
  for (const ring of rings) {
    ringOffsets.push(offset)
    offset += ring.length
  }
  return ringOffsets
}

function countRenderablePolygonVertices(polygons: PolygonRings[], vertices: Vec3[]) {
  let count = 0

  for (const polygon of polygons) {
    let polygonCount = 0
    for (const ring of polygon) {
      let ringCount = 0
      for (const index of ring) {
        if (Array.isArray(vertices[index])) {
          ringCount += 1
        }
      }
      if (ringCount >= 3) {
        polygonCount += ringCount
      }
    }
    count += polygonCount
  }

  return count
}

function countRenderableRingVertices(ring: number[], vertices: Vec3[]) {
  let count = 0
  for (const index of ring) {
    if (Array.isArray(vertices[index])) {
      count += 1
    }
  }
  return count
}

function collectRingVertices(ring: number[], vertices: Vec3[]) {
  const ringVertices: Vec3[] = []
  for (const index of ring) {
    const vertex = vertices[index]
    if (Array.isArray(vertex)) {
      ringVertices.push(vertex)
    }
  }
  return ringVertices
}

function hasClosingDuplicateVertex(ring: number[], vertices: Vec3[]) {
  if (ring.length < 2) {
    return false
  }

  const first = vertices[ring[0]]
  const last = vertices[ring[ring.length - 1]]
  return Array.isArray(first) &&
    Array.isArray(last) &&
    samePoint(first, last)
}

function removeClosingDuplicateVertex(ringVertices: Vec3[]) {
  if (ringVertices.length < 2) {
    return ringVertices
  }

  const first = ringVertices[0]
  const last = ringVertices[ringVertices.length - 1]
  return samePoint(first, last)
    ? ringVertices.slice(0, -1)
    : ringVertices
}

function samePoint(first: Vec3, second: Vec3) {
  return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function fillIndexedRingBuffers(
  ring: number[],
  vertices: Vec3[],
  center: Vec3,
  normal: THREE.Vector3,
  positions: Float32Array,
  normals: Float32Array,
  startOffset: number,
) {
  let componentOffset = startOffset

  for (const index of ring) {
    const vertex = vertices[index]
    if (!Array.isArray(vertex)) {
      continue
    }

    positions[componentOffset] = vertex[0] - center[0]
    normals[componentOffset++] = normal.x
    positions[componentOffset] = vertex[1] - center[1]
    normals[componentOffset++] = normal.y
    positions[componentOffset] = vertex[2] - center[2]
    normals[componentOffset++] = normal.z
  }
}

function fillPolygonRingBuffers(
  rings: Vec3[][],
  center: Vec3,
  normal: THREE.Vector3,
  positions: Float32Array,
  normals: Float32Array,
  startOffset: number,
) {
  let componentOffset = startOffset

  for (const ring of rings) {
    for (const vertex of ring) {
      positions[componentOffset] = vertex[0] - center[0]
      normals[componentOffset++] = normal.x
      positions[componentOffset] = vertex[1] - center[1]
      normals[componentOffset++] = normal.y
      positions[componentOffset] = vertex[2] - center[2]
      normals[componentOffset++] = normal.z
    }
  }
}

function appendTriangleRingVertexBuffers(
  rings: Vec3[][],
  ringOffsets: number[],
  triangles: number[][],
  center: Vec3,
  fallbackNormal: THREE.Vector3,
  positions: Float32Array,
  normals: Float32Array,
  startVertexOffset: number,
  polygonIndices: number[],
) {
  let vertexOffset = startVertexOffset
  let componentOffset = startVertexOffset * 3

  for (const triangle of triangles) {
    const first = getRingVertexAt(rings, ringOffsets, triangle[0])
    const second = getRingVertexAt(rings, ringOffsets, triangle[1])
    const third = getRingVertexAt(rings, ringOffsets, triangle[2])
    if (!first || !second || !third) {
      continue
    }

    const normal = computeTriangleNormal(first, second, third, fallbackNormal)
    for (const vertexIndex of triangle) {
      const vertex = getRingVertexAt(rings, ringOffsets, vertexIndex)
      if (!vertex) {
        continue
      }

      positions[componentOffset] = vertex[0] - center[0]
      normals[componentOffset++] = normal.x
      positions[componentOffset] = vertex[1] - center[1]
      normals[componentOffset++] = normal.y
      positions[componentOffset] = vertex[2] - center[2]
      normals[componentOffset++] = normal.z
      polygonIndices.push(vertexOffset++)
    }
  }

  return vertexOffset - startVertexOffset
}

function getRingVertexAt(rings: Vec3[][], ringOffsets: number[], flatIndex: number) {
  for (let ringIndex = ringOffsets.length - 1; ringIndex >= 0; ringIndex -= 1) {
    const ringOffset = ringOffsets[ringIndex]
    if (flatIndex >= ringOffset) {
      return rings[ringIndex][flatIndex - ringOffset] ?? null
    }
  }

  return null
}

function buildGroupedObjectGeometry(
  blueprint: ObjectGeometryBlueprint,
  faceGroups: Map<number, number>,
) {
  if (faceGroups.size === 0) {
    return buildUngroupedObjectGeometry(blueprint)
  }

  const groupedIndices = new Map<number, number[]>()
  const triangleFaceIndicesByGroup = new Map<number, number[]>()

  blueprint.polygonTriangleIndices.forEach((polygonIndices, polyIndex) => {
    if (polygonIndices.length === 0) {
      return
    }

    const groupIndex = faceGroups.get(polyIndex) ?? 0
    const groupIndices = groupedIndices.get(groupIndex) ?? []
    appendNumbers(groupIndices, polygonIndices)
    groupedIndices.set(groupIndex, groupIndices)

    const groupFaceIndices = triangleFaceIndicesByGroup.get(groupIndex) ?? []
    for (let triangleIndex = 0; triangleIndex < polygonIndices.length; triangleIndex += 3) {
      groupFaceIndices.push(polyIndex)
    }
    triangleFaceIndicesByGroup.set(groupIndex, groupFaceIndices)
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(blueprint.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(blueprint.normals, 3))

  const allIndices: number[] = []
  const triangleFaceIndices: number[] = []
  const sortedKeys = [...groupedIndices.keys()].sort((a, b) => a - b)
  for (const key of sortedKeys) {
    const groupIndices = groupedIndices.get(key) ?? []
    const groupFaceIndices = triangleFaceIndicesByGroup.get(key) ?? []
    const start = allIndices.length
    appendNumbers(allIndices, groupIndices)
    appendNumbers(triangleFaceIndices, groupFaceIndices)
    geometry.addGroup(start, groupIndices.length, key)
  }

  geometry.setIndex(allIndices)
  geometry.userData.triangleFaceIndices = triangleFaceIndices
  geometry.computeBoundingSphere()
  return geometry
}

function buildUngroupedObjectGeometry(blueprint: ObjectGeometryBlueprint) {
  let indexCount = 0
  let triangleCount = 0
  for (const polygonIndices of blueprint.polygonTriangleIndices) {
    indexCount += polygonIndices.length
    triangleCount += polygonIndices.length / 3
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(blueprint.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(blueprint.normals, 3))

  const vertexCount = blueprint.positions.length / 3
  const allIndices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount)
  const triangleFaceIndices = new Uint32Array(triangleCount)
  let indexOffset = 0
  let triangleOffset = 0

  blueprint.polygonTriangleIndices.forEach((polygonIndices, polyIndex) => {
    for (let index = 0; index < polygonIndices.length; index += 1) {
      allIndices[indexOffset++] = polygonIndices[index]
    }
    for (let index = 0; index < polygonIndices.length; index += 3) {
      triangleFaceIndices[triangleOffset++] = polyIndex
    }
  })

  geometry.setIndex(new THREE.BufferAttribute(allIndices, 1))
  geometry.userData.triangleFaceIndices = triangleFaceIndices
  geometry.computeBoundingSphere()
  return geometry
}

function appendNumbers(target: number[], source: ArrayLike<number>) {
  for (let index = 0; index < source.length; index += 1) {
    target.push(source[index])
  }
}

function replaceMeshGeometry(mesh: THREE.Mesh, geometry: THREE.BufferGeometry) {
  mesh.geometry.dispose()
  mesh.geometry = geometry
  mesh.userData.triangleFaceIndices = geometry.userData.triangleFaceIndices
}

function replaceMeshMaterial(mesh: THREE.Mesh, material: THREE.Material | THREE.Material[]) {
  const currentMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const currentMaterial of currentMaterials) {
    currentMaterial.dispose()
  }
  mesh.material = material
}

function rebuildAnnotations(runtime: Runtime) {
  clearTransientGroup(runtime.annotationGroup)
  runtime.annotationVertexMarkers = []
}

function syncSelection(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
  hideOccludedEditEdges: boolean,
  isolateSelectedFeature: boolean,
  showVertexGizmo: boolean,
) {
  syncSelectionOutlineProxy(runtime, data, selection)
  applySelectionAppearance(runtime, selection, isolateSelectedFeature, runtime.meshesByObjectKey.values())
  applyBatchSelectionAppearance(runtime, selection, isolateSelectedFeature, runtime.batchedObjectsByObjectKey.values())
  rebuildHandles(runtime, data, selection, hideOccludedEditEdges, showVertexGizmo)
}

function syncSelectionDelta(
  runtime: Runtime,
  data: ViewerDataset,
  previousSelection: ViewSelection,
  selection: ViewSelection,
  hideOccludedEditEdges: boolean,
  previousIsolateSelectedFeature: boolean,
  isolateSelectedFeature: boolean,
  showVertexGizmo: boolean,
) {
  syncSelectionOutlineProxy(runtime, data, selection)
  const previousIsolateActive = previousIsolateSelectedFeature && previousSelection.selectedFeatureIds.length > 0
  const isolateActive = isolateSelectedFeature && selection.selectedFeatureIds.length > 0

  if (previousIsolateActive !== isolateActive) {
    syncSelection(runtime, data, selection, hideOccludedEditEdges, isolateSelectedFeature, showVertexGizmo)
    return
  }

  const affectedFeatureIds = new Set<string>([
    ...previousSelection.selectedFeatureIds,
    ...selection.selectedFeatureIds,
  ])
  if (previousSelection.selectedFeatureId) {
    affectedFeatureIds.add(previousSelection.selectedFeatureId)
  }
  if (selection.selectedFeatureId) {
    affectedFeatureIds.add(selection.selectedFeatureId)
  }

  applySelectionAppearance(runtime, selection, isolateSelectedFeature, collectAffectedFeatureMeshes(runtime, affectedFeatureIds))
  applyBatchSelectionAppearance(runtime, selection, isolateSelectedFeature, collectAffectedBatchRecords(runtime, affectedFeatureIds))
  rebuildHandles(runtime, data, selection, hideOccludedEditEdges, showVertexGizmo)
}

function extractOutlineGeometrySubset(
  sourceGeometry: THREE.BufferGeometry,
  triangleFaceIndices: TriangleFaceIndices,
  predicate: (faceIndex: number) => boolean,
): THREE.BufferGeometry {
  const sourceIndexAttr = sourceGeometry.getIndex()
  if (!sourceIndexAttr) {
    return sourceGeometry.clone()
  }

  const sourceIndexArray = sourceIndexAttr.array
  const triangleCount = triangleFaceIndices.length
  const indices: number[] = []

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (predicate(triangleFaceIndices[triangle])) {
      const base = triangle * 3
      indices.push(sourceIndexArray[base], sourceIndexArray[base + 1], sourceIndexArray[base + 2])
    }
  }

  if (indices.length === 0) {
    return sourceGeometry.clone()
  }

  const TypedArrayCtor = sourceIndexArray instanceof Uint32Array ? Uint32Array : Uint16Array
  const subsetIndices = new TypedArrayCtor(indices)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', sourceGeometry.getAttribute('position').clone())
  geometry.setAttribute('normal', sourceGeometry.getAttribute('normal').clone())
  geometry.setIndex(new THREE.BufferAttribute(subsetIndices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

function syncSelectionOutlineProxy(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
) {
  clearSelectionOutlineProxy(runtime)

  if (selection.selectedFeatureIds.length === 0 || !runtime.renderer.capabilities.isWebGL2) {
    return
  }

  const selectedFeatureSet = new Set(selection.selectedFeatureIds)
  runtime.selectionOutlineVisible =
    selection.selectedFeatureIds.length > 0 &&
    !(selection.editMode && selection.selectedFaceIndex != null && selection.selectedFeatureIds.length === 1)

  const outlineObjectKeys = runtime.selectionOutlineObjectKey
  for (const feature of data.features) {
    if (!selectedFeatureSet.has(feature.id)) {
      continue
    }

    for (const object of feature.objects) {
      const objectGeometry = resolveDisplayedObjectGeometry(feature, object, selection)
      if (!objectGeometry) {
        continue
      }

      const objectKey = viewerObjectKey(feature.id, object.id)
      outlineObjectKeys.push(objectKey)

      const sourcePolygons = objectGeometry.polygons
      const isActiveSelection = feature.id === selection.selectedFeatureId && object.id === selection.activeObjectId
      const selectedFace = isActiveSelection && selection.selectedFaceIndex != null
        ? sourcePolygons[selection.selectedFaceIndex] ?? null
        : null
      const hasSelectedFace = isActiveSelection && selection.selectedFaceIndex != null && selectedFace != null

      const shouldBuildOutline = hasSelectedFace
        ? true
        : sourcePolygons.length > 0
      if (!shouldBuildOutline) {
        continue
      }

      const featureCenter: Vec3 = [
        (feature.extent[0] + feature.extent[3]) * 0.5,
        (feature.extent[1] + feature.extent[4]) * 0.5,
        (feature.extent[2] + feature.extent[5]) * 0.5,
      ]
      const meshPosition = new THREE.Vector3(
        featureCenter[0] - data.center[0],
        featureCenter[1] - data.center[1],
        featureCenter[2] - data.center[2],
      )

      const standaloneMesh = runtime.meshesByObjectKey.get(objectKey)
      if (standaloneMesh) {
        const sourceGeometry = standaloneMesh.geometry
        const triangleFaceIndices = standaloneMesh.userData.triangleFaceIndices

        if (hasSelectedFace && triangleFaceIndices) {
          const outlineGeometry = extractOutlineGeometrySubset(
            sourceGeometry,
            triangleFaceIndices,
            (faceIndex) => faceIndex === selection.selectedFaceIndex,
          )
          const outlineMesh = new THREE.Mesh(outlineGeometry, runtime.selectionOutlineSeedMaterial)
          outlineMesh.position.copy(meshPosition)
          runtime.selectionOutlineGroup.add(outlineMesh)

          if (sourcePolygons.length > 1) {
            const occluderGeometry = extractOutlineGeometrySubset(
              sourceGeometry,
              triangleFaceIndices,
              (faceIndex) => faceIndex !== selection.selectedFaceIndex,
            )
            const occluderMesh = new THREE.Mesh(occluderGeometry, runtime.selectionOutlineDepthMaterial)
            occluderMesh.position.copy(meshPosition)
            runtime.selectionOutlineOccluderGroup.add(occluderMesh)
          }
        } else {
          const outlineGeometry = sourceGeometry.clone()
          const outlineMesh = new THREE.Mesh(outlineGeometry, runtime.selectionOutlineSeedMaterial)
          outlineMesh.position.copy(meshPosition)
          runtime.selectionOutlineGroup.add(outlineMesh)
        }
        continue
      }

      const batchedRecord = runtime.batchedObjectsByObjectKey.get(objectKey)
      if (batchedRecord) {
        const blueprint = batchedRecord.blueprint

        if (hasSelectedFace) {
          const outlineGeometry = buildUngroupedObjectGeometry({
            positions: blueprint.positions,
            normals: blueprint.normals,
            polygonTriangleIndices: [blueprint.polygonTriangleIndices[selection.selectedFaceIndex!]],
          })
          const outlineMesh = new THREE.Mesh(outlineGeometry, runtime.selectionOutlineSeedMaterial)
          outlineMesh.position.copy(meshPosition)
          runtime.selectionOutlineGroup.add(outlineMesh)

          if (sourcePolygons.length > 1) {
            const occluderPolygonIndices = blueprint.polygonTriangleIndices
              .filter((_, index) => index !== selection.selectedFaceIndex)
            const occluderGeometry = buildUngroupedObjectGeometry({
              positions: blueprint.positions,
              normals: blueprint.normals,
              polygonTriangleIndices: occluderPolygonIndices,
            })
            const occluderMesh = new THREE.Mesh(occluderGeometry, runtime.selectionOutlineDepthMaterial)
            occluderMesh.position.copy(meshPosition)
            runtime.selectionOutlineOccluderGroup.add(occluderMesh)
          }
        } else {
          const outlineGeometry = buildUngroupedObjectGeometry(blueprint)
          const outlineMesh = new THREE.Mesh(outlineGeometry, runtime.selectionOutlineSeedMaterial)
          outlineMesh.position.copy(meshPosition)
          runtime.selectionOutlineGroup.add(outlineMesh)
        }
      }
    }
  }
}

function clearSelectionOutlineProxy(runtime: Runtime) {
  for (const child of [...runtime.selectionOutlineGroup.children]) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
    }
    runtime.selectionOutlineGroup.remove(child)
  }
  for (const child of [...runtime.selectionOutlineOccluderGroup.children]) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
    }
    runtime.selectionOutlineOccluderGroup.remove(child)
  }
  runtime.selectionOutlineObjectKey = []
  runtime.selectionOutlineVisible = true
}

function renderSelectionOutline(runtime: Runtime) {
  if (
    runtime.selectionOutlineGroup.children.length === 0 ||
    !runtime.renderer.capabilities.isWebGL2
  ) {
    return
  }

  syncSelectionOutlineTargetSize(runtime)

  const renderer = runtime.renderer
  const [firstTarget, secondTarget] = runtime.selectionOutlineTargets
  const previousRenderTarget = renderer.getRenderTarget()
  const previousAutoClear = renderer.autoClear
  const previousOverrideMaterial = runtime.scene.overrideMaterial
  const previousClearColor = new THREE.Color()
  renderer.getClearColor(previousClearColor)
  const previousClearAlpha = renderer.getClearAlpha()
  const previousHandleVisibility = runtime.handleGroup.visible
  const previousEdgeVisibility = runtime.edgeGroup.visible
  const previousAnnotationVisibility = runtime.annotationGroup.visible
  const hiddenSelectedObject = hideSelectionOutlineDepthSelf(runtime)

  runtime.selectionOutlineSeedMaterial.negative = false
  runtime.selectionOutlineSeedMaterial.depthTest = false
  runtime.selectionOutlineSeedMaterial.depthWrite = false
  renderer.setRenderTarget(firstTarget)
  renderer.setClearColor(0x000000, 0)
  renderer.clear(true, true, true)
  runtime.selectionOutlineSeedQuad.render(renderer)

  renderer.autoClear = false
  runtime.handleGroup.visible = false
  runtime.edgeGroup.visible = false
  runtime.annotationGroup.visible = false
  runtime.scene.overrideMaterial = runtime.selectionOutlineDepthMaterial
  renderer.render(runtime.scene, runtime.camera)
  runtime.scene.overrideMaterial = previousOverrideMaterial
  renderer.render(runtime.selectionOutlineOccluderScene, runtime.camera)
  runtime.handleGroup.visible = previousHandleVisibility
  runtime.edgeGroup.visible = previousEdgeVisibility
  runtime.annotationGroup.visible = previousAnnotationVisibility
  restoreSelectionOutlineDepthSelf(hiddenSelectedObject)

  runtime.selectionOutlineSeedMaterial.negative = true
  runtime.selectionOutlineSeedMaterial.depthTest = true
  runtime.selectionOutlineSeedMaterial.depthWrite = false
  renderer.render(runtime.selectionOutlineScene, runtime.camera)
  runtime.selectionOutlineSeedMaterial.depthTest = false

  const selectionColors = SELECTION_EFFECT_COLORS[runtime.theme]
  runtime.selectionOverlayMaterial.map = firstTarget.texture
  runtime.selectionOverlayMaterial.color.set(selectionColors.overlay)
  runtime.selectionOverlayMaterial.overlayOpacity = selectionColors.overlayOpacity
  renderer.setRenderTarget(previousRenderTarget)
  runtime.selectionOverlayQuad.render(renderer)

  if (!runtime.selectionOutlineVisible) {
    renderer.autoClear = previousAutoClear
    renderer.setClearColor(previousClearColor, previousClearAlpha)
    return
  }

  let readTarget = firstTarget
  let writeTarget = secondTarget
  let step = Math.min(
    Math.max(firstTarget.width, firstTarget.height),
    SELECTION_OUTLINE_THICKNESS_PIXELS,
  )
  while (true) {
    const material = runtime.selectionOutlineJfaQuad.material as SelectionOutlineJFAMaterial
    material.source = readTarget.texture
    material.step = step
    renderer.setRenderTarget(writeTarget)
    runtime.selectionOutlineJfaQuad.render(renderer)

    const nextReadTarget = writeTarget
    writeTarget = readTarget
    readTarget = nextReadTarget

    if (step <= 1) {
      break
    }
    step = Math.ceil(step * 0.5)
  }

  const effectMaterial = runtime.selectionOutlineEffectQuad.material as SelectionOutlineEffectMaterial
  effectMaterial.map = readTarget.texture
  effectMaterial.thickness = SELECTION_OUTLINE_THICKNESS_PIXELS
  effectMaterial.color.set(selectionColors.outline)
  renderer.setRenderTarget(previousRenderTarget)
  runtime.selectionOutlineEffectQuad.render(renderer)

  renderer.autoClear = previousAutoClear
  renderer.setClearColor(previousClearColor, previousClearAlpha)
}

function hideSelectionOutlineDepthSelf(runtime: Runtime) {
  const objectKey = runtime.selectionOutlineObjectKey
  if (objectKey.length === 0) {
    return null
  }

  const hidden: Array<
    | { kind: 'mesh'; mesh: THREE.Mesh; visible: boolean }
    | { kind: 'batch'; record: BatchedObjectRecord; visible: boolean }
  > = []

  for (const key of objectKey) {
    const mesh = runtime.meshesByObjectKey.get(key)
    if (mesh) {
      const visible = mesh.visible
      mesh.visible = false
      hidden.push({ kind: 'mesh', mesh, visible })
      continue
    }

    const record = runtime.batchedObjectsByObjectKey.get(key)
    if (record) {
      const visible = record.batch.getVisibleAt(record.instanceId)
      record.batch.setVisibleAt(record.instanceId, false)
      hidden.push({ kind: 'batch', record, visible })
    }
  }

  return hidden
}

function restoreSelectionOutlineDepthSelf(
  hidden:
    | Array<
        | { kind: 'mesh'; mesh: THREE.Mesh; visible: boolean }
        | { kind: 'batch'; record: BatchedObjectRecord; visible: boolean }
      >
    | null,
) {
  if (!hidden) {
    return
  }

  for (const item of hidden) {
    if (item.kind === 'mesh') {
      item.mesh.visible = item.visible
    } else {
      item.record.batch.setVisibleAt(item.record.instanceId, item.visible)
    }
  }
}

function syncSelectionOutlineTargetSize(runtime: Runtime) {
  const size = runtime.renderer.getDrawingBufferSize(new THREE.Vector2())
  const width = Math.max(1, Math.floor(size.x))
  const height = Math.max(1, Math.floor(size.y))

  for (const target of runtime.selectionOutlineTargets) {
    if (target.width !== width || target.height !== height) {
      target.setSize(width, height)
    }
  }
}

function disposeSelectionOutlineResources(runtime: Runtime) {
  clearSelectionOutlineProxy(runtime)
  for (const target of runtime.selectionOutlineTargets) {
    target.dispose()
  }
  runtime.selectionOutlineSeedQuad.dispose()
  runtime.selectionOutlineJfaQuad.dispose()
  runtime.selectionOverlayQuad.dispose()
  runtime.selectionOutlineEffectQuad.dispose()
  runtime.selectionOutlineSeedMaterial.dispose()
  runtime.selectionOverlayMaterial.dispose()
  runtime.selectionOutlineDepthMaterial.dispose()
  ;(runtime.selectionOutlineJfaQuad.material as THREE.Material).dispose()
  ;(runtime.selectionOutlineEffectQuad.material as THREE.Material).dispose()
}

function applySelectionAppearance(
  runtime: Runtime,
  selection: ViewSelection,
  isolateSelectedFeature: boolean,
  meshes: Iterable<THREE.Mesh>,
) {
  const isolateActive = isolateSelectedFeature && selection.selectedFeatureIds.length > 0
  const palette = getViewportPalette(runtime.theme)
  const selectedFeatureSet = new Set(selection.selectedFeatureIds)

  for (const mesh of meshes) {
    applyMeshSelectionAppearance(
      runtime,
      mesh,
      selection,
      selectedFeatureSet,
      isolateActive,
      palette,
    )
  }
}

function applyMeshSelectionAppearance(
  runtime: Runtime,
  mesh: THREE.Mesh,
  selection: ViewSelection,
  selectedFeatureSet: ReadonlySet<string>,
  isolateActive: boolean,
  palette: ReturnType<typeof getViewportPalette>,
) {
  const featureId = mesh.userData.featureId as string
  const objectId = mesh.userData.objectId as string
  const hasRenderableChildren = (mesh.userData.hasRenderableChildren as boolean | undefined) === true
  const baseColor =
    runtime.theme === 'light'
      ? ((mesh.userData.baseColorLight as string | undefined) ??
        baseColorForType(mesh.userData.objectType as string, 'light'))
      : ((mesh.userData.baseColorDark as string | undefined) ??
        baseColorForType(mesh.userData.objectType as string, 'dark'))
  const isSelectedFeature = selectedFeatureSet.has(featureId)
  const isActiveObject = isSelectedFeature && objectId === selection.activeObjectId
  const hideParentMesh =
    selection.geometryDisplayMode.kind === 'best' && hasRenderableChildren && !isActiveObject

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of materials) {
    const mat = material as THREE.MeshStandardMaterial
    if (mat.userData.isError) {
      mat.emissive.set(palette.errorEmissive)
      mat.emissiveIntensity = palette.errorIntensity
    } else if (mat.userData.isSemantic || mat.userData.isSemanticBase) {
      if (typeof mat.userData.semanticColor === 'string') {
        mat.color.set(mat.userData.semanticColor)
      }
      mat.emissive.set('#000000')
      mat.emissiveIntensity = 0
      mat.roughness = 0.72
    } else {
      mat.color.set(baseColor)
      mat.emissive.set(palette.baseEmissive)
      mat.emissiveIntensity = palette.baseEmissiveIntensity
      mat.roughness = 0.72
    }
    mat.opacity = 1
    mat.transparent = false
    mat.depthWrite = true
  }

  mesh.visible = (!isolateActive || isSelectedFeature) && !hideParentMesh
}

function applyBatchSelectionAppearance(
  runtime: Runtime,
  selection: ViewSelection,
  isolateSelectedFeature: boolean,
  records: Iterable<BatchedObjectRecord>,
) {
  const isolateActive = isolateSelectedFeature && selection.selectedFeatureIds.length > 0
  const selectedFeatureSet = new Set(selection.selectedFeatureIds)
  const color = new THREE.Color()

  for (const record of records) {
    const isSelectedFeature = selectedFeatureSet.has(record.featureId)
    const isActiveObject = isSelectedFeature && record.objectId === selection.activeObjectId
    const hideParentMesh =
      selection.geometryDisplayMode.kind === 'best' &&
      record.hasRenderableChildren &&
      !isActiveObject
    const visible = (!isolateActive || isSelectedFeature) && !hideParentMesh
    record.batch.setVisibleAt(record.instanceId, visible)
    record.batch.setColorAt(
      record.instanceId,
      color.set(resolveBatchedObjectColor(runtime, record)),
    )
  }
}

function syncBatchedAttributeValueTexture(
  runtime: Runtime,
  attributeColor: ViewerAttributeColorState | null,
) {
  const objectCount = Math.max(runtime.nextShaderObjectId, 1)
  const textureSize = Math.max(1, Math.ceil(Math.sqrt(objectCount)))
  const data = new Float32Array(textureSize * textureSize * 4)

  if (attributeColor?.mode === 'continuous') {
    for (const [objectKey, objectId] of runtime.shaderObjectIdsByObjectKey.entries()) {
      const offset = objectId * 4
      const value = attributeColor.valuesByObjectKey[objectKey]
      data[offset] = value ?? 0
      data[offset + 1] = value == null ? 0 : 1
    }
  }

  const texture = new THREE.DataTexture(data, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.needsUpdate = true

  const previousTexture = runtime.attributeColorSharedUniforms.valueMap.value
  runtime.attributeColorSharedUniforms.valueMap.value = texture
  runtime.attributeColorSharedUniforms.valueMapSize.value.set(textureSize, textureSize)
  previousTexture.dispose()
}

function resolveBatchedObjectColor(
  runtime: Runtime,
  record: BatchedObjectRecord,
) {
  const attributeColor = runtime.attributeColor
  if (attributeColor) {
    if (attributeColor.mode === 'direct') {
      return attributeColor.directColorsByObjectKey?.[record.key] ?? attributeColor.missingColor
    }

    return '#ffffff'
  }

  if (runtime.showSemanticSurfaces) {
    return '#ffffff'
  }

  return runtime.theme === 'light' ? record.baseColorLight : record.baseColorDark
}

function collectAffectedBatchRecords(
  runtime: Runtime,
  featureIds: Iterable<string>
) {
  const records = new Set<BatchedObjectRecord>()

  for (const featureId of featureIds) {
    if (!featureId) {
      continue
    }

    const featureRecords = runtime.batchedObjectsByFeatureId.get(featureId)
    if (!featureRecords) {
      continue
    }

    for (const record of featureRecords) {
      records.add(record)
    }
  }

  return records
}

function collectAffectedFeatureMeshes(
  runtime: Runtime,
  featureIds: Iterable<string>
) {
  const meshes = new Set<THREE.Mesh>()

  for (const featureId of featureIds) {
    if (!featureId) {
      continue
    }

    const featureMeshes = runtime.meshesByFeatureId.get(featureId)
    if (!featureMeshes) {
      continue
    }

    for (const mesh of featureMeshes) {
      meshes.add(mesh)
    }
  }

  return meshes
}

function rebuildHandles(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
  hideOccludedEditEdges: boolean,
  showVertexGizmo: boolean,
) {
  hideEditWireframe(runtime)
  clearEditPointOverlays(runtime)
  runtime.transform.detach()
  runtime.transform.enabled = false
  runtime.editPivot = null
  runtime.handleGroup.position.set(0, 0, 0)
  runtime.edgeGroup.position.set(0, 0, 0)

  if (!selection.editMode || !selection.selectedFeatureId || !selection.activeObjectId) {
    return
  }

  const feature = data.features.find((candidate) => candidate.id === selection.selectedFeatureId)
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId)
  const objectGeometry = feature && object
    ? resolveDisplayedObjectGeometry(feature, object, selection)
    : null
  const draftVertices = selection.selectedFeatureId
    ? runtime.featureDrafts.get(selection.selectedFeatureId)
    : undefined

  if (!feature || !object || !objectGeometry || !draftVertices) {
    return
  }

  // Re-center edit geometry around the feature's own center to avoid
  // float32 precision jitter when zoomed in close and rotating.
  const editPivot: Vec3 = [
    (feature.extent[0] + feature.extent[3]) * 0.5,
    (feature.extent[1] + feature.extent[4]) * 0.5,
    (feature.extent[2] + feature.extent[5]) * 0.5,
  ]
  runtime.editPivot = editPivot
  runtime.handleGroup.position.set(
    editPivot[0] - data.center[0],
    editPivot[1] - data.center[1],
    editPivot[2] - data.center[2],
  )
  runtime.edgeGroup.position.set(
    editPivot[0] - data.center[0],
    editPivot[1] - data.center[1],
    editPivot[2] - data.center[2],
  )

  rebuildEditWireframe(
    runtime,
    data,
    selection,
    hideOccludedEditEdges,
  )

  runtime.editPoints = buildEditPoints(
    objectGeometry.vertexIndices,
    draftVertices,
    editPivot,
    getViewportPalette(runtime.theme).editPoint,
    5.5,
    hideOccludedEditEdges,
  )
  runtime.handleGroup.add(runtime.editPoints)

  if (selection.selectedVertexIndex != null) {
    const selectedVertex = draftVertices[selection.selectedVertexIndex]
    if (selectedVertex) {
      runtime.selectedEditPoint = buildEditPoints(
        [selection.selectedVertexIndex],
        draftVertices,
        editPivot,
        getViewportPalette(runtime.theme).selectedEditPoint,
        7,
        hideOccludedEditEdges,
      )
      runtime.handleGroup.add(runtime.selectedEditPoint)

      if (showVertexGizmo) {
        runtime.transformProxy = new THREE.Object3D()
        runtime.transformProxy.position.set(
          selectedVertex[0] - editPivot[0],
          selectedVertex[1] - editPivot[1],
          selectedVertex[2] - editPivot[2],
        )
        runtime.handleGroup.add(runtime.transformProxy)
        runtime.transform.attach(runtime.transformProxy)
        runtime.transform.enabled = true
        runtime.transform.setSize(0.8)
      }
    }
  }
}

function rebuildEditWireframe(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
  hideOccludedEditEdges: boolean,
) {
  if (!selection.editMode || !selection.selectedFeatureId || !selection.activeObjectId) {
    return
  }

  const feature = data.features.find((candidate) => candidate.id === selection.selectedFeatureId)
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId)
  const objectGeometry = feature && object
    ? resolveDisplayedObjectGeometry(feature, object, selection)
    : null
  const draftVertices = runtime.featureDrafts.get(selection.selectedFeatureId)

  if (!feature || !object || !objectGeometry || !draftVertices) {
    return
  }

  const edgeCenter = runtime.editPivot ?? data.center
  const palette = getViewportPalette(runtime.theme)
  const edgeSegments = buildEdgeSegments(
    objectGeometry.polygons,
    draftVertices,
    edgeCenter,
    selection.selectedFaceIndex,
    selection.selectedFaceRingIndex,
    selection.selectedVertexIndex,
    {
      base: new THREE.Color(palette.editBaseEdge),
      highlight: new THREE.Color(palette.editHighlightEdge),
      activeRing: new THREE.Color(palette.editActiveRingEdge),
      vertexEdge: new THREE.Color(palette.editVertexEdge),
    },
  )
  ensureEditWireframeObjects(runtime)

  const baseMaterial = runtime.editBaseEdges?.material as LineMaterial | undefined
  if (baseMaterial) {
    baseMaterial.depthTest = hideOccludedEditEdges
    baseMaterial.needsUpdate = true
  }

  const highlightMaterial = runtime.editHighlightEdges?.material as LineMaterial | undefined
  if (highlightMaterial) {
    highlightMaterial.depthTest = selection.selectedFaceIndex == null ? hideOccludedEditEdges : false
    highlightMaterial.needsUpdate = true
  }

  const activeRingMaterial = runtime.editActiveRingEdges?.material as LineMaterial | undefined
  if (activeRingMaterial) {
    activeRingMaterial.depthTest = false
    activeRingMaterial.needsUpdate = true
  }

  setEditWireframeGeometry(runtime.editBaseEdges, edgeSegments.base)
  setEditWireframeGeometry(runtime.editHighlightEdges, edgeSegments.highlight)
  setEditWireframeGeometry(runtime.editActiveRingEdges, edgeSegments.activeRing)
  setEditWireframeGeometry(runtime.editVertexEdges, edgeSegments.vertexEdge, edgeSegments.vertexEdgeInstanceColors)
  setEditWireframeGeometry(
    runtime.editHighlightVertexEdges,
    edgeSegments.highlightVertexEdge,
    edgeSegments.highlightVertexEdgeInstanceColors,
  )
  setEditWireframeGeometry(
    runtime.editActiveRingVertexEdges,
    edgeSegments.activeRingVertexEdge,
    edgeSegments.activeRingVertexEdgeInstanceColors,
  )
}

function ensureEditWireframeObjects(runtime: Runtime) {
  if (!runtime.editBaseEdges) {
    const palette = getViewportPalette(runtime.theme)
    const edgeMaterial = new LineMaterial({
      color: palette.editBaseEdge,
      transparent: true,
      opacity: palette.editBaseOpacity,
      depthTest: true,
      depthWrite: false,
      linewidth: 2.2,
    })
    const edgeLines = new LineSegments2(new LineSegmentsGeometry(), edgeMaterial)
    edgeLines.renderOrder = 20
    edgeLines.visible = false
    runtime.edgeGroup.add(edgeLines)
    runtime.editBaseEdges = edgeLines
  }

  if (!runtime.editHighlightEdges) {
    const palette = getViewportPalette(runtime.theme)
    const highlightMaterial = new LineMaterial({
      color: palette.editHighlightEdge,
      transparent: true,
      opacity: palette.editHighlightOpacity,
      depthTest: true,
      depthWrite: false,
      linewidth: 3.4,
    })
    const highlightLines = new LineSegments2(new LineSegmentsGeometry(), highlightMaterial)
    highlightLines.renderOrder = 21
    highlightLines.visible = false
    runtime.edgeGroup.add(highlightLines)
    runtime.editHighlightEdges = highlightLines
  }

  if (!runtime.editActiveRingEdges) {
    const palette = getViewportPalette(runtime.theme)
    const activeRingMaterial = new LineMaterial({
      color: palette.editActiveRingEdge,
      transparent: true,
      opacity: palette.editActiveRingOpacity,
      depthTest: false,
      depthWrite: false,
      linewidth: 3.8,
    })
    const activeRingLines = new LineSegments2(new LineSegmentsGeometry(), activeRingMaterial)
    activeRingLines.renderOrder = 22
    activeRingLines.visible = false
    runtime.edgeGroup.add(activeRingLines)
    runtime.editActiveRingEdges = activeRingLines
  }

  if (!runtime.editVertexEdges) {
    const palette = getViewportPalette(runtime.theme)
    const vertexEdgeMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: palette.editVertexEdgeOpacity,
      depthTest: false,
      depthWrite: false,
      linewidth: 2.2,
    })
    const vertexEdgeLines = new LineSegments2(new LineSegmentsGeometry(), vertexEdgeMaterial)
    vertexEdgeLines.renderOrder = 23
    vertexEdgeLines.visible = false
    runtime.edgeGroup.add(vertexEdgeLines)
    runtime.editVertexEdges = vertexEdgeLines
  }

  if (!runtime.editHighlightVertexEdges) {
    const palette = getViewportPalette(runtime.theme)
    const highlightVertexEdgeMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: palette.editVertexEdgeOpacity,
      depthTest: false,
      depthWrite: false,
      linewidth: 3.4,
    })
    const highlightVertexEdgeLines = new LineSegments2(new LineSegmentsGeometry(), highlightVertexEdgeMaterial)
    highlightVertexEdgeLines.renderOrder = 24
    highlightVertexEdgeLines.visible = false
    runtime.edgeGroup.add(highlightVertexEdgeLines)
    runtime.editHighlightVertexEdges = highlightVertexEdgeLines
  }

  if (!runtime.editActiveRingVertexEdges) {
    const palette = getViewportPalette(runtime.theme)
    const activeRingVertexEdgeMaterial = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: palette.editVertexEdgeOpacity,
      depthTest: false,
      depthWrite: false,
      linewidth: 3.8,
    })
    const activeRingVertexEdgeLines = new LineSegments2(new LineSegmentsGeometry(), activeRingVertexEdgeMaterial)
    activeRingVertexEdgeLines.renderOrder = 25
    activeRingVertexEdgeLines.visible = false
    runtime.edgeGroup.add(activeRingVertexEdgeLines)
    runtime.editActiveRingVertexEdges = activeRingVertexEdgeLines
  }

  updateEditWireframeResolution(runtime)
}

function updateEditWireframeResolution(runtime: Runtime) {
  const width = runtime.renderer.domElement.clientWidth
  const height = runtime.renderer.domElement.clientHeight

  if (runtime.editBaseEdges) {
    ;(runtime.editBaseEdges.material as LineMaterial).resolution.set(width, height)
  }

  if (runtime.editHighlightEdges) {
    ;(runtime.editHighlightEdges.material as LineMaterial).resolution.set(width, height)
  }

  if (runtime.editActiveRingEdges) {
    ;(runtime.editActiveRingEdges.material as LineMaterial).resolution.set(width, height)
  }

  if (runtime.editVertexEdges) {
    ;(runtime.editVertexEdges.material as LineMaterial).resolution.set(width, height)
  }

  if (runtime.editHighlightVertexEdges) {
    ;(runtime.editHighlightVertexEdges.material as LineMaterial).resolution.set(width, height)
  }

  if (runtime.editActiveRingVertexEdges) {
    ;(runtime.editActiveRingVertexEdges.material as LineMaterial).resolution.set(width, height)
  }
}

function setEditWireframeGeometry(line: LineSegments2 | null, positions: number[], instanceColors?: number[]) {
  if (!line) {
    return
  }

  const nextGeometry = new LineSegmentsGeometry()
  if (positions.length > 0) {
    nextGeometry.setPositions(positions)
    if (instanceColors && instanceColors.length > 0) {
      nextGeometry.setColors(instanceColors)
    }
    line.visible = true
  } else {
    line.visible = false
  }

  line.geometry.dispose()
  line.geometry = nextGeometry
}

function hideEditWireframe(runtime: Runtime) {
  if (runtime.editBaseEdges) {
    runtime.editBaseEdges.visible = false
  }

  if (runtime.editHighlightEdges) {
    runtime.editHighlightEdges.visible = false
  }

  if (runtime.editActiveRingEdges) {
    runtime.editActiveRingEdges.visible = false
  }

  if (runtime.editVertexEdges) {
    runtime.editVertexEdges.visible = false
  }

  if (runtime.editHighlightVertexEdges) {
    runtime.editHighlightVertexEdges.visible = false
  }

  if (runtime.editActiveRingVertexEdges) {
    runtime.editActiveRingVertexEdges.visible = false
  }
}

function buildEditPoints(
  vertexIndices: number[],
  vertices: Vec3[],
  center: Vec3,
  color: string,
  size: number,
  depthTest: boolean,
) {
  const positions: number[] = []

  for (const vertexIndex of vertexIndices) {
    const vertex = vertices[vertexIndex]
    if (!vertex) {
      continue
    }

    positions.push(
      vertex[0] - center[0],
      vertex[1] - center[1],
      vertex[2] - center[2],
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: false,
    depthTest,
    depthWrite: false,
    transparent: true,
    opacity: 0.96,
  })
  const points = new THREE.Points(geometry, material)
  points.userData.vertexIndices = vertexIndices.slice()
  points.renderOrder = 30
  return points
}

function syncEditPointGeometry(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
) {
  if (!selection.selectedFeatureId || !selection.activeObjectId) {
    return
  }

  const feature = data.features.find((candidate) => candidate.id === selection.selectedFeatureId)
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId)
  const objectGeometry = feature && object
    ? resolveDisplayedObjectGeometry(feature, object, selection)
    : null
  const draftVertices = runtime.featureDrafts.get(selection.selectedFeatureId)
  if (!feature || !object || !objectGeometry || !draftVertices) {
    return
  }

  const pointCenter = runtime.editPivot ?? data.center
  updatePointPositions(runtime.editPoints, objectGeometry.vertexIndices, draftVertices, pointCenter)
  updatePointPositions(
    runtime.selectedEditPoint,
    selection.selectedVertexIndex != null ? [selection.selectedVertexIndex] : [],
    draftVertices,
    pointCenter,
  )
}

function updatePointPositions(
  points: THREE.Points | null,
  vertexIndices: number[],
  vertices: Vec3[],
  center: Vec3,
) {
  if (!points) {
    return
  }

  const positions = points.geometry.getAttribute('position')
  if (!(positions instanceof THREE.BufferAttribute)) {
    return
  }

  for (let index = 0; index < vertexIndices.length; index += 1) {
    const vertex = vertices[vertexIndices[index]]
    if (!vertex) {
      continue
    }

    positions.setXYZ(
      index,
      vertex[0] - center[0],
      vertex[1] - center[1],
      vertex[2] - center[2],
    )
  }

  positions.needsUpdate = true
  points.geometry.computeBoundingSphere()
}

function clearEditPointOverlays(runtime: Runtime) {
  if (runtime.editPoints) {
    runtime.editPoints.geometry.dispose()
    ;(runtime.editPoints.material as THREE.Material).dispose()
    runtime.handleGroup.remove(runtime.editPoints)
    runtime.editPoints = null
  }

  if (runtime.selectedEditPoint) {
    runtime.selectedEditPoint.geometry.dispose()
    ;(runtime.selectedEditPoint.material as THREE.Material).dispose()
    runtime.handleGroup.remove(runtime.selectedEditPoint)
    runtime.selectedEditPoint = null
  }

  if (runtime.transformProxy) {
    runtime.handleGroup.remove(runtime.transformProxy)
    runtime.transformProxy = null
  }
}

function renderViewport(runtime: Runtime) {
  updateCameraClipping(runtime)
  syncCameraLightRig(runtime)
  runtime.renderer.clear(true, true, true)
  runtime.renderer.render(runtime.scene, runtime.camera)
  renderSelectionOutline(runtime)
}

function reportViewportCenter(
  runtime: Runtime,
  data: ViewerDataset | null,
  onViewportCenterChange: (center: Vec3 | null) => void,
) {
  if (!data) {
    onViewportCenterChange(null)
    return
  }

  const center = getArcballCenter(runtime.arcball)
  onViewportCenterChange([
    center.x + data.center[0],
    center.y + data.center[1],
    center.z + data.center[2],
  ])
}

function buildEdgeSegments(
  polygons: PolygonRings[],
  vertices: Vec3[],
  center: Vec3,
  selectedFaceIndex: number | null,
  selectedFaceRingIndex: number,
  selectedVertexIndex: number | null,
  edgeColors: {
    base: THREE.Color
    highlight: THREE.Color
    activeRing: THREE.Color
    vertexEdge: THREE.Color
  },
) {
  const base: number[] = []
  const highlight: number[] = []
  const activeRing: number[] = []
  const vertexEdge: number[] = []
  const vertexEdgeInstanceColors: number[] = []
  const highlightVertexEdge: number[] = []
  const highlightVertexEdgeInstanceColors: number[] = []
  const activeRingVertexEdge: number[] = []
  const activeRingVertexEdgeInstanceColors: number[] = []

  for (let polyIndex = 0; polyIndex < polygons.length; polyIndex += 1) {
    const polygon = polygons[polyIndex]
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const ring = polygon[ringIndex]
      if (ring.length < 2) {
        continue
      }

      const isExplicitlyClosed = ring.length > 2 && ring[0] === ring[ring.length - 1]
      const edgeCount = isExplicitlyClosed ? ring.length - 1 : ring.length

      for (let index = 0; index < edgeCount; index += 1) {
        const startIndex = ring[index]
        const endIndex = index + 1 < ring.length ? ring[index + 1] : ring[0]
        const start = vertices[startIndex]
        const end = vertices[endIndex]
        if (!start || !end) {
          continue
        }
        const isSelectedFace = selectedFaceIndex === polyIndex
        const isActiveRing = isSelectedFace && ringIndex === selectedFaceRingIndex
        const touchesSelectedVertex =
          selectedVertexIndex != null &&
          (startIndex === selectedVertexIndex || endIndex === selectedVertexIndex)
        const edgePositions = [
          start[0] - center[0],
          start[1] - center[1],
          start[2] - center[2],
          end[0] - center[0],
          end[1] - center[1],
          end[2] - center[2],
        ]

        if (touchesSelectedVertex) {
          const farColor = isActiveRing
            ? edgeColors.activeRing
            : isSelectedFace
              ? edgeColors.highlight
              : edgeColors.base
          const startIsSelected = startIndex === selectedVertexIndex
          const nearColor = edgeColors.vertexEdge
          const c0 = startIsSelected ? nearColor : farColor
          const c1 = startIsSelected ? farColor : nearColor
          const targetPositions = isActiveRing
            ? activeRingVertexEdge
            : isSelectedFace
              ? highlightVertexEdge
              : vertexEdge
          const targetColors = isActiveRing
            ? activeRingVertexEdgeInstanceColors
            : isSelectedFace
              ? highlightVertexEdgeInstanceColors
              : vertexEdgeInstanceColors
          targetPositions.push(...edgePositions)
          targetColors.push(c0.r, c0.g, c0.b, c1.r, c1.g, c1.b)
        } else if (isActiveRing) {
          activeRing.push(...edgePositions)
        } else if (isSelectedFace) {
          highlight.push(...edgePositions)
        } else {
          base.push(...edgePositions)
        }
      }
    }
  }

  return {
    base,
    highlight,
    activeRing,
    vertexEdge,
    vertexEdgeInstanceColors,
    highlightVertexEdge,
    highlightVertexEdgeInstanceColors,
    activeRingVertexEdge,
    activeRingVertexEdgeInstanceColors,
  }
}

function triangulatePolygon(rings: Vec3[][]) {
  if (rings.length === 1 && rings[0].length === 3) {
    return [[0, 1, 2]]
  }

  const normal = computeNormal(rings[0])
  const { origin, axisU, axisV } = makeBasis(rings[0][0], normal)

  const outer = rings[0].map((vertex) => projectToPlane(vertex, origin, axisU, axisV))
  const holes = rings.slice(1).map((ring) => ring.map((vertex) => projectToPlane(vertex, origin, axisU, axisV)))

  if (holes.length === 0 && outer.length === 4 && isConvexProjectedRing(outer)) {
    return [[0, 1, 2], [0, 2, 3]]
  }

  return THREE.ShapeUtils.triangulateShape(outer, holes)
}

function isConvexProjectedRing(points: THREE.Vector2[]) {
  let sign = 0

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[index]
    const current = points[(index + 1) % points.length]
    const next = points[(index + 2) % points.length]
    const cross =
      (current.x - previous.x) * (next.y - current.y) -
      (current.y - previous.y) * (next.x - current.x)

    if (Math.abs(cross) <= Number.EPSILON) {
      continue
    }

    const currentSign = Math.sign(cross)
    if (sign !== 0 && currentSign !== sign) {
      return false
    }
    sign = currentSign
  }

  return sign !== 0
}

function isConvexIndexedRing(ring: number[], vertices: Vec3[], normal: THREE.Vector3) {
  const ringVertices = collectRingVertices(ring, vertices)
  if (ringVertices.length !== 4) {
    return false
  }

  const { origin, axisU, axisV } = makeBasis(ringVertices[0], normal)
  return isConvexProjectedRing(ringVertices.map((vertex) => projectToPlane(vertex, origin, axisU, axisV)))
}

function isNonPlanarPolygon(rings: Vec3[][], normal: THREE.Vector3) {
  const origin = rings[0]?.[0]
  if (!origin) {
    return false
  }

  let maxDistanceSquared = 0
  for (const ring of rings) {
    for (const vertex of ring) {
      const dx = vertex[0] - origin[0]
      const dy = vertex[1] - origin[1]
      const dz = vertex[2] - origin[2]
      maxDistanceSquared = Math.max(maxDistanceSquared, dx * dx + dy * dy + dz * dz)
    }
  }

  const tolerance = Math.max(
    PLANARITY_DISTANCE_TOLERANCE,
    Math.sqrt(maxDistanceSquared) * PLANARITY_RELATIVE_TOLERANCE,
  )

  for (const ring of rings) {
    for (const vertex of ring) {
      const signedDistance =
        (vertex[0] - origin[0]) * normal.x +
        (vertex[1] - origin[1]) * normal.y +
        (vertex[2] - origin[2]) * normal.z
      if (Math.abs(signedDistance) > tolerance) {
        return true
      }
    }
  }

  return false
}

function computeNormal(points: Vec3[]) {
  let nx = 0
  let ny = 0
  let nz = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    nx += (current[1] - next[1]) * (current[2] + next[2])
    ny += (current[2] - next[2]) * (current[0] + next[0])
    nz += (current[0] - next[0]) * (current[1] + next[1])
  }

  const normal = new THREE.Vector3(nx, ny, nz)
  if (normal.lengthSq() === 0) {
    return new THREE.Vector3(0, 0, 1)
  }

  return normal.normalize()
}

function computeIndexedRingNormal(ring: number[], vertices: Vec3[]) {
  let nx = 0
  let ny = 0
  let nz = 0
  let first: Vec3 | null = null
  let previous: Vec3 | null = null

  for (const index of ring) {
    const current = vertices[index]
    if (!Array.isArray(current)) {
      continue
    }

    if (!first) {
      first = current
    }
    if (previous) {
      nx += (previous[1] - current[1]) * (previous[2] + current[2])
      ny += (previous[2] - current[2]) * (previous[0] + current[0])
      nz += (previous[0] - current[0]) * (previous[1] + current[1])
    }
    previous = current
  }

  if (first && previous) {
    nx += (previous[1] - first[1]) * (previous[2] + first[2])
    ny += (previous[2] - first[2]) * (previous[0] + first[0])
    nz += (previous[0] - first[0]) * (previous[1] + first[1])
  }

  const normal = new THREE.Vector3(nx, ny, nz)
  if (normal.lengthSq() === 0) {
    return new THREE.Vector3(0, 0, 1)
  }

  return normal.normalize()
}

function computeTriangleNormal(first: Vec3, second: Vec3, third: Vec3, fallbackNormal: THREE.Vector3) {
  const ux = second[0] - first[0]
  const uy = second[1] - first[1]
  const uz = second[2] - first[2]
  const vx = third[0] - first[0]
  const vy = third[1] - first[1]
  const vz = third[2] - first[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz)

  if (length === 0) {
    return fallbackNormal
  }

  nx /= length
  ny /= length
  nz /= length

  if (nx * fallbackNormal.x + ny * fallbackNormal.y + nz * fallbackNormal.z < 0) {
    nx *= -1
    ny *= -1
    nz *= -1
  }

  return new THREE.Vector3(nx, ny, nz)
}

function makeBasis(originPoint: Vec3, normal: THREE.Vector3) {
  const origin = new THREE.Vector3(originPoint[0], originPoint[1], originPoint[2])
  const tangentSeed = Math.abs(normal.z) > 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  const axisU = new THREE.Vector3().crossVectors(normal, tangentSeed).normalize()
  const axisV = new THREE.Vector3().crossVectors(normal, axisU).normalize()

  return { origin, axisU, axisV }
}

function projectToPlane(
  point: Vec3,
  origin: THREE.Vector3,
  axisU: THREE.Vector3,
  axisV: THREE.Vector3,
) {
  const vector = new THREE.Vector3(point[0], point[1], point[2]).sub(origin)
  return new THREE.Vector2(vector.dot(axisU), vector.dot(axisV))
}

function fitCameraToDataset(runtime: Runtime, data: ViewerDataset) {
  const sizeX = data.extent[3] - data.extent[0]
  const sizeY = data.extent[4] - data.extent[1]
  const sizeZ = data.extent[5] - data.extent[2]
  const size = Math.max(sizeX, sizeY, sizeZ)
  const focusPoint = new THREE.Vector3(0, 0, size * 0.15)
  const direction = new THREE.Vector3(0.75, -1.35, 0.85).normalize()
  const distance =
    size * 1.76 * lensDistanceScale(runtime.camera.fov)

  runtime.camera.position.copy(focusPoint).add(direction.multiplyScalar(distance))
  runtime.camera.lookAt(focusPoint)
  runtime.camera.updateMatrix()
  runtime.camera.updateMatrixWorld(true)
  runtime.arcball.minDistance = Math.max(size * 0.000002, 0.001)
  runtime.arcball.maxDistance = size * 18
  syncArcballState(runtime, focusPoint)
  updateCameraClipping(runtime)
}

function centerViewOnFeature(
  runtime: Runtime,
  data: ViewerDataset,
  feature: ViewerFeature,
) {
  const extent = feature.extent
  const center = localCenterFromExtent(extent, data.center)
  const direction = getCurrentViewDirection(runtime)
  const sizeX = extent[3] - extent[0]
  const sizeY = extent[4] - extent[1]
  const sizeZ = extent[5] - extent[2]
  const featureSize = Math.max(sizeX, sizeY, sizeZ)
  const baseDistance = Math.max(featureSize * 2.4, runtime.sceneScale * 0.06, 8)
  const distance = baseDistance * lensDistanceScale(runtime.camera.fov)

  const nextPosition = center.clone().add(direction.multiplyScalar(distance))
  setArcballPose(runtime, center, nextPosition)
}

function centerViewOnVertex(
  runtime: Runtime,
  data: ViewerDataset,
  focusTarget: Extract<ViewerFocusTarget, { kind: 'vertex' }>,
) {
  const feature = data.features.find((candidate) => candidate.id === focusTarget.featureId)
  if (!feature) {
    return
  }

  const vertex = feature.vertices[focusTarget.vertexIndex]
  if (!vertex) {
    return
  }

  const center = new THREE.Vector3(
    vertex[0] - data.center[0],
    vertex[1] - data.center[1],
    vertex[2] - data.center[2],
  )
  const currentCenter = getArcballCenter(runtime.arcball).clone()
  const cameraOffset = runtime.camera.position.clone().sub(currentCenter)
  const nextPosition = center.clone().add(cameraOffset)
  setArcballPose(runtime, center, nextPosition)
}

function centerViewOnValidationError(
  runtime: Runtime,
  data: ViewerDataset,
  focusTarget: Extract<ViewerFocusTarget, { kind: 'error' }>,
  selection: ViewSelection,
) {
  const feature = data.features.find((candidate) => candidate.id === focusTarget.featureId)
  if (!feature) {
    return
  }

  const object = focusTarget.objectId
    ? feature.objects.find((candidate) => candidate.id === focusTarget.objectId)
    : null
  const focusedGeometryIndex =
    object
      ? focusTarget.geometryIndex ??
        resolveObjectGeometryIndex(
          object,
          selection.geometryDisplayMode,
          selection.selectedFeatureId === focusTarget.featureId && selection.activeObjectId === focusTarget.objectId
            ? selection.activeGeometryIndex
            : null,
        )
      : null
  const objectGeometry = getObjectGeometryByIndex(object, focusedGeometryIndex)

  const face =
    objectGeometry && focusTarget.faceIndex != null ? objectGeometry.polygons[focusTarget.faceIndex] ?? null : null
  const faceExtent = face
    ? extentFromVertexIndices(uniqueVertexIndices(face), feature.vertices)
    : null
  const objectExtent =
    objectGeometry ? extentFromVertexIndices(objectGeometry.vertexIndices, feature.vertices) : null
  const featureSize = extentMaxDimension(feature.extent)
  const objectSize = objectExtent ? extentMaxDimension(objectExtent) : featureSize
  const preserveCameraOffset = focusTarget.preserveCameraOffset === true

  if (faceExtent) {
    if (preserveCameraOffset) {
      centerViewOnExtentPreservingOffset(runtime, data, faceExtent)
    } else {
      centerViewOnExtent(runtime, data, faceExtent, Math.max(objectSize * 0.35, runtime.sceneScale * 0.015, 3))
    }
    return
  }

  if (focusTarget.location) {
    const center = new THREE.Vector3(
      focusTarget.location[0] - data.center[0],
      focusTarget.location[1] - data.center[1],
      focusTarget.location[2] - data.center[2],
    )
    const nextPosition = preserveCameraOffset
      ? center.clone().add(runtime.camera.position.clone().sub(getArcballCenter(runtime.arcball).clone()))
      : center.clone().add(
          getCurrentViewDirection(runtime).multiplyScalar(
            Math.max(objectSize * 0.85, featureSize * 0.18, runtime.sceneScale * 0.02, 4) *
              lensDistanceScale(runtime.camera.fov),
          ),
        )
    setArcballPose(runtime, center, nextPosition)
    return
  }

  if (objectExtent) {
    if (preserveCameraOffset) {
      centerViewOnExtentPreservingOffset(runtime, data, objectExtent)
    } else {
      centerViewOnExtent(runtime, data, objectExtent, Math.max(objectSize * 0.35, runtime.sceneScale * 0.015, 3))
    }
    return
  }

  centerViewOnFeature(runtime, data, feature)
}

function centerViewOnExtent(
  runtime: Runtime,
  data: ViewerDataset,
  extent: ViewerFeature['extent'],
  minimumDistance: number,
) {
  const center = localCenterFromExtent(extent, data.center)
  const direction = getCurrentViewDirection(runtime)
  const sizeX = extent[3] - extent[0]
  const sizeY = extent[4] - extent[1]
  const sizeZ = extent[5] - extent[2]
  const targetSize = Math.max(sizeX, sizeY, sizeZ)
  const baseDistance = Math.max(targetSize * 4.2, minimumDistance)
  const distance = baseDistance * lensDistanceScale(runtime.camera.fov)
  const nextPosition = center.clone().add(direction.multiplyScalar(distance))
  setArcballPose(runtime, center, nextPosition)
}

function centerViewOnExtentPreservingOffset(
  runtime: Runtime,
  data: ViewerDataset,
  extent: ViewerFeature['extent'],
) {
  const center = localCenterFromExtent(extent, data.center)
  const currentCenter = getArcballCenter(runtime.arcball).clone()
  const cameraOffset = runtime.camera.position.clone().sub(currentCenter)
  const nextPosition = center.clone().add(cameraOffset)
  setArcballPose(runtime, center, nextPosition)
}

function createMaterial(objectType: string, theme: Theme, semanticMode = false) {
  const baseColor = semanticMode ? '#64748b' : baseColorForType(objectType, theme)
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.82,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })

  if (semanticMode) {
    material.userData.isSemanticBase = true
    material.userData.semanticColor = baseColor
  }

  return material
}

function applyAttributeColorToScene(runtime: Runtime) {
  for (const [key, mesh] of runtime.meshesByObjectKey.entries()) {
    const value = runtime.attributeColor?.valuesByObjectKey[key] ?? null
    const directColor = runtime.attributeColor?.directColorsByObjectKey?.[key] ?? null
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        applyAttributeColorToMaterial(
          material,
          runtime.attributeColor,
          value,
          directColor,
          runtime.attributeColorSharedUniforms,
        )
      }
    }
  }
}

function applyAttributeColorToMaterial(
  material: THREE.MeshStandardMaterial,
  attributeColor: ViewerAttributeColorState | null,
  value: number | null,
  directColor: string | null,
  sharedUniforms: AttributeColorSharedUniforms,
) {
  if (material.userData.isError || material.userData.isSemantic || material.userData.isSemanticBase) {
    return
  }

  const existingUniforms = material.userData.attributeColorUniforms as AttributeColorUniforms | undefined
  if (!attributeColor && !existingUniforms) {
    return
  }

  const uniforms = existingUniforms ?? ensureAttributeColorUniforms(material, sharedUniforms)
  uniforms.value.value = value ?? 0
  uniforms.hasValue.value = value == null ? 0 : 1
  uniforms.directColor.value.set(directColor ?? attributeColor?.missingColor ?? '#94a3b8')
}

function applyBatchedSemanticColoringToMaterial(
  material: THREE.MeshStandardMaterial,
  semanticUniforms: SemanticSurfaceSharedUniforms,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSemanticSurfaceEnabled = semanticUniforms.enabled
    shader.uniforms.uSemanticSurfaceColors = semanticUniforms.colors
    shader.vertexShader = `
      attribute float semanticSurfaceTypeId;
      varying float vSemanticSurfaceTypeId;
    ${shader.vertexShader}`.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      vSemanticSurfaceTypeId = semanticSurfaceTypeId;
      `,
    )
    shader.fragmentShader = `
      uniform float uSemanticSurfaceEnabled;
      uniform vec3 uSemanticSurfaceColors[${SEMANTIC_SURFACE_COLOR_SLOT_COUNT}];
      varying float vSemanticSurfaceTypeId;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      if (uSemanticSurfaceEnabled > 0.5) {
        vec3 semanticInstanceTint = diffuseColor.rgb;
        int semanticSurfaceTypeIndex = int(clamp(
          floor(vSemanticSurfaceTypeId + 0.5),
          0.0,
          float(${SEMANTIC_SURFACE_COLOR_SLOT_COUNT - 1})
        ));
        diffuseColor.rgb = uSemanticSurfaceColors[semanticSurfaceTypeIndex] * semanticInstanceTint;
      }
      `,
    )
  }
  material.customProgramCacheKey = () => 'batched-semantic-color-v1'
  material.needsUpdate = true
}

function applyBatchedContinuousAttributeColorToMaterial(
  material: THREE.MeshStandardMaterial,
  sharedUniforms: AttributeColorSharedUniforms,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAttributeColorEnabled = sharedUniforms.enabled
    shader.uniforms.uAttributeColorMin = sharedUniforms.min
    shader.uniforms.uAttributeColorMax = sharedUniforms.max
    shader.uniforms.uAttributeColorStops = sharedUniforms.colors
    shader.uniforms.uAttributeColorMissing = sharedUniforms.missingColor
    shader.uniforms.uAttributeColorValueMap = sharedUniforms.valueMap
    shader.uniforms.uAttributeColorValueMapSize = sharedUniforms.valueMapSize
    shader.vertexShader = `
      attribute float shaderObjectId;
      varying float vShaderObjectId;
    ${shader.vertexShader}`.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      vShaderObjectId = shaderObjectId;
      `,
    )
    shader.fragmentShader = `
      uniform float uAttributeColorEnabled;
      uniform float uAttributeColorMin;
      uniform float uAttributeColorMax;
      uniform vec3 uAttributeColorStops[${ATTRIBUTE_COLOR_STOP_COUNT}];
      uniform vec3 uAttributeColorMissing;
      uniform sampler2D uAttributeColorValueMap;
      uniform vec2 uAttributeColorValueMapSize;
      varying float vShaderObjectId;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      if (uAttributeColorEnabled > 0.5) {
        float attributeObjectId = floor(vShaderObjectId + 0.5);
        vec2 attributeMapUv = (
          vec2(
            mod(attributeObjectId, uAttributeColorValueMapSize.x),
            floor(attributeObjectId / uAttributeColorValueMapSize.x)
          ) + 0.5
        ) / uAttributeColorValueMapSize;
        vec4 attributeValueSample = texture2D(uAttributeColorValueMap, attributeMapUv);
        if (attributeValueSample.g < 0.5) {
          diffuseColor.rgb = uAttributeColorMissing;
        } else {
          float attributeValue = attributeValueSample.r;
          float attributeRange = max(uAttributeColorMax - uAttributeColorMin, 0.000001);
          float attributeT = clamp((attributeValue - uAttributeColorMin) / attributeRange, 0.0, 1.0);
          float attributeMapPosition = attributeT * float(${ATTRIBUTE_COLOR_STOP_COUNT - 1});
          float attributeStopFloor = min(floor(attributeMapPosition), float(${ATTRIBUTE_COLOR_STOP_COUNT - 2}));
          int attributeStopIndex = int(attributeStopFloor);
          float attributeMix = attributeMapPosition - attributeStopFloor;
          diffuseColor.rgb = mix(
            uAttributeColorStops[attributeStopIndex],
            uAttributeColorStops[attributeStopIndex + 1],
            attributeMix
          );
        }
      }
      `,
    )
  }
  material.customProgramCacheKey = () => 'batched-continuous-attribute-texture-v1'
  material.needsUpdate = true
}

function createAttributeColorSharedUniforms(): AttributeColorSharedUniforms {
  const valueMap = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  valueMap.magFilter = THREE.NearestFilter
  valueMap.minFilter = THREE.NearestFilter
  valueMap.wrapS = THREE.ClampToEdgeWrapping
  valueMap.wrapT = THREE.ClampToEdgeWrapping
  valueMap.generateMipmaps = false
  valueMap.needsUpdate = true

  return {
    enabled: { value: 0 },
    direct: { value: 0 },
    min: { value: 0 },
    max: { value: 1 },
    colors: {
      value: Array.from({ length: ATTRIBUTE_COLOR_STOP_COUNT }, () => new THREE.Color('#440154')),
    },
    missingColor: { value: new THREE.Color('#94a3b8') },
    valueMap: { value: valueMap },
    valueMapSize: { value: new THREE.Vector2(1, 1) },
  }
}

function createSemanticSurfaceSharedUniforms(): SemanticSurfaceSharedUniforms {
  const colors = Array.from(
    { length: SEMANTIC_SURFACE_COLOR_SLOT_COUNT },
    () => new THREE.Color('#64748b'),
  )
  return {
    enabled: { value: 0 },
    colors: { value: colors },
  }
}

function syncSemanticSurfaceSharedUniforms(runtime: Runtime, data: ViewerDataset) {
  runtime.semanticSurfaceSharedUniforms.enabled.value = runtime.showSemanticSurfaces ? 1 : 0
  runtime.semanticSurfaceTypeIds.clear()

  const colors = runtime.semanticSurfaceSharedUniforms.colors.value
  for (const color of colors) {
    color.set('#64748b')
  }

  let nextTypeId = 1
  for (const feature of data.features) {
    for (const object of feature.objects) {
      for (const geometry of object.geometries) {
        for (const surface of geometry.semanticSurfaces) {
          if (!surface || nextTypeId >= SEMANTIC_SURFACE_COLOR_SLOT_COUNT) {
            continue
          }

          const key = semanticSurfaceTypeKey(surface.type)
          if (runtime.semanticSurfaceTypeIds.has(key)) {
            continue
          }

          runtime.semanticSurfaceTypeIds.set(key, nextTypeId)
          colors[nextTypeId]?.set(semanticSurfaceColor(surface.type))
          nextTypeId += 1
        }
      }
    }
  }
}

function getShaderObjectId(runtime: Runtime, objectKey: string) {
  const existing = runtime.shaderObjectIdsByObjectKey.get(objectKey)
  if (existing != null) {
    return existing
  }

  const nextId = runtime.nextShaderObjectId++
  runtime.shaderObjectIdsByObjectKey.set(objectKey, nextId)
  return nextId
}

function semanticSurfaceTypeKey(surfaceType: string) {
  return surfaceType.trim().toLowerCase()
}

function syncAttributeColorSharedUniforms(
  uniforms: AttributeColorSharedUniforms,
  attributeColor: ViewerAttributeColorState | null,
) {
  uniforms.enabled.value = attributeColor ? 1 : 0
  if (!attributeColor) {
    return
  }

  uniforms.min.value = attributeColor.domainMin
  uniforms.max.value = attributeColor.domainMax
  uniforms.direct.value = attributeColor.mode === 'direct' ? 1 : 0
  syncAttributeColorStops(uniforms.colors.value, attributeColor.colors)
  uniforms.missingColor.value.set(attributeColor.missingColor)
}

function ensureAttributeColorUniforms(
  material: THREE.MeshStandardMaterial,
  sharedUniforms: AttributeColorSharedUniforms,
): AttributeColorUniforms {
  const existing = material.userData.attributeColorUniforms as AttributeColorUniforms | undefined
  if (existing) {
    return existing
  }

  const uniforms: AttributeColorUniforms = {
    value: { value: 0 },
    hasValue: { value: 0 },
    directColor: { value: new THREE.Color('#94a3b8') },
  }

  material.userData.attributeColorUniforms = uniforms
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAttributeColorEnabled = sharedUniforms.enabled
    shader.uniforms.uAttributeColorValue = uniforms.value
    shader.uniforms.uAttributeColorHasValue = uniforms.hasValue
    shader.uniforms.uAttributeColorDirect = sharedUniforms.direct
    shader.uniforms.uAttributeColorDirectColor = uniforms.directColor
    shader.uniforms.uAttributeColorMin = sharedUniforms.min
    shader.uniforms.uAttributeColorMax = sharedUniforms.max
    shader.uniforms.uAttributeColorStops = sharedUniforms.colors
    shader.uniforms.uAttributeColorMissing = sharedUniforms.missingColor
    shader.fragmentShader = `
      uniform float uAttributeColorEnabled;
      uniform float uAttributeColorValue;
      uniform float uAttributeColorHasValue;
      uniform float uAttributeColorDirect;
      uniform vec3 uAttributeColorDirectColor;
      uniform float uAttributeColorMin;
      uniform float uAttributeColorMax;
      uniform vec3 uAttributeColorStops[${ATTRIBUTE_COLOR_STOP_COUNT}];
      uniform vec3 uAttributeColorMissing;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      if (uAttributeColorEnabled > 0.5) {
        if (uAttributeColorHasValue < 0.5) {
          diffuseColor.rgb = uAttributeColorMissing;
        } else if (uAttributeColorDirect > 0.5) {
          diffuseColor.rgb = uAttributeColorDirectColor;
        } else {
          float attributeRange = max(uAttributeColorMax - uAttributeColorMin, 0.000001);
          float attributeT = clamp((uAttributeColorValue - uAttributeColorMin) / attributeRange, 0.0, 1.0);
          float attributeMapPosition = attributeT * float(${ATTRIBUTE_COLOR_STOP_COUNT - 1});
          float attributeStopFloor = min(floor(attributeMapPosition), float(${ATTRIBUTE_COLOR_STOP_COUNT - 2}));
          int attributeStopIndex = int(attributeStopFloor);
          float attributeMix = attributeMapPosition - attributeStopFloor;
          diffuseColor.rgb = mix(
            uAttributeColorStops[attributeStopIndex],
            uAttributeColorStops[attributeStopIndex + 1],
            attributeMix
          );
        }
      }
      `,
    )
  }
  material.customProgramCacheKey = () => 'attribute-color-v4'
  material.needsUpdate = true
  return uniforms
}

function syncAttributeColorStops(target: THREE.Color[], colors: readonly string[]) {
  const fallback = colors[0] ?? '#440154'
  for (let index = 0; index < ATTRIBUTE_COLOR_STOP_COUNT; index += 1) {
    target[index]?.set(colors[index] ?? fallback)
  }
}

function baseColorForType(objectType: string, theme: Theme) {
  const key = objectType.trim().toLowerCase()
  const matchedColor = OBJECT_TYPE_COLORS[theme][key]
  if (matchedColor) {
    return matchedColor
  }

  const fallbackPalette = FALLBACK_OBJECT_TYPE_COLORS[theme]
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash += key.charCodeAt(index)
  }
  return fallbackPalette[hash % fallbackPalette.length]
}

function createErrorMaterial(color: string) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.08,
    roughness: 0.64,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  mat.userData.isError = true
  return mat
}

function createSemanticMaterial(color: string) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  mat.userData.isSemantic = true
  mat.userData.semanticColor = color
  return mat
}

function applyViewportTheme(runtime: Runtime, theme: Theme) {
  const palette = getViewportPalette(theme)

  if (runtime.scene.fog instanceof THREE.FogExp2) {
    runtime.scene.fog.color.set(palette.fog)
    runtime.scene.fog.density = palette.fogDensity
  }

  runtime.ambientLight.color.set(palette.ambient)
  runtime.ambientLight.intensity = palette.ambientIntensity
  runtime.hemisphereLight.color.set(palette.hemisphereSky)
  runtime.hemisphereLight.groundColor.set(palette.hemisphereGround)
  runtime.hemisphereLight.intensity = palette.hemisphereIntensity
  runtime.keyLight.color.set(palette.keyLight)
  runtime.keyLight.intensity = palette.keyIntensity
  runtime.fillLight.color.set(palette.fillLight)
  runtime.fillLight.intensity = palette.fillIntensity
  runtime.rimLight.color.set(palette.rimLight)
  runtime.rimLight.intensity = palette.rimIntensity
  runtime.renderer.toneMappingExposure = palette.exposure

  const edgeMaterial = runtime.editBaseEdges?.material as LineMaterial | undefined
  if (edgeMaterial) {
    edgeMaterial.color.set(palette.editBaseEdge)
    edgeMaterial.opacity = palette.editBaseOpacity
    edgeMaterial.needsUpdate = true
  }

  const highlightMaterial = runtime.editHighlightEdges?.material as LineMaterial | undefined
  if (highlightMaterial) {
    highlightMaterial.color.set(palette.editHighlightEdge)
    highlightMaterial.opacity = palette.editHighlightOpacity
    highlightMaterial.needsUpdate = true
  }

  const activeRingMaterial = runtime.editActiveRingEdges?.material as LineMaterial | undefined
  if (activeRingMaterial) {
    activeRingMaterial.color.set(palette.editActiveRingEdge)
    activeRingMaterial.opacity = palette.editActiveRingOpacity
    activeRingMaterial.needsUpdate = true
  }

  const vertexEdgeMaterial = runtime.editVertexEdges?.material as LineMaterial | undefined
  if (vertexEdgeMaterial) {
    vertexEdgeMaterial.opacity = palette.editVertexEdgeOpacity
    vertexEdgeMaterial.needsUpdate = true
  }

  const highlightVertexEdgeMaterial = runtime.editHighlightVertexEdges?.material as LineMaterial | undefined
  if (highlightVertexEdgeMaterial) {
    highlightVertexEdgeMaterial.opacity = palette.editVertexEdgeOpacity
    highlightVertexEdgeMaterial.needsUpdate = true
  }

  const activeRingVertexEdgeMaterial = runtime.editActiveRingVertexEdges?.material as LineMaterial | undefined
  if (activeRingVertexEdgeMaterial) {
    activeRingVertexEdgeMaterial.opacity = palette.editVertexEdgeOpacity
    activeRingVertexEdgeMaterial.needsUpdate = true
  }
}

function getViewportPalette(theme: Theme) {
  if (theme === 'light') {
    return {
      fog: '#d9e1e8',
      fogDensity: VIEWPORT_FOG_DENSITY.light,
      ambient: '#f6f7f9',
      ambientIntensity: 0.82,
      hemisphereSky: '#eef2f5',
      hemisphereGround: '#7a8794',
      hemisphereIntensity: 0.44,
      keyLight: '#fff3e3',
      keyIntensity: 1.32,
      fillLight: '#d4dee8',
      fillIntensity: 0.34,
      rimLight: '#f7fbff',
      rimIntensity: 0.42,
      exposure: 0.96,
      baseEmissive: '#000000',
      baseEmissiveIntensity: 0,
      errorEmissive: '#000000',
      errorIntensity: 0.08,
      editPoint: '#f8fafc',
      selectedEditPoint: '#06b6d4',
      editBaseEdge: '#eef2f7',
      editBaseOpacity: 0.72,
      editHighlightEdge: '#f8fafc',
      editHighlightOpacity: 0.96,
      editActiveRingEdge: '#60a5fa',
      editActiveRingOpacity: 1,
      editVertexEdge: '#0f2f66',
      editVertexEdgeOpacity: 1,
    }
  }

  return {
    fog: '#061120',
    fogDensity: VIEWPORT_FOG_DENSITY.dark,
    ambient: '#edf2f7',
    ambientIntensity: 0.62,
    hemisphereSky: '#dfe7ef',
    hemisphereGround: '#101923',
    hemisphereIntensity: 0.42,
    keyLight: '#fff3df',
    keyIntensity: 1.24,
    fillLight: '#cad7e2',
    fillIntensity: 0.28,
    rimLight: '#edf4fb',
    rimIntensity: 0.56,
    exposure: 0.9,
    baseEmissive: '#000000',
    baseEmissiveIntensity: 0,
    errorEmissive: '#000000',
    errorIntensity: 0.08,
    editPoint: '#f8fafc',
    selectedEditPoint: '#06b6d4',
    editBaseEdge: '#eef2f7',
    editBaseOpacity: 0.45,
    editHighlightEdge: '#f8fafc',
    editHighlightOpacity: 0.95,
    editActiveRingEdge: '#60a5fa',
    editActiveRingOpacity: 1,
    editVertexEdge: '#0f2f66',
    editVertexEdgeOpacity: 1,
  }
}

function computeFaceErrorGroups(
  errors: ViewerValidationError[],
  objectId: string,
  geometryIndex: number,
  sourceFaceIndices: number[],
): { faceGroups: Map<number, number>; groupColors: Map<number, string> } {
  const codeToGroup = new Map<number, number>()
  let nextGroup = 1
  const faceGroups = new Map<number, number>()
  const groupColors = new Map<number, string>()

  for (const error of errors) {
    if (
      error.cityObjectId !== objectId ||
      error.faceIndex == null ||
      (error.geometryIndex != null && error.geometryIndex !== geometryIndex)
    ) {
      continue
    }

    const currentFaceIndex = getCurrentFaceIndexForSourceFace(sourceFaceIndices, error.faceIndex)
    if (currentFaceIndex == null || faceGroups.has(currentFaceIndex)) {
      continue
    }

    let group = codeToGroup.get(error.code)
    if (group == null) {
      group = nextGroup++
      codeToGroup.set(error.code, group)
      groupColors.set(group, errorColor(error.code))
    }
    faceGroups.set(currentFaceIndex, group)
  }

  return { faceGroups, groupColors }
}

function getCurrentFaceIndexForSourceFace(sourceFaceIndices: number[], sourceFaceIndex: number) {
  const currentFaceIndex = sourceFaceIndices.indexOf(sourceFaceIndex)
  return currentFaceIndex >= 0 ? currentFaceIndex : null
}

function computeFaceSemanticGroups(
  semanticSurfaces: Array<ViewerSemanticSurface | null>,
): { faceGroups: Map<number, number>; groupColors: Map<number, string> } {
  const typeToGroup = new Map<string, number>()
  const faceGroups = new Map<number, number>()
  const groupColors = new Map<number, string>()
  let nextGroup = 1

  semanticSurfaces.forEach((surface, faceIndex) => {
    if (!surface) {
      return
    }

    let group = typeToGroup.get(surface.type)
    if (group == null) {
      group = nextGroup++
      typeToGroup.set(surface.type, group)
      groupColors.set(group, semanticSurfaceColor(surface.type))
    }

    faceGroups.set(faceIndex, group)
  })

  return { faceGroups, groupColors }
}

function buildMaterialArray(
  baseMaterial: THREE.MeshStandardMaterial,
  groupColors: Map<number, string>,
  createGroupMaterial: (color: string) => THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial[] {
  if (groupColors.size === 0) {
    return [baseMaterial]
  }
  const maxGroup = Math.max(...groupColors.keys())
  const materials: THREE.MeshStandardMaterial[] = [baseMaterial]
  for (let i = 1; i <= maxGroup; i++) {
    const color = groupColors.get(i)
    materials.push(color ? createGroupMaterial(color) : baseMaterial)
  }
  return materials
}

function updateRaycastPointer(runtime: Runtime, event: MouseEvent) {
  const rect = runtime.renderer.domElement.getBoundingClientRect()
  runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  runtime.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera)
}

function getPickableObjects(runtime: Runtime) {
  return [
    ...[...runtime.meshesByObjectKey.values()].filter((mesh) => mesh.visible),
    ...runtime.batchedMeshes.filter((batch) => batch.visible),
  ]
}

function resolveObjectHit(hit: THREE.Intersection) {
  const batchId = (hit as THREE.Intersection & { batchId?: number }).batchId
  if (typeof batchId === 'number' && hit.object instanceof THREE.BatchedMesh) {
    const recordsByInstanceId = hit.object.userData.recordsByInstanceId as Map<number, BatchedObjectRecord> | undefined
    const record = recordsByInstanceId?.get(batchId) ?? null
    if (!record) {
      return null
    }

    const geometryRange = hit.object.getGeometryRangeAt(record.geometryId)
    if (!geometryRange) {
      return null
    }
    const localFaceIndex = typeof hit.faceIndex === 'number'
      ? hit.faceIndex - Math.floor((geometryRange.start ?? 0) / 3)
      : null
    const faceIndex =
      localFaceIndex != null && localFaceIndex >= 0
        ? record.triangleFaceIndices[localFaceIndex] ?? null
        : null
    return {
      key: record.key,
      featureId: record.featureId,
      objectId: record.objectId,
      geometryIndex: record.geometryIndex,
      faceIndex,
    }
  }

  if (hit.object instanceof THREE.Mesh) {
    const triangleFaceIndices = (hit.object.userData.triangleFaceIndices as TriangleFaceIndices | undefined) ?? []
    const featureId = hit.object.userData.featureId as string | undefined
    const objectId = hit.object.userData.objectId as string | undefined
    if (!featureId || !objectId) {
      return null
    }

    return {
      key: viewerObjectKey(featureId, objectId),
      featureId,
      objectId,
      geometryIndex: hit.object.userData.geometryIndex as number | null | undefined,
      faceIndex:
        typeof hit.faceIndex === 'number'
          ? triangleFaceIndices[hit.faceIndex] ?? null
          : null,
    }
  }

  return null
}

function getDatasetViewKey(data: ViewerDataset) {
  const firstId = data.features[0]?.id ?? ''
  const lastId = data.features.at(-1)?.id ?? ''
  return `${data.sourceName}:${data.features.length}:${firstId}:${lastId}`
}

function setArcballPose(runtime: Runtime, center: THREE.Vector3, cameraPosition: THREE.Vector3) {
  runtime.camera.position.copy(cameraPosition)
  syncArcballState(runtime, center)
}

function syncArcballState(runtime: Runtime, center = getArcballCenter(runtime.arcball).clone()) {
  const internals = getArcballInternals(runtime.arcball)
  const target = getArcballTarget(runtime.arcball)

  target.copy(center)
  internals._currentTarget.copy(center)
  internals._gizmos.position.copy(center)
  internals._gizmos.updateMatrix()
  runtime.camera.updateMatrix()
  runtime.camera.updateMatrixWorld(true)
  internals._tbRadius = internals.calculateTbRadius(runtime.camera)
  internals.makeGizmos(center, internals._tbRadius)
  internals.updateMatrixState()
}

function getArcballTarget(arcball: ArcballControls) {
  return (arcball as ArcballControls & { target: THREE.Vector3 }).target
}

function getArcballInternals(arcball: ArcballControls) {
  return arcball as ArcballControls & {
    _currentTarget: THREE.Vector3
    _gizmos: THREE.Group
    _tbRadius: number
    calculateTbRadius: (camera: THREE.Camera) => number
    makeGizmos: (center: THREE.Vector3, radius: number) => void
    updateMatrixState: () => void
  }
}

function getArcballCenter(arcball: ArcballControls) {
  return getArcballInternals(arcball)._gizmos.position
}

function lensDistanceScale(verticalFovDegrees: number) {
  const referenceFovRadians = THREE.MathUtils.degToRad(50)
  const currentFovRadians = THREE.MathUtils.degToRad(verticalFovDegrees)
  return Math.tan(referenceFovRadians / 2) / Math.tan(currentFovRadians / 2)
}

function findNearestEditVertexIndexOnScreen(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
  event: MouseEvent,
  respectOcclusion: boolean,
) {
  if (!selection.selectedFeatureId || !selection.activeObjectId) {
    return null
  }

  const feature = data.features.find((candidate) => candidate.id === selection.selectedFeatureId) ?? null
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId) ?? null
  const objectGeometry = feature && object
    ? resolveDisplayedObjectGeometry(feature, object, selection)
    : null
  const draftVertices = runtime.featureDrafts.get(selection.selectedFeatureId)
  if (!objectGeometry || !draftVertices) {
    return null
  }

  const rect = runtime.renderer.domElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }

  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const radiusSquared = EDIT_VERTEX_PICK_RADIUS_PIXELS * EDIT_VERTEX_PICK_RADIUS_PIXELS
  const scenePoint = new THREE.Vector3()
  const projectedPoint = new THREE.Vector3()
  const candidates: Array<{
    vertexIndex: number
    distanceSquared: number
    scenePoint: THREE.Vector3
  }> = []

  for (const vertexIndex of objectGeometry.vertexIndices) {
    const vertex = draftVertices[vertexIndex]
    if (!vertex) {
      continue
    }

    scenePoint.set(
      vertex[0] - data.center[0],
      vertex[1] - data.center[1],
      vertex[2] - data.center[2],
    )
    projectedPoint.copy(scenePoint).project(runtime.camera)
    if (projectedPoint.z < -1 || projectedPoint.z > 1) {
      continue
    }

    const screenX = (projectedPoint.x * 0.5 + 0.5) * rect.width
    const screenY = (-projectedPoint.y * 0.5 + 0.5) * rect.height
    const dx = screenX - pointerX
    const dy = screenY - pointerY
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared <= radiusSquared) {
      candidates.push({
        vertexIndex,
        distanceSquared,
        scenePoint: scenePoint.clone(),
      })
    }
  }

  candidates.sort((left, right) => left.distanceSquared - right.distanceSquared)
  for (const candidate of candidates) {
    if (!respectOcclusion || isScenePointVisibleFromCamera(runtime, candidate.scenePoint)) {
      return candidate.vertexIndex
    }
  }

  return null
}

function isScenePointVisibleFromCamera(runtime: Runtime, scenePoint: THREE.Vector3) {
  const ndc = scenePoint.clone().project(runtime.camera)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), runtime.camera)
  const hits = raycaster.intersectObjects(getPickableObjects(runtime), false)
  if (hits.length === 0) {
    return true
  }

  const candidateDistance = runtime.camera.position.distanceTo(scenePoint)
  const tolerance = Math.max(runtime.sceneScale * 1e-6, 0.01)
  return hits[0].distance >= candidateDistance - tolerance
}

function updateCameraClipping(runtime: Runtime) {
  const center = getArcballCenter(runtime.arcball)
  const distance = Math.max(runtime.camera.position.distanceTo(center), 0.001)
  const sceneScale = Math.max(runtime.sceneScale, 1)
  const nextNear = Math.max(Math.min(distance * 0.01, sceneScale / 1500), 0.0005)
  const nextFar = Math.max(sceneScale * 8, distance * 8, 50)

  if (
    Math.abs(runtime.camera.near - nextNear) > 1e-7 ||
    Math.abs(runtime.camera.far - nextFar) > 1e-4
  ) {
    runtime.camera.near = nextNear
    runtime.camera.far = nextFar
    runtime.camera.updateProjectionMatrix()
  }
}

function getCurrentViewDirection(runtime: Runtime) {
  const currentDirection = new THREE.Vector3().subVectors(
    runtime.camera.position,
    getArcballCenter(runtime.arcball),
  )

  return currentDirection.lengthSq() > 0
    ? currentDirection.normalize()
    : new THREE.Vector3(0.45, -0.8, 0.42).normalize()
}

function syncCameraLightRig(runtime: Runtime) {
  runtime.cameraLightRig.position.copy(runtime.camera.position)
  runtime.cameraLightRig.quaternion.copy(runtime.camera.quaternion)
  runtime.cameraLightRig.updateMatrixWorld(true)
}

function localCenterFromExtent(extent: ViewerFeature['extent'], center: Vec3) {
  return new THREE.Vector3(
    (extent[0] + extent[3]) * 0.5 - center[0],
    (extent[1] + extent[4]) * 0.5 - center[1],
    (extent[2] + extent[5]) * 0.5 - center[2],
  )
}

function extentFromVertexIndices(indices: number[], vertices: Vec3[]): ViewerFeature['extent'] | null {
  const extent: ViewerFeature['extent'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  let hasVertex = false

  for (const index of indices) {
    const vertex = vertices[index]
    if (!vertex) {
      continue
    }

    hasVertex = true
    extent[0] = Math.min(extent[0], vertex[0])
    extent[1] = Math.min(extent[1], vertex[1])
    extent[2] = Math.min(extent[2], vertex[2])
    extent[3] = Math.max(extent[3], vertex[0])
    extent[4] = Math.max(extent[4], vertex[1])
    extent[5] = Math.max(extent[5], vertex[2])
  }

  return hasVertex ? extent : null
}

function uniqueVertexIndices(polygon: PolygonRings) {
  return [...new Set(polygon.flat())]
}

function extentMaxDimension(extent: ViewerFeature['extent']) {
  return Math.max(extent[3] - extent[0], extent[4] - extent[1], extent[5] - extent[2])
}

function clearTransientGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    if (
      'geometry' in child &&
      (child.geometry instanceof THREE.BufferGeometry || child.geometry instanceof LineSegmentsGeometry)
    ) {
      child.geometry.dispose()
    }

    const material =
      child instanceof THREE.Mesh ||
      child instanceof THREE.Points ||
      child instanceof THREE.LineSegments ||
      child instanceof LineSegments2
        ? child.material
        : null
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose()
      }
    } else {
      material?.dispose()
    }

    group.remove(child)
  }
}

function disposeSceneContents(runtime: Runtime) {
  for (const mesh of runtime.meshesByObjectKey.values()) {
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) mat.dispose()
    runtime.rootGroup.remove(mesh)
  }
  runtime.meshesByObjectKey.clear()
  runtime.meshesByFeatureId.clear()
  clearSelectionOutlineProxy(runtime)

  for (const batch of runtime.batchedMeshes) {
    const materials = Array.isArray(batch.material) ? batch.material : [batch.material]
    for (const mat of materials) mat.dispose()
    batch.dispose()
    runtime.rootGroup.remove(batch)
  }
  runtime.batchedMeshes = []
  runtime.batchedObjectsByObjectKey.clear()
  runtime.batchedObjectsByFeatureId.clear()

  clearEditPointOverlays(runtime)
  clearTransientGroup(runtime.annotationGroup)
  runtime.annotationVertexMarkers = []

  clearTransientGroup(runtime.edgeGroup)
  runtime.editBaseEdges = null
  runtime.editHighlightEdges = null
  runtime.editActiveRingEdges = null
  runtime.editVertexEdges = null
  runtime.editHighlightVertexEdges = null
  runtime.editActiveRingVertexEdges = null
}

export { CityViewport }
