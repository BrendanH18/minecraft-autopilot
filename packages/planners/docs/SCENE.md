# Spatial observation queries

`mc-agent scene` reads one observation without acquiring control. Points use
`x,y,z`; put `--` before negative arguments. Boxes and ranges include their
boundaries. Chunk indices use floor division, including negative coordinates.

Reports cover only located entries in partial backend observations. Unlocated
entries are counted separately; unsupported collections stay marked unsupported.
Containers are deduplicated by position and their contents remain last observed.
Threat clearances never prove safety. Home queries require a saved home and
reject known dimension mismatches. Mean centers are descriptive, not destinations.

Examples:

```sh
mc-agent scene blocks-box -- -16,60,-16 16,80,16
mc-agent scene threats-home 32
mc-agent scene block-clearance oak_log
```

The 25 additions:

1. `blocks-box <a> <b>` — Find observed blocks in an inclusive cuboid.
2. `threats-box <a> <b>` — Find located threats in an inclusive cuboid.
3. `containers-box <a> <b>` — Find distinct containers in an inclusive cuboid.
4. `blocks-layer <min> <max>` — Select blocks in a Y interval.
5. `threats-layer <min> <max>` — Select threats in a Y interval.
6. `containers-layer <min> <max>` — Select containers in a Y interval.
7. `blocks-chunk <x> <z>` — Select blocks in a chunk by integer indices.
8. `threats-chunk <x> <z>` — Select threats in a chunk by integer indices.
9. `containers-chunk <x> <z>` — Select containers in a chunk by integer indices.
10. `blocks-around <point> <radius>` — Select blocks near an arbitrary point.
11. `threats-around <point> <radius>` — Select located threats near an arbitrary point.
12. `containers-around <point> <radius>` — Select containers near an arbitrary point.
13. `blocks-home <radius>` — Select blocks around the saved home.
14. `threats-home <radius>` — Select located threats around the saved home.
15. `containers-home <radius>` — Select containers around the saved home.
16. `blocks-shell <inner> <outer>` — Select blocks in a spherical shell around the player.
17. `threats-shell <inner> <outer>` — Select located threats in a spherical shell.
18. `containers-shell <inner> <outer>` — Select containers in a spherical shell.
19. `block-clearance <item>` — Measure each matching block’s nearest located observed threat.
20. `container-clearance` — Measure each container’s nearest located observed threat.
21. `threat-separation` — Find the closest pair of located observed threats.
22. `block-centers` — Calculate mean observed block positions by block name.
23. `container-centers` — Calculate mean distinct container positions by container name.
24. `location-gaps` — Count entries missing usable coordinates in each collection.
25. `home-neighbors` — Find the nearest block, threat, and container to home.
