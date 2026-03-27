import { describe, expect, it } from "vitest";

import {
  DASHBOARD_VIEW_OPTIONS,
  getDashboardViewMeta,
  parseDashboardVisualization,
} from "@/lib/dashboardViews";

describe("dashboardViews", () => {
  it("falls back to summary for missing or invalid query values", () => {
    expect(parseDashboardVisualization(undefined)).toBe("summary");
    expect(parseDashboardVisualization(null)).toBe("summary");
    expect(parseDashboardVisualization("")).toBe("summary");
    expect(parseDashboardVisualization("unknown")).toBe("summary");
  });

  it("parses known view names case-insensitively", () => {
    expect(parseDashboardVisualization("summary")).toBe("summary");
    expect(parseDashboardVisualization("COMMERCIAL")).toBe("commercial");
    expect(parseDashboardVisualization("Agenda")).toBe("agenda");
    expect(parseDashboardVisualization("financial")).toBe("financial");
    expect(parseDashboardVisualization("losses")).toBe("losses");
  });

  it("exposes metadata for every configured view", () => {
    expect(DASHBOARD_VIEW_OPTIONS).toHaveLength(5);

    for (const option of DASHBOARD_VIEW_OPTIONS) {
      expect(getDashboardViewMeta(option.value)).toMatchObject({
        value: option.value,
        label: option.label,
      });
    }
  });
});
