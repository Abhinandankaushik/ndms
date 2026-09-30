import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// The officer's route to one specific report. Without these controls a report that scores
// below the seeded ones is announced by a toast and then unreachable: it sits thousands of
// rows down the priority queue, and the queue only serves the first 200.
const OTP = '123456';
// The second and third seeded accounts of each role: /auth/otp/send allows five per phone
// per 15 minutes, and demo.spec and criteria.spec already spend that budget on 00013/00001.
const OFFICIAL = '90000 00014';
const CITIZEN_PHONE = '+919000000002';
const DARBHANGA = { latitude: 26.1542, longitude: 85.8918 };
const API = 'http://localhost:3000/api/v1';

async function citizenToken(request: APIRequestContext): Promise<string> {
  await request.post(`${API}/auth/otp/send`, { data: { phone: CITIZEN_PHONE } });
  const verified = await request.post(`${API}/auth/otp/verify`, { data: { phone: CITIZEN_PHONE, code: OTP } });
  expect(verified.status()).toBe(200);
  return (await verified.json()).data.accessToken as string;
}

test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, phone: string, expectedPath: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.locator('form button[type="submit"]').click();
  await page.getByLabel('6-digit code').fill(OTP);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(expectedPath, { timeout: 20_000 });
}

const resultsHeading = (page: Page) => page.getByRole('heading', { name: 'Search results' });
const panelSubtitle = (page: Page) => page.locator('section:has(h2) p.text-xs').first();

// One sign-in for the file: /auth/otp/verify is rate limited per IP, so a login per test
// makes the suite fail on its own volume rather than on anything it is testing.
test.describe('officer incident search', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ permissions: ['geolocation'], geolocation: DARBHANGA });
    page = await context.newPage();
    await signIn(page, OFFICIAL, /\/govt/);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test.afterEach(async () => {
    await page.getByRole('searchbox').fill('');
  });

  test('finds a report by the place named in it', async () => {
    await page.getByRole('searchbox').fill('Panchobh');

    await expect(resultsHeading(page)).toBeVisible();
    await expect(panelSubtitle(page)).toContainText('matched place and description');
    const rows = page.locator('ol[aria-label="Search results"] > li');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText('Panchobh');
  });

  test('finds every report from one caller by phone number', async () => {
    await page.getByRole('searchbox').fill('9000000001');

    await expect(panelSubtitle(page)).toContainText('matched the reporter’s phone');
    await expect(page.locator('ol[aria-label="Search results"] > li').first()).toBeVisible();
  });

  test('says so when a term matches nothing, instead of showing the queue', async () => {
    await page.getByRole('searchbox').fill('zzzznotathing');

    await expect(page.getByText(/Nothing matches/i)).toBeVisible();
    await expect(resultsHeading(page)).toBeVisible();
  });

  test('hides the queue-only filters while a search is running', async () => {
    await page.getByRole('searchbox').fill('Panchobh');
    await expect(resultsHeading(page)).toBeVisible();

    // Search spans every status, so a status control alongside it would promise filtering
    // that is not applied.
    await expect(page.getByRole('button', { name: /^Status:/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Sort:/ })).toHaveCount(0);
  });

  test('returns to the priority queue when the box is cleared', async () => {
    await page.getByRole('searchbox').fill('Panchobh');
    await expect(resultsHeading(page)).toBeVisible();

    await page.getByRole('searchbox').fill('');

    await expect(page.getByRole('heading', { name: 'Priority queue' })).toBeVisible();
    await expect(panelSubtitle(page)).toContainText('highest priority first');
  });

  // The citizen's own press-and-hold is covered by the demo walkthrough; here the SOS is
  // raised over the API so the assertions stay on the officer's side of the socket.
  test('puts a report that has just arrived within reach, by toast and by newest-first', async ({ request }) => {
    await page.getByRole('button', { name: /^Sort:/ }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Newest first' }).click();
    await page.keyboard.press('Escape');
    await expect(panelSubtitle(page)).toContainText('newest first');

    const token = await citizenToken(request);
    const response = await request.post(`${API}/incidents/sos`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        clientUuid: crypto.randomUUID(),
        type: 'FLOOD',
        lat: DARBHANGA.latitude,
        lon: DARBHANGA.longitude,
        locationSource: 'GPS',
        accuracyM: 12,
        reportedAt: new Date().toISOString(),
        peopleAffected: 3,
      },
    });
    expect(response.status()).toBe(201);

    // The toast is the live route to the report; the sorted queue is the one that outlives it.
    const openIt = page.getByRole('button', { name: 'Open this report' });
    await expect(openIt).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('ol > li').first()).toContainText('just now');

    await openIt.click();
    await expect(openIt).toHaveCount(0);
  });
});
