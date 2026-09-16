import { expect, test, type APIRequestContext } from '@playwright/test';

// Measures the success criteria that need a real browser: O2 (offline reports arrive
// exactly once) and O3 (the officer map stays fast with thousands of incidents).
const API = process.env.NDMS_API_ORIGIN ?? 'http://localhost:3000';
const OTP = '123456';
const CITIZEN_E164 = '+919000000002';
const CITIZEN_NATIONAL = '90000 00002';
const OFFICIAL_NATIONAL = '90000 00013';

async function apiToken(request: APIRequestContext, phone: string): Promise<string> {
  await request.post(`${API}/api/v1/auth/otp/send`, { data: { phone } });
  const verified = await request.post(`${API}/api/v1/auth/otp/verify`, { data: { phone, code: OTP } });
  const body = (await verified.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

async function myIncidentCount(request: APIRequestContext, token: string): Promise<number> {
  const response = await request.get(`${API}/api/v1/incidents/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json()) as { data: unknown[] };
  return body.data.length;
}

test('O2: a report made offline arrives exactly once after reconnecting', async ({ browser, request }) => {
  const token = await apiToken(request, CITIZEN_E164);
  const before = await myIncidentCount(request, token);

  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 26.1542, longitude: 85.8918 },
  });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(CITIZEN_NATIONAL);
  await page.locator('form button[type="submit"]').click();
  await page.getByLabel('6-digit code').fill(OTP);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/citizen/, { timeout: 20_000 });

  await context.setOffline(true);
  const sos = page.getByRole('button', { name: /press and hold/i });
  await sos.hover();
  await page.mouse.down();
  await page.waitForTimeout(3_400);
  await page.mouse.up();
  const confirm = page.getByRole('button', { name: /send( the)? sos|yes|confirm/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();

  await expect(page.getByText(/saved on this phone|queued|offline/i).first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'demo-screenshots/16-citizen-offline-queued.png' });
  expect(await myIncidentCount(request, token)).toBe(before);

  await context.setOffline(false);
  await expect
    .poll(async () => myIncidentCount(request, token), { timeout: 30_000, intervals: [500] })
    .toBe(before + 1);

  // Nothing may arrive twice, however often the outbox retries.
  await page.waitForTimeout(5_000);
  expect(await myIncidentCount(request, token)).toBe(before + 1);
  await page.screenshot({ path: 'demo-screenshots/17-citizen-offline-synced.png' });
  await context.close();
});

test('O3: the officer map renders the district at scale', async ({ page, request }) => {
  const response = await request.get(`${API}/api/v1/health`);
  expect(response.ok()).toBeTruthy();

  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(OFFICIAL_NATIONAL);
  await page.locator('form button[type="submit"]').click();
  await page.getByLabel('6-digit code').fill(OTP);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/govt/, { timeout: 20_000 });

  const startedAt = Date.now();
  await page.reload();
  const inView = page.getByText(/incidents in view/i).first();
  await inView.waitFor({ timeout: 20_000 });
  const renderedMs = Date.now() - startedAt;

  const label = (await inView.textContent()) ?? '';
  console.log(`O3: officer map ready in ${renderedMs} ms showing "${label.trim()}" (target < 2000 ms)`);
  await page.screenshot({ path: 'demo-screenshots/18-govt-map-at-scale.png' });
  expect(renderedMs).toBeLessThan(2_000);
});
