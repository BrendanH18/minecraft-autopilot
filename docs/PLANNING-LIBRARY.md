# Library planning

Use `mc-agent library-plan` to plan storage and lending for a collection of numbered books. The inputs describe your own shelves and loan policies. For example, `mc-agent library-plan pull-slips 8,0,8 8,8,5` returns a result of `[1,3,null]`. Collect the two requested copies of title 8 from slots 1 and 3. Title 5 is unavailable.

IDs, shelf slots, and input-order positions start at one. A zero in a shelf layout marks an empty slot. Days and linear aisle coordinates can start at zero. Counts and IDs are whole numbers. The type codes `s` and `c` denote positive and nonnegative numbers respectively, and uppercase codes take comma-separated lists. An `indexes` list may be empty (pass `''`). Lists have at most 1,000 entries.

| Command | Types | Calculation |
| --- | --- | --- |
| `vacancy-runs <slots>` | `C` | Locate uninterrupted stretches of empty shelf slots. |
| `series-fit <slots> <volumes>` | `C,s` | Find the tightest empty run for an intact series, preferring earlier ties. |
| `compact-moves <slots>` | `C` | List book moves that close gaps to the left without changing reading order. |
| `shelf-mask <slots>` | `C` | Encode six front-facing chiseled bookshelf slots in row-major occupancy bits. |
| `pull-slips <slots> <requests>` | `C,S` | Assign each requested copy its earliest matching shelf slot, without reusing a copy. |
| `desk-trip <desk> <stops>` | `c,C` | Choose which aisle end to visit first to collect all books on one line, ending at the last pickup. |
| `swap-count <current> <target>` | `S,S` | Count the fewest arbitrary two-volume swaps that restore a specified shelf order. |
| `inventory-delta <catalog> <observed>` | `indexes,indexes` | Compare title multiplicities and list only discrepancies in title order. |
| `missing-serials <first> <last> <observed>` | `s,s,indexes` | Compress unobserved serial numbers in an inclusive catalog range into gap intervals. |
| `next-accession <occupied> <minimum> <size>` | `indexes,s,s` | Find the first free consecutive ID range large enough for a new accession. |
| `edition-audit <titles> <editions> <current-editions>` | `S,S,S` | List copies whose edition differs from the current catalog edition. |
| `catalog-tabs <sorted-titles> <cards-per-tab>` | `S,s` | Build tab labels from fixed-size groups of sorted title cards. |
| `cross-references <links> <start>` | `C,s` | Trace catalog redirects to a terminal title or the first repeated title. |
| `subject-index <subjects> <titles>` | `S,S` | Group and deduplicate title references under sorted subject numbers. |
| `reading-order <prerequisites>` | `C` | Order volumes after their prerequisite, selecting the lowest eligible volume at each step. |
| `hold-slips <available> <requests>` | `C,S` | Issue available copies in request order and number each remaining per-title waitlist. |
| `recall-list <volume-ids> <due-days> <today>` | `S,C,c` | Order overdue volumes by oldest due day, breaking ties by volume ID. |
| `renewal-dates <due-days> <holds> <renewals-left> <period> <today>` | `C,C,C,s,c` | Extend eligible current loans from their due date; null marks a refused renewal. |
| `loan-peak <checkouts> <returns>` | `C,C` | Find peak concurrent loans across half-open lending intervals and the earliest peak day. |
| `reserve-copy <returns> <requests> <period>` | `C,C,s` | Schedule title reservations on the earliest free copy, with copy-number ties. |
| `branch-transfer <holdings> <targets>` | `C,C` | Match surplus copies of one title to branch deficits in branch order. |
| `return-sort <home-branches> <bin-capacity>` | `S,s` | Identify each return that fills its branch bin and triggers a dispatch. |
| `preservation-copies <branch-a> <branch-b> <minimum>` | `C,C,c` | Find copies needed by title at each branch to survive loss of either entire collection. |
| `shelf-reading <slots>` | `C` | Report adjacent occupied volumes in descending catalog order, skipping empty slots. |
| `rotation-picks <last-shown> <available> <places>` | `C,C,c` | Pick available titles least recently displayed for numbered lecterns; lower IDs break ties. |

For `shelf-mask`, bit 0 is top left and bit 5 is bottom right, viewed from the front. For `series-fit`, a null result means the entire series cannot fit in any one run. For `desk-trip`, the lower coordinate wins a tie.

`inventory-delta` compares title IDs once per physical copy. Omit empty slots from both inputs. `missing-serials` and `next-accession` accept duplicate sightings of the same serial. `swap-count` requires unique physical volume IDs on both sides. These commands can use different numbering schemes in the same collection.

`cross-references` and `reading-order` use list positions as volume IDs. A zero link ends a redirect chain or marks a volume that has no prerequisite. A cycle in a reading order is an input error.

`hold-slips` returns zero for a request that can be filled immediately and a one-based queue position for a waiting request. A loan due today is eligible for renewal if it has no holds and has renewals left. For `loan-peak`, a same-day return contributes zero occupied days. The earliest peak day is null if all loans have zero duration. For `reserve-copy`, each return day is the first day its copy can be reserved again. Each new reservation occupies that copy until the start of its due day.

`preservation-copies` reports additions for each branch to retain the specified minimum if the other branch is lost. For `rotation-picks`, supply last-display days on the same clock; zero may stand for a title never displayed if other titles have positive display days.
