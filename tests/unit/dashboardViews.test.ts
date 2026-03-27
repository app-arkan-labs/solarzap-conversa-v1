import { describe, expect, it } from "vitest";

import {
  DASHBOARD_VIEW_OPTIONS,
  getDashboardViewMeta,
  parseDashboardVisualization,
} from "@/lib/dashboardViews";

describe("dashboardViews", () => {
  it("falls back to today for missing or invalid query values", () => {
    expect(parseDashboardVisualization(undefined)).toBe("today");
    expect(parseDashboardVisualization(null)).toBe("today");
    expect(parseDashboardVisualization("")).toBe("today");
    expect(parseDashboardVisualization("unknown")).toBe("today");
  });

  it("parses known view names case-insensitively", () => {
    expect(parseDashboardVisualization("today")).toBe("today");
    expect(parseDashboardVisualization("SALES")).toBe("sales");
    expect(parseDashboardVisualization("financial")).toBe("financial");
    expect(parseDashboardVisualization("losses")).toBe("losses");
  });

  it("exposes metadata for every configured view", () => {
    expect(DASHBOARD_VIEW_OPTIONS).toHaveLength(4);

    for (const option of DASHBOARD_VIEW_OPTIONS) {
      expect(getDashboardViewMeta(option.value)).toMatchObject({
        value: option.value,
        label: option.label,
      });
    }
  });
});
