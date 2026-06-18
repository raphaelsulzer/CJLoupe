# CJLoupe

CityJSON 3D viewer and inspection tool with support for val3dity annotations.

It was built specifically to inspect errors in CityJSON geometries, with the ability to investigate how the geometry is actually structured down to the vertex level.

This app was built almost entirely through vibe coding, though I still spent many dozens of hours instructing, supervising and scrutinizing the agent.

![CJLoupe screenshot](./Screenshot.png)

## Current capabilities

- Loading of [CityJSON](https://www.cityjson.org/specs/) files and [CityJSON feature sequences](https://www.cityjson.org/cityjsonseq/)
- 3D viewport with arcball navigation and object picking
- [val3dity](https://github.com/tudelft3d/val3dity) report loading and error visualization (generate with the val3dity `--report` flag)
- Collapsible left sidebar with feature list, and feature details (attributes, val3dity errors, geometries)
- Semantic surfaces visualisation
- Edit mode with face selection, ring cycling, vertex selection, and vertex movement
- LoD selection
- Simple mobile UI without edit mode

## Development

```bash
nix develop
bun install
bun dev
```

Other useful commands:

```bash
bun run build
bun run lint
```

To run exec:
```npm run dev```

## Data Loading

The app loads a bundled sample on startup and also supports local files.

- CityJSON: `.json`, `.city.json`, `.cityjson`
- CityJSON feature sequences: `.jsonl`, `.city.jsonl`
- val3dity reports: `.json`

You can load files in two ways:

- Use the file controls in the left rail
- Drag and drop files into the window

When a dataset is already open, the file action lets you either replace the current CityJSON dataset or attach a matching val3dity report.

## Limitations
- No handling of [Appearance objects](https://www.cityjson.org/specs/2.0.2/#appearance-object)
- The 'Best LOD' selection, does not show the parent object if child objects have a geometry as well.
