# Expedition budgets

`mc-agent expedition` reads one observation through the authenticated bridge. It
never acquires control, moves items, refreshes storage, or executes recipes.
Rates and yields are explicit planning assumptions, rather than predictions
from Minecraft movement or crafting rules. Every command prints JSON.

```sh
mc-agent expedition round-trip 100,64,100 4 60
mc-agent expedition food-load bread 30 0.5
mc-agent expedition kit-time 20 oak_log=64 dirt=128
mc-agent expedition recipe torch 64 4 coal=1 stick=1
mc-agent expedition delivery-budget dirt 1000 4 100,64,100 4
```

Positions use `x,y,z` in the player's current dimension. Put `--` before negative
arguments. `time-home` and `home-deadline` require both home and player dimensions
to be known and equal; otherwise their time fields are null. Point arguments
are bounded to supported world coordinates. Speeds are blocks/second, collection
rates are items/minute, and food demand is hunger points/minute. Zero budgets
are accepted; speeds, collection rates, recipe yields, and fuel yields must be
positive. Count inputs are integers bounded to 1,000,000; reserved payload slots
are 0–35, and reserved free slots are 0–36.

Travel times are straight-line distances divided by a constant speed. Terrain,
vertical accessibility, pauses, hazards, hunger effects, and action failures
are excluded. Out-and-back calculations return to the observed player position.
`route-budget` does not add a return leg. `refresh-budget` adds a return leg and
uses a nearest-neighbor heuristic (not an optimal tour), capped at 200 known
containers. Resource trips deduplicate observed block coordinates; a block's
presence does not imply a quota can be collected there.

Food uses the existing supported food table. `food-plan` chooses foods by hunger
per item, then name, and may overfill the final portion. It does not account for
saturation, harmful effects, or food wasted by overfeeding. Unsupported foods
contribute zero to the food reserve. `ration-days` divides hunger points, not
whole item stacks, and does not promise a realizable meal schedule.

Production commands require supplied recipe and fuel quantities. `recipe`
counts missing output toward a target and rounds to whole batches. Ingredients
must differ from the output, with at least one positive requirement. `smelt`
assumes one input produces one output, and requires distinct input/output/fuel
to avoid double counting. These commands do not verify that a recipe or fuel is
valid, and ignore containers, byproducts, and initial in-progress jobs.

Capacity uses item-name stack-size estimates, not components or merge
restrictions. `payload` and `delivery-budget` start with an empty inventory
except the requested reserved slots. Delivery budgets include a return after
every trip and exclude loading time. `reserved-capacity` estimates additions
to current inventory and reports whether the requested empty-slot reservation
can be met. `source-trips` evaluates each container independently; `cache-reach`
requires one sufficient source per item, using independent out-and-back trips.
Storage contents are last observed and do not prove fresh availability or
reachability. `kit-priority` selects complete shortfalls by shortest completion
time, skipping those that do not fit; it does not partially fill them.

## Commands

| # | Command | Result |
| --- | --- | --- |
| 1 | `time-to <point> <speed>` | Estimate travel seconds from the observed position at blocks per second. |
| 2 | `time-home <speed>` | Estimate travel to a home in the same known dimension. |
| 3 | `round-trip <point> <speed> <work-seconds>` | Budget out-and-back travel to the current position plus explicit work. |
| 4 | `rendezvous <point> <speed> <seconds>` | Estimate required departure delay or lateness for an arrival deadline. |
| 5 | `route-budget <speed> <seconds> <points...>` | Locate the first ordered stop exceeding a travel-time budget. |
| 6 | `home-deadline <speed> <seconds>` | Estimate work time remaining before departing for home. |
| 7 | `operating-radius <speed> <seconds> <work-seconds>` | Calculate an out-and-back radius after reserving work time. |
| 8 | `food-load <food> <minutes> <hunger-per-minute>` | Calculate the chosen food quantity and carried shortfall for a trip. |
| 9 | `food-plan <minutes> <hunger-per-minute>` | Allocate carried food by hunger per item to a trip budget. |
| 10 | `food-margin <minutes> <hunger-per-minute>` | Compare supported carried food with explicit trip demand. |
| 11 | `collect-time <item> <target> <items-per-minute>` | Estimate time to fill a carried item target. |
| 12 | `collect-deadline <item> <target> <items-per-minute> <minutes>` | Check a target against a collection time budget. |
| 13 | `kit-time <items-per-minute> <entries...>` | Budget sequential collection of carried kit shortfalls at a shared rate. |
| 14 | `kit-priority <items-per-minute> <minutes> <entries...>` | Select whole kit shortfalls by shortest estimated completion time. |
| 15 | `source-trips <item> <count> <speed>` | Compare standalone out-and-back storage withdrawals by time and yield. |
| 16 | `resource-trips <block> <speed> <work-seconds>` | Rank observed block positions by round-trip time plus work. |
| 17 | `refresh-budget <speed> <seconds-per-container>` | Estimate a nearest-neighbor tour inspecting all known containers. |
| 18 | `payload <item> <reserved-slots>` | Estimate an empty load with explicitly reserved inventory slots. |
| 19 | `delivery-budget <item> <count> <reserved-slots> <point> <speed>` | Budget repeated round-trip deliveries from the current position. |
| 20 | `reserved-capacity <item> <reserved-free-slots>` | Estimate current additional capacity after reserving empty slots. |
| 21 | `recipe <output> <target> <yield> <ingredients...>` | Budget a manually supplied recipe from carried stock. |
| 22 | `fuel <fuel> <items-per-fuel> <items>` | Budget whole fuel units from a supplied processing yield. |
| 23 | `smelt <input> <output> <target> <fuel> <items-per-fuel>` | Budget a supplied one-input-to-one-output processing job and fuel. |
| 24 | `ration-days <days> <hunger-per-day>` | Split supported carried hunger evenly across a requested number of days. |
| 25 | `cache-reach <speed> <seconds> <entries...>` | Check whether each kit shortfall has one sufficient cache within a round-trip budget. |
