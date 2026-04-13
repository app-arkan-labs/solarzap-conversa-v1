import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const APP_URL = process.env.SOLARZAP_APP_URL || 'https://app.solarzap.com.br/login';
const APP_EMAIL = process.env.SOLARZAP_APP_EMAIL;
const APP_PASSWORD = process.env.SOLARZAP_APP_PASSWORD;
const GOOGLE_EMAIL = process.env.GOOGLE_ACCOUNT_EMAIL;
const GOOGLE_PASSWORD = process.env.GOOGLE_ACCOUNT_PASSWORD;
const OUTPUT_PATH = process.env.VIDEO_OUTPUT_PATH || path.resolve('artifacts', `google-ads-verification-${Date.now()}.mp4`);
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const BROWSER_EXECUTABLE_PATH = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function requireEnv(name, value) {
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function serializePatterns(patterns) {
  const values = Array.isArray(patterns) ? patterns : [patterns];
  return values.map((pattern) => ({ source: pattern.source, flags: pattern.flags }));
}

async function clickTextButton(page, patterns) {
  const values = Array.isArray(patterns) ? patterns : [patterns];
  for (const pattern of values) {
    const locator = page.getByRole('button', { name: pattern });
    const count = await locator.count().catch(() => 0);
    if (count > 0) {
      try {
        await locator.first().click({ force: true });
        return true;
      } catch {
        continue;
      }
    }
  }

  return false;
}

async function clickReadyTextButton(page, patterns, timeout = 30000) {
  const values = Array.isArray(patterns) ? patterns : [patterns];
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const pattern of values) {
      const locator = page.getByRole('button', { name: pattern });
      const count = await locator.count().catch(() => 0);
      if (!count) {
        continue;
      }

      const button = locator.first();
      const isEnabled = await button.isEnabled().catch(() => false);
      if (!isEnabled) {
        continue;
      }

      try {
        await button.click({ force: true });
        return true;
      } catch {
        continue;
      }
    }

    await sleep(500);
  }

  return false;
}

async function clickDomButtonByText(page, patterns, timeout = 30000) {
  return clickDomElementByText(page, patterns, 'button', timeout);
}

async function clickDomElementByText(page, patterns, selector, timeout = 30000) {
  const serializedPatterns = serializePatterns(patterns);
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const clicked = await page.evaluate(({ compiledPatterns, targetSelector }) => {
      const matchers = compiledPatterns.map((pattern) => new RegExp(pattern.source, pattern.flags));
      const elements = Array.from(document.querySelectorAll(targetSelector));

      for (const element of elements) {
        const text = element.textContent?.trim() || '';
        if (!text || element.hasAttribute('disabled')) {
          continue;
        }

        if (matchers.some((matcher) => matcher.test(text))) {
          element.click();
          return true;
        }
      }

      return false;
    }, { compiledPatterns: serializedPatterns, targetSelector: selector }).catch(() => false);

    if (clicked) {
      return true;
    }

    await sleep(500);
  }

  return false;
}

async function ensureDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function startRecording(outputPath) {
  await ensureDir(outputPath);

  const args = [
    '-y',
    '-f', 'gdigrab',
    '-framerate', '15',
    '-draw_mouse', '1',
    '-i', 'desktop',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ];

  const proc = spawn(FFMPEG_PATH, args, {
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: false,
  });

  let stderr = '';
  proc.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  proc.on('error', (error) => {
    throw error;
  });

  await sleep(1500);

  return {
    proc,
    async stop() {
      if (!proc.killed && proc.exitCode === null) {
        proc.stdin.write('q');
      }

      await new Promise((resolve) => {
        proc.once('exit', resolve);
        setTimeout(resolve, 5000);
      });

      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
      }

      if (proc.exitCode !== 0 && proc.exitCode !== null) {
        throw new Error(`ffmpeg exited with code ${proc.exitCode}: ${stderr}`);
      }
    },
  };
}

async function dismissIfVisible(page, pattern) {
  const button = page.getByRole('button', { name: pattern });
  if (await button.count().catch(() => 0)) {
    await button.first().click({ force: true }).catch(() => null);
    await sleep(500);
  }
}

async function clickOAuthAction(page, patterns) {
  const clickedByRole = await clickReadyTextButton(page, patterns, 15000);
  if (clickedByRole) {
    return true;
  }

  return clickDomButtonByText(page, patterns, 15000);
}

