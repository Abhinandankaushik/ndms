import { expect, test, type Page } from '@playwright/test';

// Walks the whole product the way the demo does, capturing a screenshot per screen and
// measuring criterion O1: the time from sending an SOS to it appearing on the officer's
// dashboard without a refresh.
const OTP = '123456';
const PHONES = {
  citizen: '90000 00001',
  official: '90000 00013',
  rescue: '90000 00007',
  facility: '90000 00010',
};

test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, phone: string, expectedPath: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.locator('form button[type="submit"]').click();
  await page.getByLabel('6-digit code').fill(OTP);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(expectedPath, { timeout: 20_000 });
}

async function shoot(page: Page, name: string) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.screenshot({ path: `demo-screenshots/${name}.png`, fullPage: false });
}

test('citizen portal', async ({ page }) => {
  await signIn(page, PHONES.citizen, /\/citizen/);
  await shoot(page, '01-citizen-sos');

  for (const [path, name] of [
    ['/citizen/shelters', '02-citizen-shelters'],
    ['/citizen/alerts', '03-citizen-alerts'],
    ['/citizen/contacts', '04-citizen-contacts'],
    ['/citizen/report', '05-citizen-report'],
  ] as const) {
    await page.goto(path);
    await shoot(page, name);
  }
});

test('government dashboard', async ({ page }) => {
  await signIn(page, PHONES.official, /\/govt/);
  await shoot(page, '06-govt-dashboard');

  for (const [path, name] of [
    ['/govt/missions', '07-govt-missions'],
    ['/govt/resources', '08-govt-resources'],
    ['/govt/reviews', '09-govt-reviews'],
    ['/govt/alerts', '10-govt-alerts'],
    ['/govt/volunteers', '11-govt-volunteers'],
  ] as const) {
    await page.goto(path);
    await shoot(page, name);
  }
});

test('rescue and facility portals', async ({ browser }) => {
  const rescue = await browser.newPage();
  await signIn(rescue, PHONES.rescue, /\/rescue/);
  await shoot(rescue, '12-rescue-missions');
  await rescue.close();

  const facility = await browser.newPage();
  await signIn(facility, PHONES.facility, /\/facility/);
  await shoot(facility, '13-facility-occupancy');
  await facility.close();
});

test('O1: an SOS reaches the officer dashboard live', async ({ browser }) => {
  const officialContext = await browser.newContext();
  const official = await officialContext.newPage();
  await signIn(official, PHONES.official, /\/govt/);
  await official.waitForLoadState('networkidle').catch(() => undefined);

  const queueRows = official.locator('[data-slot="card"], li, tr');
  const before = await queueRows.count();

  const citizenContext = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: 26.1542, longitude: 85.8918 },
  });
  const citizen = await citizenContext.newPage();
  await signIn(citizen, PHONES.citizen, /\/citizen/);

  const sos = citizen.getByRole('button', { name: /press and hold/i });
  await sos.hover();
  await citizen.mouse.down();
  await citizen.waitForTimeout(3_400);
  await citizen.mouse.up();

  const confirm = citizen.getByRole('button', { name: /send( the)? sos|yes|confirm/i });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  }

  const sentAt = Date.now();
  await expect
    .poll(async () => queueRows.count(), { timeout: 15_000, intervals: [200] })
    .toBeGreaterThan(before);
  const elapsedMs = Date.now() - sentAt;

  await shoot(citizen, '14-citizen-sos-sent');
  await shoot(official, '15-govt-sos-received');
  console.log(`O1: SOS visible on the officer dashboard in ${elapsedMs} ms (target < 5000 ms)`);
  expect(elapsedMs).toBeLessThan(5_000);

  await citizenContext.close();
  await officialContext.close();
});
