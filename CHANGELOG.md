# Changelog

## Unreleased
- Fix issue with colormap clamping past max value
- Improve performance for large datasets by batching into fewer threejs objects
- Add jump flood outline rendering for selected object

## 0.6.0 - 2026-05-08

- Reveal viewport hotkey hints as tooltips when the help panel is open
- Flatten chrome surfaces by removing translucency and backdrop blur
- Fix bug that made object without semantic surfaces darker when toggling between light/dark mode
- Reduce memory usage, allowing for loading of larger CityJSONL files
- Improve error message for CityJSON files that are too large to load
- Improve object and semantic surface colors based on types
- Fix bug that caused mis-indexed triangulations in some datasets
- Add hotkey 'D' in inspect mode to delete the selected face
- Improve vertex selection in inspect mode
- Add system setting to light/dark mode button
- Add object coloring based on colormapped object attributes

## 0.5.0 - 2026-05-04

- Fix crash while loading file with very large geometries
- Add button to copy feature ID to clipboard
- Add desktop pinned attributes for tracking selected object values in the viewport
- Show filename in page title
- Refine feature and details panel metadata layout: joined geometry type/LoD chips, object type count pills, tab count badges, and shared ID copy buttons
- Refine semantic attribute panel: stay open when selecting another semantic surface

## 0.4.0 - 2026-04-16

- Show the app version in the rail and open the changelog from it.
- Improvements to mobile UI
- Add file information dialog showing CityJSON version, transform, feature count, and populated metadata fields
- remodel file open dialog
- Add support for loading CityJSON and val3dity report files from URLs via dialog, paste (`cj` only), or `?cj=` / `?val=` URL parameters

## 0.3.0 - 2026-04-14

- Add support for regular CityJSON files
- Do not pick hidden objects
- Remember picking mode when entering/exiting inspect mode
- Refine vertex cycle panel in inspect mode
- Refine inspect mode colors and selection appearance
- New open file dialog
- Refined the desktop viewport chrome with Blender-style tool icons, a vertical tool bar, a compact bottom status bar, viewport-center coordinates, and a pick-mode dropdown.

## 0.2.0 - 2026-04-10

- LoD support
- Show object tree in features list items
- Simplify details panel and add tab for object geometries
- Show loading indicator when loading a file
- Automatically enter edit mode when centering on a val3dity error item
- Redesign how object/face/vertex picking works
- feature labels now use the feature ID directly, trimming a leading `NL.IMBAG.Pand.` prefix
- feature list is now virtualized for better sidebar performance with large datasets
- feature panel header was compacted
- desktop sidebar content is no longer kept mounted while the sidebar is collapsed, reducing panel toggle cost
- detail error and attribute panels now fully reset on feature/object selection changes, preventing stale error rows from persisting across selections
- details attributes now show both active object attributes and parent feature attributes in separate sections
- edit mode now cycles ordered face ring entries, including repeated vertices, and avoids duplicate closing edges on explicitly closed rings
- entering edit mode now disables semantic coloring
- details panel hides the error count when no val3dity report is loaded
- validation report uploads now fail fast for invalid val3dity JSON structure or non-matching datasets

## 0.1.0 - 2026-04-08

Initial release.

- 3D CityJSONL viewer with feature browsing and inspection
- val3dity report loading and error inspection
- semantic surface visualisation
- edit mode with face, ring, and vertex inspection
- mobile-friendly read-only inspection UI
