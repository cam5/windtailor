import type { ReconciliationReport } from "../model/types.js";

export function renderReportJson(report: ReconciliationReport): string {
  return JSON.stringify(report, null, 2);
}
