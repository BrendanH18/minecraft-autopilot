import { SERIES_SPECS, seriesReport, registerSeries } from './evidence-series-common.js';
export const INVENTORY_SERIES_COMMANDS = SERIES_SPECS.map(([name, args, description]) => [
  `${name} <item>${args} <files...>`,
  description,
]);
export const inventorySeriesReport = (values, selector, command, args = []) =>
  seriesReport('inventory', values, selector, command, args);
export const registerInventorySeriesTools = (program, context) =>
  registerSeries(program, 'inventory-series', 'inventory', INVENTORY_SERIES_COMMANDS, context);
