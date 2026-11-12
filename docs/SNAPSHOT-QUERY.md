# snapshot-query

Inspect raw saved snapshot evidence using explicit JSON Pointers. The snapshot must satisfy the existing saved-snapshot format; additional recorded fields remain queryable.

```sh
mc-agent snapshot-query field snapshot.json /player/position
mc-agent snapshot-query project snapshot.json /player/health /containers
mc-agent snapshot-query array-distinct snapshot.json /inventory
```

Paths use JSON Pointer syntax: `/player/health`, with `~1` for slash and `~0` for tilde. An empty string selects the root. Path lookup uses own fields only. Missing is distinct from explicit null. Leaves are scalar JSON values; empty arrays and objects are reported by empty-values, not leaves. compare-paths and array-distinct use structural JSON equality with object keys sorted, preserving array ordering. String lengths use JavaScript UTF-16 code units. Numeric ranges are inclusive and limited to ±10^12. Traversals are bounded to depth 40 and 20,000 nodes; files must be regular files of at most 10 MiB. These structural reports establish neither current world state nor task success.

| Command | Meaning |
| --- | --- |
| `field <file> <pointer>` | Read one JSON Pointer with explicit presence. |
| `keys <file> <pointer>` | List immediate keys at an object or array. |
| `field-type <file> <pointer>` | Report a selected JSON value type. |
| `has-path <file> <pointer>` | Check whether a path was explicitly recorded. |
| `children <file> <pointer>` | List immediate child paths, values, and types. |
| `leaves <file>` | List scalar leaves with JSON Pointer provenance. |
| `numeric-leaves <file>` | List finite numeric leaves. |
| `string-leaves <file>` | List string leaves. |
| `null-leaves <file>` | List explicitly null leaf paths. |
| `array-lengths <file>` | List every array and its recorded length. |
| `object-sizes <file>` | List key counts of non-array objects. |
| `deepest-paths <file>` | Find paths at the maximum nesting depth. |
| `node-count <file>` | Count all nodes and scalar leaves. |
| `key-frequency <file>` | Count field-name occurrences at any depth. |
| `key-search <file> <text>` | Find paths whose final key contains literal text. |
| `value-search <file> <text>` | Find string leaves containing literal text. |
| `subtree-paths <file> <pointer>` | List all nodes of one selected subtree with relative pointers. |
| `project <file> <pointers...>` | Read several explicit paths retaining missing markers. |
| `missing-paths <file> <pointers...>` | List requested paths absent from the evidence. |
| `numeric-range <file> <minimum> <maximum>` | Find numeric leaves in an inclusive supplied range. |
| `string-lengths <file>` | Report lengths of all string leaves in UTF-16 units. |
| `empty-values <file>` | Find empty strings, arrays, and objects. |
| `boolean-leaves <file>` | List explicitly recorded booleans. |
| `compare-paths <file> <first> <second>` | Compare two present values by canonical structural JSON equality. |
| `array-distinct <file> <pointer>` | Count structurally distinct entries in an array. |