async function clickReadyTextLink(page, patterns, timeout = 30000) {
  const values = Array.isArray(patterns) ? patterns : [patterns];
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const pattern of values) {
      const locator = page.getByRole('link', { name: pattern });
      const count = await locator.count().catch(() => 0);
      if (!count) {
        continue;
      }

      try {
        await locator.first().click({ force: true });
        return true;
      } catch {
        continue;
      }
    }

    await sleep(500);
  }

  return false;
}

async function clickVisibleText(page, patterns, timeout = 30000) {
  const values = Array.isArray(patterns) ? patterns : [patterns];
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const pattern of values) {
      const locator = page.getByText(pattern).first();
      const count = await locator.count().catch(() => 0);
      if (!count) {
        continue;
      }

      try {
        await locator.click({ force: true });
        return true;
      } catch {
        continue;
      }
    }

    await sleep(500);
  }

  return false;
}

async function clickDomAnyElementByText(page, patterns, timeout = 30000) {
  const serializedPatterns = serializePatterns(patterns);
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const clicked = await page.evaluate((compiledPatterns) => {
      const matchers = compiledPatterns.map((pattern) => new RegExp(pattern.source, pattern.flags));
      const elements = Array.from(document.querySelectorAll('body *'));

      for (const element of elements) {
        const text = element.textContent?.trim() || '';
        if (!text || element.hasAttribute('disabled')) {
          continue;
        }

        if (matchers.some((matcher) => matcher.test(text))) {
          element.click();
          return true;
        }
      }

      return false;
    }, serializedPatterns).catch(() => false);

    if (clicked) {
      return true;
    }

    await sleep(500);
  }

  return false;
}

async function clickOAuthLinkAction(page, patterns) {
  const clickedByRole = await clickReadyTextLink(page, patterns, 15000);
  if (clickedByRole) {
    return true;
  }

  const clickedByText = await clickVisibleText(page, patterns, 15000);
  if (clickedByText) {
    return true;
  }

  const clickedByDomText = await clickDomAnyElementByText(page, patterns, 15000);
  if (clickedByDomText) {
    return true;
  }

  return clickDomElementByText(page, patterns, 'a', 15000);
}

async function loginToApp(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Email' }).fill(requireEnv('SOLARZAP_APP_EMAIL', APP_EMAIL));
  await page.getByRole('textbox', { name: 'Senha' }).fill(requireEnv('SOLARZAP_APP_PASSWORD', APP_PASSWORD));
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => url.origin === 'https://app.solarzap.com.br' && url.pathname === '/', { timeout: 30000 });
  await page.getByTestId('nav-settings-trigger').waitFor({ timeout: 30000 });
  await sleep(2000);
}

async function openTracking(page) {
  const desktopSettingsTrigger = page.getByTestId('nav-settings-trigger');
  const desktopTrackingButton = page.getByTestId('nav-tracking');

  if (await desktopSettingsTrigger.count().catch(() => 0)) {
    await desktopSettingsTrigger.click({ force: true });
    await desktopTrackingButton.waitFor({ timeout: 10000 });
    await desktopTrackingButton.click({ force: true });
  } else {
    await clickTextButton(page, /Mais/i);
    await sleep(800);
    await clickTextButton(page, /Configuracoes/i);
    await sleep(800);
    await page.getByTestId('mobile-more-item-tracking').click({ force: true });
  }

  await page.getByRole('heading', { name: /Tracking & Conversões/i }).waitFor({ timeout: 30000 });
  await sleep(1500);
}

async function ensureDisconnected(page) {
  const disconnect = page.getByRole('button', { name: /Desconectar/i });
  if (await disconnect.count().catch(() => 0)) {
    await disconnect.first().click({ force: true }).catch(() => null);
    await page.getByRole('button', { name: /Conectar Google Ads/i }).waitFor({ timeout: 30000 });
    await sleep(1000);
  }
}

async function googleNext(page, selector) {
  await page.evaluate((nextSelector) => {
    const next = document.querySelector(nextSelector);
    if (next) next.click();
  }, selector);
}

