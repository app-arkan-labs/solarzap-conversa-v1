import { test, expect, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env vars for notification recipients e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  legacyInstanceName: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: "",
  email: "",
  password: "",
  legacyInstanceName: "",
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/", { timeout: 30_000 });
}

async function openNotificationSettings(page: Page) {
  await page.getByTestId("nav-notifications-trigger").click();
  await expect(
    page.getByRole("heading", { name: /Notifica/ }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("notifications-open-settings").click();
  await expect(page.getByText("Canais de Envio")).toBeVisible({
    timeout: 20_000,
  });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `e2e.notifications.${suffix}@example.test`;
  state.password = `NotifRcpt!${suffix}Aa1`;
  state.legacyInstanceName = `legacy-notification-instance-${suffix}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(
      `Failed to create e2e user: ${userResp.error?.message || "unknown"}`,
    );
  }
  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from("organizations").insert({
    id: state.orgId,
    name: `Notification Recipients Org ${suffix}`,
    owner_id: state.userId,
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from("organization_members").insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: "owner",
    can_view_team_leads: true,
  });
  if (memberErr) {
    throw new Error(`Failed to create membership: ${memberErr.message}`);
  }

  const { error: settingsErr } = await admin
    .from("notification_settings")
    .upsert(
      {
        org_id: state.orgId,
        enabled_notifications: true,
        enabled_whatsapp: false,
        enabled_email: true,
        whatsapp_instance_name: state.legacyInstanceName,
        whatsapp_recipients: [],
        email_recipients: [],
        email_sender_name: "Qualquer Nome Antigo",
        email_reply_to: "antigo@cliente.com",
        updated_by: state.userId,
      },
      { onConflict: "org_id" },
    );
  if (settingsErr) {
    throw new Error(
      `Failed to seed notification settings: ${settingsErr.message}`,
    );
  }
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin
      .from("notification_settings")
      .delete()
      .eq("org_id", state.orgId);
    await admin.from("organization_members").delete().eq("org_id", state.orgId);
    await admin.from("organizations").delete().eq("id", state.orgId);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test("notification recipients editor keeps only recipients editable and whatsapp no longer depends on local instance", async ({
  page,
}) => {
  await login(page, state.email, state.password);
  await openNotificationSettings(page);

  await expect(
    page.getByText(/instancia SolarZap configurada no painel admin/i),
  ).toBeVisible();
  await expect(
    page.getByText(/ARKAN SOLAR/i),
  ).toBeVisible();
  await expect(
    page.getByText(/contato@arkanlabs.com.br/i),
  ).toBeVisible();

  await expect(
    page.getByTestId("notification-whatsapp-instance-trigger"),
  ).toHaveCount(0);

  await page
    .getByTestId("notification-whatsapp-input")
    .fill("5511999990001, 5511999990002;5511999990003");
  await page.getByTestId("notification-whatsapp-add").click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("notification_settings")
          .select("whatsapp_recipients")
          .eq("org_id", state.orgId)
          .single();
        if (error) return `ERROR:${error.message}`;
        return (data.whatsapp_recipients || []).join(",");
      },
      { timeout: 20_000 },
    )
    .toBe("5511999990001,5511999990002,5511999990003");

  await page.getByTestId("notification-whatsapp-remove-5511999990002").click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("notification_settings")
          .select("whatsapp_recipients")
          .eq("org_id", state.orgId)
          .single();
        if (error) return `ERROR:${error.message}`;
        return (data.whatsapp_recipients || []).join(",");
      },
      { timeout: 20_000 },
    )
    .toBe("5511999990001,5511999990003");

  await page
    .getByTestId("notification-email-input")
    .fill("ops@cliente.com; financeiro@cliente.com");
  await page.getByTestId("notification-email-add").click();
  await page
    .getByTestId("notification-email-remove-financeiro-cliente-com")
    .click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("notification_settings")
          .select("email_recipients")
          .eq("org_id", state.orgId)
          .single();
        if (error) return `ERROR:${error.message}`;
        return (data.email_recipients || []).join(",");
      },
      { timeout: 20_000 },
    )
    .toBe("ops@cliente.com");

  const whatsappToggle = page.getByTestId("notification-whatsapp-toggle");
  await expect(whatsappToggle).toHaveAttribute("aria-checked", "false");
  await whatsappToggle.click();
  await expect(whatsappToggle).toHaveAttribute("aria-checked", "true");

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("notification_settings")
          .select("enabled_whatsapp, whatsapp_instance_name")
          .eq("org_id", state.orgId)
          .single();
        if (error) return `ERROR:${error.message}`;
        return JSON.stringify({
          enabled_whatsapp: data.enabled_whatsapp,
          whatsapp_instance_name: data.whatsapp_instance_name,
        });
      },
      { timeout: 20_000 },
    )
    .toBe(
      JSON.stringify({
        enabled_whatsapp: true,
        whatsapp_instance_name: state.legacyInstanceName,
      }),
    );

  await page.reload();
  await openNotificationSettings(page);
  await expect(page.getByText("5511999990001")).toBeVisible();
  await expect(page.getByText("5511999990003")).toBeVisible();
  await expect(page.getByText("ops@cliente.com")).toBeVisible();
  await expect(
    page.getByTestId("notification-whatsapp-instance-trigger"),
  ).toHaveCount(0);
});
