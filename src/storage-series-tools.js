import { SERIES_SPECS, seriesReport, registerSeries } from './evidence-series-common.js';
export const STORAGE_SERIES_COMMANDS = SERIES_SPECS.map(([name, args, description]) => [
  name + ' <item>' + args + ' <files...>',
  description,
]);
export const storageSeriesReport = (values, selector, command, args = []) =>
  seriesReport('storage', values, selector, command, args);
export const registerStorageSeriesTools = (program, context) =>
  registerSeries(program, 'storage-series', 'storage', STORAGE_SERIES_COMMANDS, context);
