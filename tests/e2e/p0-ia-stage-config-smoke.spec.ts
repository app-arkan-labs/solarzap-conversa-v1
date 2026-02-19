import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for P0 IA stage smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  stage: string;
  expectedPrompt: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  stage: 'respondeu',
  expectedPrompt: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
}

async function openAiSettings(page: Page) {
  const settingsTrigger = page.getByTestId('nav-settings-trigger');
  const aiButton = page.getByTestId('nav-ia-agentes');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await settingsTrigger.click();
    const appeared = await aiButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!appeared) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      continue;
    }

    const clicked = await aiButton
      .click({ force: true, timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (clicked) {
      break;
    }
  }

  await page.getByRole('heading', { name: /Intelig/i }).waitFor({ state: 'visible', timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `p0.ia.stage.${suffix}@example.test`;
  state.password = `P0IaStage!${suffix}Aa1`;
  state.expectedPrompt = `P0 IA stage prompt ${suffix}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, p0_ia_stage: true },
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create P0 IA stage user: ${userResp.error?.message || 'unknown'}`);
  }

  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `P0 IA Stage Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create membership: ${memberErr.message}`);

  const { error: settingsErr } = await admin.from('ai_settings').upsert(
    {
      org_id: state.orgId,
      is_active: true,
      assistant_identity_name: 'P0 IA Stage',
    },
    { onConflict: 'org_id' },
  );
  if (settingsErr) throw new Error(`Failed to upsert ai_settings baseline: ${settingsErr.message}`);

  const { error: stageErr } = await admin.from('ai_stage_config').upsert(
    {
      org_id: state.orgId,
      pipeline_stage: state.stage,
      is_active: false,
      agent_goal: 'Objetivo baseline',
      default_prompt: 'Prompt baseline',
      prompt_override: null,
    },
    { onConflict: 'org_id,pipeline_stage' },
  );
  if (stageErr) throw new Error(`Failed to upsert ai_stage_config baseline: ${stageErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('ai_stage_config').delete().eq('org_id', state.orgId);
    await admin.from('ai_settings').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('P0 IA stage smoke: toggle + prompt save + reload prefill', async ({ page }) => {
  await login(page, state.email, state.password);
  await openAiSettings(page);

  const card = page.getByTestId(`ai-stage-card-${state.stage}`);
  await expect(card).toBeVisible({ timeout: 30_000 });

  const stageSwitch = card.locator('[role="switch"]').first();
  const beforeState = await stageSwitch.getAttribute('data-state');
  await stageSwitch.click();

  const expectedIsActive = beforeState !== 'checked';

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('ai_stage_config')
          .select('is_active')
          .eq('org_id', state.orgId)
          .eq('pipeline_stage', state.stage)
          .limit(1)
          .maybeSingle();

        if (error) return `ERROR:${error.message}`;
        if (!data) return null;
        return data.is_active;
      },
      { timeout: 30_000 },
    )
    .toBe(expectedIsActive);

  await card.getByRole('button', { name: 'Editar Agente' }).click();
  await page.getByRole('button', { name: /Continuar/i }).click();

  const editor = page.locator('textarea').first();
  await editor.fill(state.expectedPrompt);
  await page.getByRole('button', { name: /Salvar Altera/i }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('ai_stage_config')
          .select('prompt_override')
          .eq('org_id', state.orgId)
          .eq('pipeline_stage', state.stage)
          .limit(1)
          .maybeSingle();

        if (error) return `ERROR:${error.message}`;
        if (!data) return null;
        return data.prompt_override;
      },
      { timeout: 30_000 },
    )
    .toBe(state.expectedPrompt);

  await page.reload();
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
  await openAiSettings(page);

  const cardAfterReload = page.getByTestId(`ai-stage-card-${state.stage}`);
  await expect(cardAfterReload).toBeVisible({ timeout: 30_000 });

  const switchAfterReload = cardAfterReload.locator('[role="switch"]').first();
  await expect(switchAfterReload).toHaveAttribute('data-state', expectedIsActive ? 'checked' : 'unchecked');

  await cardAfterReload.getByRole('button', { name: 'Editar Agente' }).click();
  await page.getByRole('button', { name: /Continuar/i }).click();

  const editorAfterReload = page.locator('textarea').first();
  await expect(editorAfterReload).toHaveValue(state.expectedPrompt);
});
