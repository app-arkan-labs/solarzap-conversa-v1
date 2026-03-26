import {
  buildDashboardFunnel,
  buildLossSummary,
  buildSourcePerformance,
} from "@/lib/dashboardMetrics";

describe("dashboard metrics helpers", () => {
  it("builds funnel groups, stale counts and stage entries", () => {
    const now = new Date("2026-03-25T12:00:00.000Z");

    const funnel = buildDashboardFunnel(
      [
        { status_pipeline: "novo_lead", stage_changed_at: "2026-03-25T10:00:00.000Z" },
        { status_pipeline: "respondeu", stage_changed_at: "2026-03-24T10:00:00.000Z" },
        { status_pipeline: "proposta_negociacao", stage_changed_at: "2026-03-10T10:00:00.000Z" },
        { status_pipeline: "perdido", stage_changed_at: "2026-03-20T10:00:00.000Z" },
      ],
      [
        { to_stage: "novo_lead" },
        { to_stage: "proposta_negociacao" },
        { to_stage: "perdido" },
      ],
      now,
    );

    expect(funnel.total).toBe(4);
    expect(funnel.active).toBe(3);
    expect(funnel.lost_in_period).toBe(1);
    expect(funnel.stale_total).toBeGreaterThan(0);
    expect(funnel.top_bottleneck_stage).toBe("proposta_negociacao");
    expect(funnel.by_group.find((group) => group.key === "saida")?.count).toBe(1);
    expect(funnel.by_stage.find((row) => row.stage === "proposta_negociacao")?.entered_in_period).toBe(1);
  });

  it("merges leads and sales into source quality rows", () => {
    const rows = buildSourcePerformance(
      [
        { canal: "whatsapp" },
        { canal: "whatsapp" },
        { canal: "google_ads" },
      ],
      [
        { source: "whatsapp", revenue: 10000 },
        { source: "google_ads", revenue: 18000 },
      ],
    );

    expect(rows[0].source).toBe("google_ads");
    expect(rows.find((row) => row.source === "whatsapp")?.conversion_pct).toBeCloseTo(50);
    expect(rows.find((row) => row.source === "google_ads")?.revenue).toBe(18000);
  });

  it("summarizes losses against the previous period", () => {
    const summary = buildLossSummary(
      [
        { reason_key: "financeiro", reason_label: "Financeiro" },
        { reason_key: "financeiro", reason_label: "Financeiro" },
        { reason_key: "concorrente", reason_label: "Concorrente" },
      ],
      [
        { reason_key: "concorrente", reason_label: "Concorrente" },
      ],
    );

    expect(summary.total).toBe(3);
    expect(summary.previous_total).toBe(1);
    expect(summary.change_pct).toBe(200);
    expect(summary.top_reason?.key).toBe("financeiro");
    expect(summary.top_reason?.share).toBe(67);
  });
});
