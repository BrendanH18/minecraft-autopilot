// Read-only and offline tool groups that the core commands (observe, stop, mcp, actions) never need.
// The CLI imports them only when the command isn't a core one, so takeover commands start quickly.
// Order matters: it is the order the commands appear in `mc-agent --help`.
export const TOOL_GROUPS = [
  ['./supplies.js', 'registerSupplies'],
  ['./survey.js', 'registerSurvey'],
  ['./navigation.js', 'registerNavigation'],
  ['./routine-tools.js', 'registerRoutineTools'],
  ['./stock-tools.js', 'registerStockTools'],
  ['./scene-tools.js', 'registerSceneTools'],
  ['./geometry-tools.js', 'registerGeometryTools'],
  ['./routine-workbench.js', 'registerRoutineWorkbench'],
  ['./timeline-tools.js', 'registerTimelineTools'],
  ['./terrain-tools.js', 'registerTerrainTools'],
  ['./logistics-tools.js', 'registerLogisticsTools'],
  ['./routine-audit.js', 'registerRoutineAudit'],
  ['./expedition-tools.js', 'registerExpeditionTools'],
  ['./blueprint-tools.js', 'registerBlueprintTools'],
  ['./snapshot-checks.js', 'registerCheckpointTools'],
  ['./routine-compose.js', 'registerRoutineCompose'],
  ['./itinerary-tools.js', 'registerItineraryTools'],
  ['./workarea-tools.js', 'registerWorkareaTools'],
  ['./ledger-tools.js', 'registerLedgerTools'],
  ['./depot-tools.js', 'registerDepotTools'],
  ['./journal-tools.js', 'registerJournalTools'],
  ['./diagnose-tools.js', 'registerDiagnoseTools'],
  ['./routine-compare.js', 'registerRoutineCompare'],
  ['./routine-select.js', 'registerRoutineSelect'],
  ['./bearing-tools.js', 'registerBearingTools'],
  ['./grid-tools.js', 'registerGridTools'],
  ['./shape-tools.js', 'registerShapeTools'],
  ['./earthworks-tools.js', 'registerEarthworksTools'],
  ['./railplan-tools.js', 'registerRailplanTools'],
  ['./lightplan-tools.js', 'registerLightplanTools'],
  ['./perimeter-tools.js', 'registerPerimeterTools'],
  ['./packing-tools.js', 'registerPackingTools'],
  ['./production-tools.js', 'registerProductionTools'],
  ['./fuelplan-tools.js', 'registerFuelplanTools'],
  ['./tradeplan-tools.js', 'registerTradeplanTools'],
  ['./farmplan-tools.js', 'registerFarmplanTools'],
  ['./ration-tools.js', 'registerRationTools'],
  ['./allocation-tools.js', 'registerAllocationTools'],
  ['./inventory-series-tools.js', 'registerInventorySeriesTools'],
  ['./storage-series-tools.js', 'registerStorageSeriesTools'],
  ['./vitals-series-tools.js', 'registerVitalsSeriesTools'],
  ['./routine-metrics-tools.js', 'registerRoutineMetricsTools'],
  ['./event-query-tools.js', 'registerEventQueryTools'],
  ['./snapshot-query-tools.js', 'registerSnapshotQueryTools'],
];

// context holds the CLI helpers the groups use: { view, print }.
export async function registerToolGroups(program, context) {
  const modules = await Promise.all(TOOL_GROUPS.map(([specifier]) => import(specifier)));
  TOOL_GROUPS.forEach(([specifier, name], index) => {
    const register = modules[index][name];
    if (typeof register !== 'function') throw new Error(`${specifier} does not export ${name}.`);
    register(program, context);
  });
}
