import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

import type {
  PolygonRings,
  Vec3,
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

type Theme = 'light' | 'dark'

const VIEWPORT_FOG_DENSITY = {
  light: 0.000005,
  dark: 0.000005,
} as const

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
  raycaster: THREE.Raycaster
  pointer: THREE.Vector2
  meshesByObjectKey: Map<string, THREE.Mesh>
  meshesByFeatureId: Map<string, THREE.Mesh[]>
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

type ViewSelection = {
  selectedFeatureId: string | null
  activeObjectId: string | null
  geometryDisplayMode: ViewerGeometryDisplayMode
  activeGeometryIndex: number | null
  editMode: boolean
  selectedFaceIndex: number | null
  selectedFaceRingIndex: number
  selectedVertexIndex: number | null
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
  const onSelectFeatureRef = useRef(onSelectFeature)
  const onSelectFaceRef = useRef(onSelectFace)
  const onSelectVertexRef = useRef(onSelectVertex)
  const onSelectSemanticSurfaceRef = useRef(onSelectSemanticSurface)
  const onVertexCommitRef = useRef(onVertexCommit)
  const onViewportCenterChangeRef = useRef(onViewportCenterChange)
  const themeRef = useRef(theme)
  const showSemanticSurfacesRef = useRef(showSemanticSurfaces)
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
      selectedFeatureId,
      activeObjectId,
      geometryDisplayMode,
      activeGeometryIndex,
      editMode,
      selectedFaceIndex,
      selectedFaceRingIndex,
      selectedVertexIndex,
    }
  }, [selectedFeatureId, activeObjectId, geometryDisplayMode, activeGeometryIndex, editMode, selectedFaceIndex, selectedFaceRingIndex, selectedVertexIndex])

  useEffect(() => { onSelectFeatureRef.current = onSelectFeature }, [onSelectFeature])
  useEffect(() => { onSelectFaceRef.current = onSelectFace }, [onSelectFace])
  useEffect(() => { onSelectVertexRef.current = onSelectVertex }, [onSelectVertex])
  useEffect(() => { onSelectSemanticSurfaceRef.current = onSelectSemanticSurface }, [onSelectSemanticSurface])
  useEffect(() => { onVertexCommitRef.current = onVertexCommit }, [onVertexCommit])
  useEffect(() => { onViewportCenterChangeRef.current = onViewportCenterChange }, [onViewportCenterChange])
  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { showSemanticSurfacesRef.current = showSemanticSurfaces }, [showSemanticSurfaces])
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
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      meshesByObjectKey: new Map(),
      meshesByFeatureId: new Map(),
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
          updateEditPointRaycastThreshold(activeRuntime, currentData, selection)
          const handleTargets = [activeRuntime.selectedEditPoint, activeRuntime.editPoints].filter(
            (entry): entry is THREE.Points => entry != null,
          )
          const handleHits = activeRuntime.raycaster.intersectObjects(handleTargets, false)
          const handleHit = handleHits[0]
          if (handleHit && typeof handleHit.index === 'number') {
            const indices = (handleHit.object.userData.vertexIndices as number[] | undefined) ?? []
            const vertexIndex = indices[handleHit.index]
            if (vertexIndex != null) {
              onSelectVertexRef.current(vertexIndex)
              return
            }
          }

          if (handleHit) {
            return
          }

          const activeFeature =
            selection.selectedFeatureId
              ? currentData.features.find((candidate) => candidate.id === selection.selectedFeatureId) ?? null
              : null
          const activeObject =
            activeFeature?.objects.find((candidate) => candidate.id === selection.activeObjectId) ?? null
          const activeObjectGeometry = activeFeature && activeObject
            ? resolveDisplayedObjectGeometry(activeFeature, activeObject, selection)
            : null
          const activeMesh =
            selection.selectedFeatureId && selection.activeObjectId
              ? activeRuntime.meshesByObjectKey.get(
                  objectKey(selection.selectedFeatureId, selection.activeObjectId),
                ) ?? null
              : null

          if (!activeFeature || !activeObject || !activeObjectGeometry || !activeMesh) {
            return
          }

          const meshHits = activeRuntime.raycaster.intersectObject(activeMesh, false)
          const meshHit = meshHits[0]
          const triangleFaceIndices = (activeMesh.userData.triangleFaceIndices as TriangleFaceIndices | undefined) ?? []
          const polygonIndex =
            meshHit && typeof meshHit.faceIndex === 'number'
              ? triangleFaceIndices[meshHit.faceIndex] ?? null
              : null
          const polygon = polygonIndex != null ? activeObjectGeometry.polygons[polygonIndex] ?? null : null
          const nearestVertexIndex =
            meshHit && polygon
              ? findNearestVertexIndexOnPolygon(meshHit.point, polygon, activeFeature.vertices, currentData.center)
              : null

          if (nearestVertexIndex != null) {
            onSelectVertexRef.current(nearestVertexIndex)
          }
          return
        }

        if (selection.editMode) {
          if (pickingMode !== 'face') {
            return
          }

          const activeMesh =
            selection.selectedFeatureId && selection.activeObjectId
              ? activeRuntime.meshesByObjectKey.get(
                  objectKey(selection.selectedFeatureId, selection.activeObjectId),
                ) ?? null
              : null

          if (!activeMesh) {
            return
          }

          const meshHits = activeRuntime.raycaster.intersectObject(activeMesh, false)
          const meshHit = meshHits[0]
          const triangleFaceIndices = (activeMesh.userData.triangleFaceIndices as TriangleFaceIndices | undefined) ?? []
          const faceIndex =
            meshHit && typeof meshHit.faceIndex === 'number'
              ? triangleFaceIndices[meshHit.faceIndex] ?? null
              : null

          onSelectFaceRef.current(faceIndex)
          return
        }

        if (pickingMode === 'face') {
          const meshHits = activeRuntime.raycaster.intersectObjects(
            getVisibleObjectMeshes(activeRuntime),
            false,
          )
          const meshHit = meshHits[0]
          if (!meshHit) {
            onSelectSemanticSurfaceRef.current(null)
            return
          }

          const featureId = meshHit.object.userData.featureId as string
          const objectId = meshHit.object.userData.objectId as string
          const geometryIndex = meshHit.object.userData.geometryIndex as number | null | undefined
          const triangleFaceIndices = (meshHit.object.userData.triangleFaceIndices as TriangleFaceIndices | undefined) ?? []
          const faceIndex =
            typeof meshHit.faceIndex === 'number'
              ? triangleFaceIndices[meshHit.faceIndex] ?? null
              : null

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
          getVisibleObjectMeshes(activeRuntime),
          false,
        )
        const meshHit = meshHits[0]
        if (!meshHit) {
          onSelectSemanticSurfaceRef.current(null)
          return
        }

        const featureId = meshHit.object.userData.featureId as string
        const objectId = meshHit.object.userData.objectId as string
        const geometryIndex = meshHit.object.userData.geometryIndex as number | null | undefined
        const triangleFaceIndices = (meshHit.object.userData.triangleFaceIndices as TriangleFaceIndices | undefined) ?? []
        const faceIndex =
          typeof meshHit.faceIndex === 'number'
            ? triangleFaceIndices[meshHit.faceIndex] ?? null
            : null

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
        getVisibleObjectMeshes(activeRuntime),
        false,
      )
      const meshHit = meshHits[0]
      if (meshHit) {
        const featureId = meshHit.object.userData.featureId as string
        const objectId = meshHit.object.userData.objectId as string
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
        getVisibleObjectMeshes(activeRuntime),
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
      rebuildFeatureGeometry(activeRuntime, currentData, featureId, selectionRef.current)
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
  }, [selectedFeatureId, activeObjectId, editMode, selectedFaceIndex, selectedFaceRingIndex, selectedVertexIndex, hideOccludedEditEdges, isolateSelectedFeature, showVertexGizmo])

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

    if (currentData) {
      updateSceneSurfacePresentation(runtime, currentData, selectionRef.current)
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
  }, [showSemanticSurfaces])

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
  runtime.featureDrafts = new Map(
    data.features.map((feature) => [feature.id, feature.vertices.map((vertex) => [...vertex] as Vec3)]),
  )

  const sizeX = data.extent[3] - data.extent[0]
  const sizeY = data.extent[4] - data.extent[1]
  const sizeZ = data.extent[5] - data.extent[2]
  runtime.sceneScale = Math.max(sizeX, sizeY, sizeZ)

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

      const { blueprint, geometry, material } = buildObjectMeshPresentation(
        runtime,
        feature,
        object,
        objectGeometry,
        selection,
        draftVertices,
        featureCenter,
      )
      const mesh = new THREE.Mesh(geometry, material)
      const nextObjectKey = objectKey(feature.id, object.id)
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
      runtime.meshesByObjectKey.set(nextObjectKey, mesh)
      const featureMeshes = runtime.meshesByFeatureId.get(feature.id)
      if (featureMeshes) {
        featureMeshes.push(mesh)
      } else {
        runtime.meshesByFeatureId.set(feature.id, [mesh])
      }
      runtime.rootGroup.add(mesh)
    }
  }
}