async function runFlow() {
  const browser = await chromium.launch({
    headless: false,
    executablePath: BROWSER_EXECUTABLE_PATH,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--start-maximized',
      '--window-position=0,0',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    viewport: null,
    locale: 'en-US',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  const page = await context.newPage();
  await page.bringToFront();

  try {
    await loginToApp(page);
    await dismissIfVisible(page, /Fechar tour|Pular|Agora não/i);
    await openTracking(page);
    await ensureDisconnected(page);

    const recorder = await startRecording(OUTPUT_PATH);

    try {
      await sleep(1000);
      await page.bringToFront();
      await sleep(1000);

      await page.getByRole('button', { name: /Conectar Google Ads/i }).waitFor({ timeout: 30000 });
      const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
      const didClickConnect = await clickTextButton(page, /Conectar Google Ads/i);
      if (!didClickConnect) {
        throw new Error('Could not click the Google Ads connect button.');
      }
      const popup = await popupPromise;
      const oauthPage = popup ?? page;

      await oauthPage.waitForURL(/accounts\.google\.com/, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });
      await sleep(2500);

      const existingAccount = oauthPage.getByRole('button', {
        name: new RegExp(escapeRegex(requireEnv('GOOGLE_ACCOUNT_EMAIL', GOOGLE_EMAIL)), 'i'),
      });
      if (await existingAccount.count().catch(() => 0)) {
        await existingAccount.first().click({ force: true }).catch(() => null);
        await sleep(2000);
      }

      const emailField = oauthPage.locator('input[type="email"]');
      if (await emailField.count().catch(() => 0)) {
        await emailField.fill(requireEnv('GOOGLE_ACCOUNT_EMAIL', GOOGLE_EMAIL));
        await sleep(1000);
        await clickOAuthAction(oauthPage, [/^Next$/i, /^Próxima$/i, /^Próximo$/i, /^Avançar$/i, /^Seguinte$/i]);
      }

      await oauthPage.waitForLoadState('domcontentloaded');
      await sleep(2500);

      const passwordField = oauthPage.locator('input[type="password"]');
      if (await passwordField.count().catch(() => 0)) {
        await passwordField.fill(requireEnv('GOOGLE_ACCOUNT_PASSWORD', GOOGLE_PASSWORD));
        await sleep(1000);
        await clickOAuthAction(oauthPage, [/^Next$/i, /^Próxima$/i, /^Próximo$/i, /^Avançar$/i, /^Seguinte$/i]);
      }

      await oauthPage.waitForURL(/oauth\/warning|legacy\/consent|oauth\/consent|app\.solarzap\.com\.br/, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });
      await sleep(4000);

      if (/oauth\/warning/.test(oauthPage.url())) {
        const openedAdvanced = await clickOAuthLinkAction(oauthPage, [/^Advanced$/i, /^Avançado$/i]);
        if (!openedAdvanced) {
          throw new Error('Could not open the Google unverified app warning advanced section.');
        }

        await sleep(1000);

        const continuedUnsafe = await clickOAuthLinkAction(oauthPage, [/SolarZap CRM/i, /unsafe/i, /não seguro/i]);
        if (!continuedUnsafe) {
          throw new Error('Could not continue past the Google unverified app warning screen.');
        }

        await oauthPage.waitForURL(/legacy\/consent|oauth\/consent|app\.solarzap\.com\.br/, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
        await sleep(3000);
      }

      if (!/app\.solarzap\.com\.br/.test(oauthPage.url())) {
        const approved = await clickOAuthAction(oauthPage, [/Allow/i, /Permitir/i, /Continue/i, /Continuar/i]);
        if (!approved) {
          const consentDebug = await oauthPage.evaluate(() => ({
            title: document.title,
            url: window.location.href,
            bodyText: document.body?.innerText?.slice(0, 2000) || '',
            buttons: Array.from(document.querySelectorAll('button')).map((button) => ({
              text: button.textContent?.trim() || '',
              disabled: button.hasAttribute('disabled'),
            })),
            links: Array.from(document.querySelectorAll('a')).map((link) => ({
              text: link.textContent?.trim() || '',
              href: link.getAttribute('href') || '',
            })),
          })).catch(() => null);
          throw new Error(`Could not click the Google consent approval button. ${JSON.stringify(consentDebug)}`);
        }
      }

      await oauthPage.waitForURL(/app\.solarzap\.com\.br/, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });
      await sleep(3000);

      const appPage = popup ?? page;
      await openTracking(appPage);
      await sleep(2500);

      const combo = appPage.getByRole('combobox').first();
      await combo.click({ force: true }).catch(() => null);
      await sleep(4000);
    } finally {
      await recorder.stop();
    }
  } finally {
    await context.close().catch(() => null);
    await browser.close().catch(() => null);
  }
}

runFlow()
  .then(() => {
    console.log(`Video saved to ${OUTPUT_PATH}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });