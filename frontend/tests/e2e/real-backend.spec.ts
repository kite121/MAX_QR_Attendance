import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000/api/v1';
const frontendUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080';

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
  const deepLink = new URL(qr.deep_link);
  await studentPage.goto(`${frontendUrl}${deepLink.pathname}${deepLink.search}`);
  await loginInBrowser(studentPage, /Анна · ИВТ-21/i);
  await expect(studentPage.getByRole('heading', { name: 'Вы отметились' })).toBeVisible();
  await expect(
    studentPage.getByRole('button', { name: /подтвердить присутствие/i }),
  ).toHaveCount(0);

  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
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
});