function rebuildFeatureGeometry(
  runtime: Runtime,
  data: ViewerDataset,
  featureId: string,
  selection: ViewSelection,
) {
  const feature = data.features.find((candidate) => candidate.id === featureId)
  const vertices = runtime.featureDrafts.get(featureId)
  if (!feature || !vertices) {
    return
  }

  for (const object of feature.objects) {
    const mesh = runtime.meshesByObjectKey.get(objectKey(featureId, object.id))
    if (!mesh) {
      continue
    }

    const objectGeometry = resolveDisplayedObjectGeometry(feature, object, selection)
    if (!objectGeometry) {
      continue
    }

    const center = (mesh.userData.featureCenter as Vec3) ?? data.center
    const nextBlueprint = buildObjectGeometryBlueprint(objectGeometry.polygons, vertices, center)
    const { faceGroups } = resolveObjectFaceGroups(runtime, feature, object, objectGeometry, selection)
    const nextGeometry = buildGroupedObjectGeometry(nextBlueprint, faceGroups)
    replaceMeshGeometry(mesh, nextGeometry)
    mesh.userData.geometryBlueprint = nextBlueprint
    mesh.userData.geometryIndex = objectGeometry.index
  }
}

function updateSceneSurfacePresentation(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
) {
  for (const feature of data.features) {
    for (const object of feature.objects) {
      updateObjectSurfacePresentation(runtime, feature, object, selection)
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
      ? objectKey(previousSelection.selectedFeatureId, previousSelection.activeObjectId)
      : null
  const nextObjectKey =
    selection.selectedFeatureId && selection.activeObjectId
      ? objectKey(selection.selectedFeatureId, selection.activeObjectId)
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

  if (!didSelectedObjectChange && !didGeometryModeChange && !didSelectedFaceChange && !didEditModeChange) {
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
  const mesh = runtime.meshesByObjectKey.get(objectKey(feature.id, object.id))
  if (!mesh) {
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
  const existingBlueprint = mesh.userData.geometryBlueprint as ObjectGeometryBlueprint | undefined
  const { blueprint, geometry, material } = buildObjectMeshPresentation(
    runtime,
    feature,
    object,
    objectGeometry,
    selection,
    draftVertices,
    featureCenter,
    existingBlueprint,
  )
  replaceMeshGeometry(mesh, geometry)
  replaceMeshMaterial(mesh, material)
  mesh.userData.geometryBlueprint = blueprint
  mesh.userData.geometryIndex = objectGeometry.index
  mesh.userData.triangleFaceIndices = geometry.userData.triangleFaceIndices
}

function buildObjectMeshPresentation(
  runtime: Runtime,
  feature: ViewerFeature,
  object: ViewerFeature['objects'][number],
  objectGeometry: ViewerObjectGeometry,
  selection: ViewSelection,
  vertices: Vec3[],
  featureCenter: Vec3,
  existingBlueprint?: ObjectGeometryBlueprint,
) {
  const blueprint = existingBlueprint ?? buildObjectGeometryBlueprint(objectGeometry.polygons, vertices, featureCenter)
  const { faceGroups, groupColors } = resolveObjectFaceGroups(runtime, feature, object, objectGeometry, selection)
  const geometry = buildGroupedObjectGeometry(blueprint, faceGroups)
  const baseMaterial = createMaterial(object.type, runtime.theme, runtime.showSemanticSurfaces)
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
  selection: ViewSelection,
) {
  const selectedSemanticFaceIndex =
    runtime.showSemanticSurfaces &&
    !selection.editMode &&
    selection.selectedFeatureId === feature.id &&
    selection.activeObjectId === object.id
      ? selection.selectedFaceIndex
      : null

  return runtime.showSemanticSurfaces
    ? computeFaceSemanticGroups(objectGeometry.semanticSurfaces, selectedSemanticFaceIndex)
    : computeFaceErrorGroups(feature.errors, object.id, objectGeometry.index)
}

function buildObjectGeometryBlueprint(
  polygons: PolygonRings[],
  vertices: Vec3[],
  center: Vec3,
): ObjectGeometryBlueprint {
  const vertexCapacity = countRenderablePolygonVertices(polygons, vertices)
  const positions = new Float32Array(vertexCapacity * 3)
  const normals = new Float32Array(vertexCapacity * 3)
  const polygonTriangleIndices: number[][] = []
  let offset = 0
  let componentOffset = 0

  for (let polyIndex = 0; polyIndex < polygons.length; polyIndex += 1) {
    const polygon = polygons[polyIndex]
    if (polygon.length === 1) {
      const ring = polygon[0]
      const polygonVertexCount = countRenderableRingVertices(ring, vertices)
      if (polygonVertexCount < 3) {
        polygonTriangleIndices.push([])
        continue
      }

      const normal = computeIndexedRingNormal(ring, vertices)
      fillIndexedRingBuffers(ring, vertices, center, normal, positions, normals, componentOffset)
      componentOffset += polygonVertexCount * 3

      if (polygonVertexCount === 3) {
        polygonTriangleIndices.push([offset, offset + 1, offset + 2])
      } else if (polygonVertexCount === 4 && isConvexIndexedRing(ring, vertices, normal)) {
        polygonTriangleIndices.push([offset, offset + 1, offset + 2, offset, offset + 2, offset + 3])
      } else {
        const projectedPolygon = [collectRingVertices(ring, vertices)]
        const triangles = triangulatePolygon(projectedPolygon)
        const polygonIndices: number[] = []
        for (const triangle of triangles) {
          polygonIndices.push(offset + triangle[0], offset + triangle[1], offset + triangle[2])
        }
        polygonTriangleIndices.push(polygonIndices)
      }

      offset += polygonVertexCount
      continue
    }

    const projectedPolygon = polygon
      .map((ring) =>
        ring
          .map((index) => vertices[index])
          .filter((vertex): vertex is Vec3 => Array.isArray(vertex)),
      )
      .filter((ring) => ring.length >= 3)

    if (projectedPolygon.length === 0) {
      polygonTriangleIndices.push([])
      continue
    }

    const normal = computeNormal(projectedPolygon[0])
    let polygonVertexCount = 0
    for (const ring of projectedPolygon) {
      polygonVertexCount += ring.length
      for (const vertex of ring) {
        positions[componentOffset] = vertex[0] - center[0]
        normals[componentOffset++] = normal.x
        positions[componentOffset] = vertex[1] - center[1]
        normals[componentOffset++] = normal.y
        positions[componentOffset] = vertex[2] - center[2]
        normals[componentOffset++] = normal.z
      }
    }

    const polygonIndices: number[] = []
    const triangles = triangulatePolygon(projectedPolygon)
    for (const triangle of triangles) {
      polygonIndices.push(offset + triangle[0], offset + triangle[1], offset + triangle[2])
    }
    polygonTriangleIndices.push(polygonIndices)
    offset += polygonVertexCount
  }

  const blueprint: ObjectGeometryBlueprint = {
    positions,
    normals,
    polygonTriangleIndices,
  }

  return blueprint
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
  applySelectionAppearance(runtime, selection, isolateSelectedFeature, runtime.meshesByObjectKey.values())
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
  const previousIsolateActive = previousIsolateSelectedFeature && previousSelection.selectedFeatureId != null
  const isolateActive = isolateSelectedFeature && selection.selectedFeatureId != null
  const previousSemanticObjectSelectionActive =
    runtime.showSemanticSurfaces && !previousSelection.editMode && previousSelection.activeObjectId != null
  const semanticObjectSelectionActive =
    runtime.showSemanticSurfaces && !selection.editMode && selection.activeObjectId != null

  if (
    previousIsolateActive !== isolateActive ||
    previousSemanticObjectSelectionActive !== semanticObjectSelectionActive
  ) {
    syncSelection(runtime, data, selection, hideOccludedEditEdges, isolateSelectedFeature, showVertexGizmo)
    return
  }

  applySelectionAppearance(
    runtime,
    selection,
    isolateSelectedFeature,
    collectAffectedFeatureMeshes(runtime, previousSelection.selectedFeatureId, selection.selectedFeatureId),
  )
  rebuildHandles(runtime, data, selection, hideOccludedEditEdges, showVertexGizmo)
}

function applySelectionAppearance(
  runtime: Runtime,
  selection: ViewSelection,
  isolateSelectedFeature: boolean,
  meshes: Iterable<THREE.Mesh>,
) {
  const isolateActive = isolateSelectedFeature && selection.selectedFeatureId != null
  const palette = getViewportPalette(runtime.theme)
  const semanticHighlightLift = new THREE.Color('#f8fafc')
  const semanticShadow = new THREE.Color('#020617')
  const semanticObjectSelectionActive =
    runtime.showSemanticSurfaces && !selection.editMode && selection.activeObjectId != null

  for (const mesh of meshes) {
    applyMeshSelectionAppearance(
      runtime,
      mesh,
      selection,
      isolateActive,
      palette,
      semanticHighlightLift,
      semanticShadow,
      semanticObjectSelectionActive,
    )
  }
}

function applyMeshSelectionAppearance(
  runtime: Runtime,
  mesh: THREE.Mesh,
  selection: ViewSelection,
  isolateActive: boolean,
  palette: ReturnType<typeof getViewportPalette>,
  semanticHighlightLift: THREE.Color,
  semanticShadow: THREE.Color,
  semanticObjectSelectionActive: boolean,
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
  const isSelectedFeature = featureId === selection.selectedFeatureId
  const isActiveObject = isSelectedFeature && objectId === selection.activeObjectId
  const hideParentMesh =
    selection.geometryDisplayMode.kind === 'best' && hasRenderableChildren && !isActiveObject

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of materials) {
    const mat = material as THREE.MeshStandardMaterial
    if (mat.userData.isError) {
      mat.emissive.set(isSelectedFeature ? palette.selectionEmissive : palette.errorEmissive)
      mat.emissiveIntensity = isSelectedFeature ? palette.errorSelectedIntensity : palette.errorIntensity
    } else if (mat.userData.isSemantic || mat.userData.isSemanticBase) {
      if (typeof mat.userData.semanticColor === 'string') {
        mat.color.set(mat.userData.semanticColor)
      }
      if (semanticObjectSelectionActive) {
        if (isActiveObject) {
          mat.color.lerp(semanticHighlightLift, 0.14)
        } else if (isSelectedFeature) {
          mat.color.lerp(semanticShadow, 0.14)
        } else {
          mat.color.lerp(semanticShadow, 0.28)
        }
        mat.emissive.set(isActiveObject ? palette.activeEmissive : '#000000')
        mat.emissiveIntensity = isActiveObject ? palette.semanticActiveEmissiveIntensity : 0
        mat.roughness = isActiveObject ? 0.58 : isSelectedFeature ? 0.8 : 0.86
      } else {
        mat.emissive.set(
          isActiveObject
            ? palette.activeEmissive
            : isSelectedFeature
              ? palette.selectionEmissive
              : '#000000',
        )
        mat.emissiveIntensity = isActiveObject
          ? palette.activeEmissiveIntensity
          : isSelectedFeature
            ? palette.selectionEmissiveIntensity
            : 0
        mat.roughness = 0.72
      }
    } else {
      mat.color.set(isActiveObject ? palette.activeObject : isSelectedFeature ? palette.selectedFeature : baseColor)
      mat.emissive.set(
        isActiveObject
          ? palette.activeEmissive
          : isSelectedFeature
            ? palette.selectionEmissive
            : palette.baseEmissive,
      )
      mat.emissiveIntensity = isActiveObject
        ? palette.activeEmissiveIntensity
        : isSelectedFeature
          ? palette.selectionEmissiveIntensity
          : palette.baseEmissiveIntensity
      mat.roughness = isActiveObject ? 0.38 : 0.72
    }
    mat.opacity = 1
    mat.transparent = false
    mat.depthWrite = true
  }

  mesh.visible = (!isolateActive || isSelectedFeature) && !hideParentMesh
}

function collectAffectedFeatureMeshes(
  runtime: Runtime,
  ...featureIds: Array<string | null>
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

function updateEditPointRaycastThreshold(
  runtime: Runtime,
  data: ViewerDataset,
  selection: ViewSelection,
) {
  const feature = selection.selectedFeatureId
    ? data.features.find((candidate) => candidate.id === selection.selectedFeatureId)
    : null
  const object = feature?.objects.find((candidate) => candidate.id === selection.activeObjectId) ?? null
  const objectGeometry = feature && object
    ? resolveDisplayedObjectGeometry(feature, object, selection)
    : null
  if (!feature || !objectGeometry) {
    runtime.raycaster.params.Points.threshold = 1
    return
  }

  const objectExtent = extentFromVertexIndices(objectGeometry.vertexIndices, feature.vertices)
  const viewportHeight = runtime.renderer.domElement.clientHeight
  if (!objectExtent || viewportHeight <= 0) {
    runtime.raycaster.params.Points.threshold = 1
    return
  }

  const center = localCenterFromExtent(objectExtent, data.center)
  const distance = runtime.camera.position.distanceTo(center)
  const fovRadians = THREE.MathUtils.degToRad(runtime.camera.fov)
  const worldUnitsPerPixel = (2 * Math.tan(fovRadians / 2) * distance) / viewportHeight
  runtime.raycaster.params.Points.threshold = Math.max(worldUnitsPerPixel * 8, 0.05)
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
      selectedFeature: '#6eb7d1',
      selectionEmissive: '#133245',
      selectionEmissiveIntensity: 0.08,
      activeObject: '#d8942d',
      activeEmissive: '#5d3a12',
      activeEmissiveIntensity: 0.1,
      semanticActiveEmissiveIntensity: 0.18,
      baseEmissive: '#000000',
      baseEmissiveIntensity: 0,
      errorEmissive: '#000000',
      errorIntensity: 0.08,
      errorSelectedIntensity: 0.05,
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
    selectedFeature: '#77bdd4',
    selectionEmissive: '#0f2f3f',
    selectionEmissiveIntensity: 0.1,
    activeObject: '#de9a30',
    activeEmissive: '#5a3812',
    activeEmissiveIntensity: 0.12,
    semanticActiveEmissiveIntensity: 0.22,
    baseEmissive: '#000000',
    baseEmissiveIntensity: 0,
    errorEmissive: '#000000',
    errorIntensity: 0.08,
    errorSelectedIntensity: 0.05,
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
    if (faceGroups.has(error.faceIndex)) {
      continue
    }

    let group = codeToGroup.get(error.code)
    if (group == null) {
      group = nextGroup++
      codeToGroup.set(error.code, group)
      groupColors.set(group, errorColor(error.code))
    }
    faceGroups.set(error.faceIndex, group)
  }

  return { faceGroups, groupColors }
}

function computeFaceSemanticGroups(
  semanticSurfaces: Array<ViewerSemanticSurface | null>,
  selectedFaceIndex: number | null,
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

  if (selectedFaceIndex != null && selectedFaceIndex >= 0 && selectedFaceIndex < semanticSurfaces.length) {
    const selectedGroup = nextGroup++
    faceGroups.set(selectedFaceIndex, selectedGroup)
    groupColors.set(selectedGroup, '#f59e0b')
  }

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

function objectKey(featureId: string, objectId: string) {
  return `${featureId}::${objectId}`
}

function updateRaycastPointer(runtime: Runtime, event: MouseEvent) {
  const rect = runtime.renderer.domElement.getBoundingClientRect()
  runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  runtime.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera)
}

function getVisibleObjectMeshes(runtime: Runtime) {
  return [...runtime.meshesByObjectKey.values()].filter((mesh) => mesh.visible)
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

function findNearestVertexIndexOnPolygon(
  hitPoint: THREE.Vector3,
  polygon: PolygonRings,
  vertices: Vec3[],
  dataCenter: Vec3,
) {
  let nearestVertexIndex: number | null = null
  let nearestDistanceSquared = Number.POSITIVE_INFINITY

  for (const vertexIndex of uniqueVertexIndices(polygon)) {
    const vertex = vertices[vertexIndex]
    if (!vertex) {
      continue
    }

    const localVertex = new THREE.Vector3(
      vertex[0] - dataCenter[0],
      vertex[1] - dataCenter[1],
      vertex[2] - dataCenter[2],
    )
    const distanceSquared = localVertex.distanceToSquared(hitPoint)
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared
      nearestVertexIndex = vertexIndex
    }
  }

  return nearestVertexIndex
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
