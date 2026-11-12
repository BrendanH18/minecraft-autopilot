import { SERIES_SPECS, seriesReport, registerSeries } from './evidence-series-common.js';
export const VITALS_SERIES_COMMANDS = SERIES_SPECS.map(([name, args, description]) => [name + ' <field>' + args + ' <files...>', description]);
export const vitalsSeriesReport = (values, selector, command, args = []) => seriesReport('vitals', values, selector, command, args);
export const registerVitalsSeriesTools = (program, context) => registerSeries(program, 'vitals-series', 'vitals', VITALS_SERIES_COMMANDS, context);
