# Shape estimates

Continuous X/Z polygon geometry, not placed block counts. Vertices are x,z pairs separated by semicolons, with 3 to 100 distinct vertices, no repeated closing vertex, no self-intersections, and nonzero area. Quote the vertex argument in your shell. Rasterization tests cell centers and is capped at 1000 candidate cells.

Run `mc-agent shape --help` for all commands. Every output is JSON with `result` and `note`. This group is offline and never acquires control or connects to Minecraft. Numeric inputs must be finite and are bounded to one million unless a narrower domain is documented; integer counts reject fractions. Structured outputs are capped at 1000 entries and results outside the safe numeric range are rejected.

| Command | Meaning |
| --- | --- |
| `signed-area <vertices>` | Compute signed continuous X/Z area; positive is counterclockwise. |
| `winding <vertices>` | Report vertex winding. |
| `centroid <vertices>` | Compute the area-weighted polygon centroid. |
| `edge-lengths <vertices>` | List continuous edge lengths including the closing edge. |
| `compactness <vertices>` | Compute 4 pi area divided by squared perimeter. |
| `bounds-fill <vertices>` | Compute polygon area divided by its axis-aligned bounding rectangle. |
| `contains <vertices> <x> <z>` | Test continuous point inclusion including the boundary. |
| `translate <vertices> <x> <z>` | Translate all vertices by supplied offsets. |
| `scale-centroid <vertices> <factor>` | Scale vertices around the area centroid by a positive factor. |
| `rotate-centroid <vertices> <degrees>` | Rotate vertices in the X/Z plane around their area centroid. |
| `reverse-winding <vertices>` | Reverse a polygon while preserving its first vertex. |
| `vertex-mean <vertices>` | Compute the unweighted vertex mean for comparison with area centroid. |
| `convex <vertices>` | Check that all noncollinear turns share a sign. |
| `edge-headings <vertices>` | List Minecraft yaw headings of polygon edges. |
| `edge-midpoints <vertices>` | List edge midpoint coordinates. |
| `prism-volume <vertices> <height>` | Compute a continuous vertical prism volume. |
| `side-area <vertices> <height>` | Compute lateral surface area of a vertical polygon prism. |
| `surface-area <vertices> <height>` | Compute closed prism continuous surface area. |
| `extrusion-material <vertices> <height> <density>` | Estimate supplied units per continuous volume. |
| `paint-budget <vertices> <coats> <coverage>` | Round up containers needed for polygon area at supplied coverage per coat. |
| `raster-centers <vertices>` | List integer block cells whose centers lie inside the polygon, capped at 1000 candidates. |
| `nearest-vertex <vertices> <x> <z>` | Choose the first nearest vertex to a point. |
| `nearest-edge <vertices> <x> <z>` | Compute shortest continuous distance to a polygon boundary. |
| `diagonals <vertices>` | Count combinatorial vertex diagonals; diagonals may leave concave polygons. |
| `vertex-angle-sum <vertices>` | Compute the interior-angle sum of a simple polygon in degrees. |

Examples:

```sh
mc-agent shape signed-area '0,0;2,0;2,2;0,2'
mc-agent shape winding '0,0;2,0;2,2;0,2'
mc-agent shape centroid '0,0;2,0;2,2;0,2'
```

Fractional volumes and lengths are continuous estimates; round and choose actual game materials separately. No command executes an action.
