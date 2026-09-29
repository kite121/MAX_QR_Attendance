import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000/api/v1';
const frontendUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080';

async function disableExternalBridge(page: Page) {
  await page.route('https://st.max.ru/js/max-web-app.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
}

test.beforeEach(async ({ page }) => {
  await disableExternalBridge(page);
});

async function authenticateApi(
  request: APIRequestContext,
  login: string,
): Promise<string> {
  const response = await request.post(`${apiUrl}/auth/mock`, {
    data: { login, password: 'baam-demo' },
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

async function loginInBrowser(page: Page, accountName: RegExp) {
  await page.getByRole('button', { name: accountName }).click();
  await page.getByRole('button', { name: 'Войти' }).click();
}

async function createTestSession(request: APIRequestContext, title: string) {
  const accessToken = await authenticateApi(request, 'teacher.demo');
  const headers = { Authorization: `Bearer ${accessToken}` };
  const groupsResponse = await request.get(`${apiUrl}/groups`, { headers });
  expect(groupsResponse.ok()).toBeTruthy();
  const [group] = (await groupsResponse.json()).items as Array<{ id: string }>;
  const activeResponse = await request.get(
    `${apiUrl}/groups/${group.id}/sessions/active`,
    { headers },
  );
  if (activeResponse.ok()) {
    const active = (await activeResponse.json()) as { id: string };
    const closed = await request.post(`${apiUrl}/sessions/${active.id}/close`, {
      headers,
    });
    expect(closed.ok()).toBeTruthy();
  }
  const response = await request.post(`${apiUrl}/groups/${group.id}/sessions`, {
    headers,
    data: { title },
  });
  expect(response.ok()).toBeTruthy();
  return { session: (await response.json()) as { id: string }, headers };
}

async function downloadCsv(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV', exact: true }).click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).toBeTruthy();
  return readFile(path!, 'utf8');
}

test('student checks in automatically and teacher sees the real backend result', async ({
  browser,
  request,
}) => {
  const teacherToken = await authenticateApi(request, 'teacher.demo');
  const groupsResponse = await request.get(`${apiUrl}/groups`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(groupsResponse.ok()).toBeTruthy();
  const [group] = ((await groupsResponse.json()) as { items: Array<{ id: string }> })
    .items;
  expect(group).toBeTruthy();

  const activeResponse = await request.get(
    `${apiUrl}/groups/${group.id}/sessions/active`,
    { headers: { Authorization: `Bearer ${teacherToken}` } },
  );
  if (activeResponse.ok()) {
    const active = (await activeResponse.json()) as { id: string };
    await request.post(`${apiUrl}/sessions/${active.id}/close`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
  }

  const lessonTitle = `E2E ${Date.now()}`;
  const sessionResponse = await request.post(`${apiUrl}/groups/${group.id}/sessions`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
    data: { title: lessonTitle },
  });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = (await sessionResponse.json()) as { id: string };

  const qrResponse = await request.post(`${apiUrl}/sessions/${session.id}/qr-token`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  expect(qrResponse.ok()).toBeTruthy();
  const qr = (await qrResponse.json()) as { deep_link: string };

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await disableExternalBridge(studentPage);
  const deepLink = new URL(qr.deep_link);
  await studentPage.goto(`${frontendUrl}${deepLink.pathname}${deepLink.search}`);
  await loginInBrowser(studentPage, /Анна · ИВТ-21/i);
  await expect(studentPage.getByRole('heading', { name: 'Вы отметились' })).toBeVisible();
  await expect(
    studentPage.getByRole('button', { name: /подтвердить присутствие/i }),
  ).toHaveCount(0);

  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  await disableExternalBridge(teacherPage);
  await teacherPage.goto('/');
  await loginInBrowser(teacherPage, /Елена · преподаватель/i);
  await teacherPage.getByRole('button', { name: 'Продолжить' }).click();
  await expect(teacherPage.getByRole('heading', { name: lessonTitle })).toBeVisible();
  const attendanceItem = teacherPage
    .locator('.attendance-list > li')
    .filter({ hasText: 'Анна Смирнова' });
  await expect(attendanceItem).toContainText('Вовремя');
  await teacherPage.getByRole('button', { name: 'Завершить' }).click();
  const closeDialog = teacherPage.getByRole('dialog', {
    name: 'Завершить занятие?',
  });
  await closeDialog.getByRole('button', { name: 'Завершить' }).click();
  await expect(teacherPage.getByText('Сессия завершена', { exact: true })).toBeVisible();

  await studentContext.close();
  await teacherContext.close();
});

test('teacher imports a roster through the real backend and sees stats and audit', async ({
  page,
}) => {
  const maxUserId = String(Date.now());
  const displayName = `E2E Student ${maxUserId}`;
  await page.goto('/');
  await loginInBrowser(page, /Елена · преподаватель/i);
  await expect(page.getByRole('heading', { name: 'Студенты' })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'e2e-roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`max_user_id,display_name\n${maxUserId},"${displayName}"`),
  });

  await expect(page.getByText(/Импорт завершён: добавлено 1/)).toBeVisible();
  await expect(page.getByText(displayName)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Аудит группы' })).toBeVisible();
  await expect(page.getByText('Импортирован состав группы').first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Посещаемость', exact: true }),
  ).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'e2e-roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`max_user_id,display_name\n${maxUserId},"${displayName}"`),
  });
  await expect(
    page.getByText('Импорт завершён: добавлено 0, уже в группе 1'),
  ).toBeVisible();
  await expect(
    page.locator('.roster-list > li').filter({ hasText: displayName }),
  ).toHaveCount(1);

  const invalidName = `Atomic Import ${maxUserId}`;
  await page.locator('input[type="file"]').setInputFiles({
    name: 'invalid-roster.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `max_user_id,display_name\n${maxUserId}1,${invalidName}\ninvalid,Invalid Student`,
    ),
  });
  await expect(
    page.getByText('Некорректная или повторная запись в строке 3'),
  ).toBeVisible();
  await page.reload();
  await loginInBrowser(page, /Елена · преподаватель/i);
  await expect(page.getByRole('heading', { name: 'Студенты' })).toBeVisible();
  await expect(
    page.locator('.roster-list > li').filter({ hasText: invalidName }),
  ).toHaveCount(0);
});

test('teacher corrects a closed session, downloads updated CSV and restores it from history', async ({
  page,
  request,
}) => {
  const title = `E2E corrections ${Date.now()}`;
  const { session, headers } = await createTestSession(request, title);
  const closed = await request.post(`${apiUrl}/sessions/${session.id}/close`, {
    headers,
  });
  expect(closed.ok()).toBeTruthy();

  await page.goto('/');
  await loginInBrowser(page, /Елена · преподаватель/i);
  await page.locator('.history-list button').filter({ hasText: title }).click();
  await expect(page.getByText('Сессия завершена', { exact: true })).toBeVisible();
  const emptyCsv = await downloadCsv(page);
  expect(emptyCsv).toContain('Кирилл Волков');
  expect(emptyCsv).toContain(',absent,');

  await page
    .getByRole('combobox', { name: 'Студент', exact: true })
    .selectOption({ label: 'Кирилл Волков' });
  await expect(page.getByRole('button', { name: 'Сохранить изменение' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Статус', exact: true }).selectOption('late');
  await page.getByLabel('Причина изменения').fill('Пришёл после начала занятия');
  await page.getByRole('button', { name: 'Сохранить изменение' }).click();
  const attendance = page
    .locator('.attendance-list > li')
    .filter({ hasText: 'Кирилл Волков' });
  await expect(attendance).toContainText('Опоздал');
  await expect(
    page.locator('.audit-list').getByText(/Отсутствует → Опоздал/),
  ).toBeVisible();
  expect(await downloadCsv(page)).toMatch(/Кирилл Волков,late,[^\r\n]*,manual/);

  await page
    .getByRole('combobox', { name: 'Действие', exact: true })
    .selectOption('set_status');
  await page.getByLabel('Причина изменения').fill('Уточнили фактическое время прихода');
  await page.getByRole('button', { name: 'Сохранить изменение' }).click();
  await expect(attendance).toContainText('Вовремя');
  await expect(page.locator('.audit-list').getByText(/Опоздал → Вовремя/)).toBeVisible();
  expect(await downloadCsv(page)).toMatch(/Кирилл Волков,present,[^\r\n]*,manual/);

  await page.reload();
  await loginInBrowser(page, /Елена · преподаватель/i);
  await page.locator('.history-list button').filter({ hasText: title }).click();
  await expect(attendance).toContainText('Вовремя');
  await page
    .getByRole('combobox', { name: 'Студент', exact: true })
    .selectOption({ label: 'Кирилл Волков' });
  await page
    .getByRole('combobox', { name: 'Действие', exact: true })
    .selectOption('remove');
  await page.getByLabel('Причина изменения').fill('Ошибочная ручная отметка');
  await page.getByRole('button', { name: 'Сохранить изменение' }).click();
  await expect(attendance).toHaveCount(0);
  await expect(
    page.locator('.audit-list').getByText(/Вовремя → Отсутствует/),
  ).toBeVisible();
  expect(await downloadCsv(page)).toMatch(/Кирилл Волков,absent,/);
});

test('student retries a failed request without duplicate marks and sees a closed session', async ({
  page,
  request,
}) => {
  const { session, headers } = await createTestSession(
    request,
    `E2E retry ${Date.now()}`,
  );
  const response = await request.post(`${apiUrl}/sessions/${session.id}/qr-token`, {
    headers,
  });
  expect(response.ok()).toBeTruthy();
  const qr = (await response.json()) as { token: string };
  let failedOnce = false;
  await page.route('**/api/v1/check-ins', async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto(`/student/check-in?startapp=${encodeURIComponent(qr.token)}`);
  await loginInBrowser(page, /Кирилл · ИВТ-21/i);
  await expect(
    page.getByRole('heading', { name: 'Не удалось отметиться' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вы отметились' })).toBeVisible();

  // Use a fresh token: duplicate handling must not depend on the old token's expiry.
  const freshResponse = await request.post(`${apiUrl}/sessions/${session.id}/qr-token`, {
    headers,
  });
  const freshQr = (await freshResponse.json()) as { token: string };
  await page.goto(`/student/check-in?startapp=${encodeURIComponent(freshQr.token)}`);
  await loginInBrowser(page, /Кирилл · ИВТ-21/i);
  await expect(page.getByRole('heading', { name: 'Вы уже отметились' })).toBeVisible();
  const checkIns = await request.get(`${apiUrl}/sessions/${session.id}/check-ins`, {
    headers,
  });
  expect((await checkIns.json()).present_count).toBe(1);

  const closed = await request.post(`${apiUrl}/sessions/${session.id}/close`, {
    headers,
  });
  expect(closed.ok()).toBeTruthy();
  await page.goto(`/student/check-in?startapp=${encodeURIComponent(freshQr.token)}`);
  await loginInBrowser(page, /Кирилл · ИВТ-21/i);
  await expect(
    page.getByRole('heading', { name: 'Занятие завершено', exact: true }),
  ).toBeVisible();
});

test('students see clear rejection for another group and a genuinely expired QR', async ({
  page,
  request,
}) => {
  test.setTimeout(45_000);
  const { session, headers } = await createTestSession(
    request,
    `E2E expiry ${Date.now()}`,
  );
  const response = await request.post(`${apiUrl}/sessions/${session.id}/qr-token`, {
    headers,
  });
  expect(response.ok()).toBeTruthy();
  const qr = (await response.json()) as { token: string; expires_at: string };
  const link = `/student/check-in?startapp=${encodeURIComponent(qr.token)}`;
  await page.goto(link);
  await loginInBrowser(page, /Мария · другая группа/i);
  await expect(
    page.getByRole('heading', { name: 'Вы не состоите в группе' }),
  ).toBeVisible();

  // This delay follows the backend's returned deadline, rather than changing either TTL.
  await page.waitForTimeout(
    Math.max(0, new Date(qr.expires_at).getTime() - Date.now()) + 200,
  );
  await page.goto(link);
  await loginInBrowser(page, /Анна · ИВТ-21/i);
  await expect(page.getByRole('heading', { name: 'QR-код уже обновился' })).toBeVisible();
  const checkIns = await request.get(`${apiUrl}/sessions/${session.id}/check-ins`, {
    headers,
  });
  expect((await checkIns.json()).present_count).toBe(0);
  const closed = await request.post(`${apiUrl}/sessions/${session.id}/close`, {
    headers,
  });
  expect(closed.ok()).toBeTruthy();
});
