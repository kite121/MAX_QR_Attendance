import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // These tests supply a synthetic Bridge; actual MAX clients are a separate acceptance check.
  await page.route('https://st.max.ru/js/max-web-app.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
});

test('public build asks for MAX without exposing demo login', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Откройте приложение в MAX' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toHaveCount(0);
  await expect(page.getByText('teacher.demo')).toHaveCount(0);
});

test('MAX login can be retried with fresh launch data after a connection failure', async ({
  page,
}) => {
  const firstInitData = 'auth_date=123&hash=synthetic%2Ffirst&user=%7B%7D';
  const freshInitData = 'auth_date=456&hash=synthetic%2Ffresh&user=%7B%7D';
  const token = 'synthetic-production-qr';
  const submittedInitData: string[] = [];
  await page.addInitScript(
    ({ initData, startParam }) => {
      window.WebApp = { initData, initDataUnsafe: { start_param: startParam } };
    },
    { initData: firstInitData, startParam: token },
  );

  await page.route('**/auth/max', async (route) => {
    submittedInitData.push(route.request().postDataJSON().init_data as string);
    if (submittedInitData.length === 1) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      json: {
        access_token: 'synthetic-production-access-token',
        token_type: 'bearer',
        user: {
          id: 'synthetic-student',
          max_user_id: '99999',
          display_name: 'Тестовый студент',
          role: 'student',
        },
      },
    });
  });
  await page.route('**/check-in/context?token=*', (route) =>
    route.fulfill({
      json: {
        session_id: 'synthetic-session',
        lesson_title: 'Проверка входа',
        group_name: 'Тестовая группа',
        teacher_name: 'Тестовый преподаватель',
        status: 'available',
        expires_at: new Date(Date.now() + 10_000).toISOString(),
      },
    }),
  );
  await page.route('**/check-ins', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ qr_token: token });
    await route.fulfill({
      json: {
        status: 'checked_in',
        checked_in_at: new Date().toISOString(),
        session_id: 'synthetic-session',
      },
    });
  });

  await page.goto(`/?startapp=${token}`);
  await expect(page.getByRole('heading', { name: 'Не удалось войти' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.evaluate((initData) => {
    window.WebApp!.initData = initData;
  }, freshInitData);
  await page.getByRole('button', { name: 'Повторить вход' }).click();
  await expect(page.getByRole('heading', { name: 'Вы отметились' })).toBeVisible();
  expect(submittedInitData).toEqual([firstInitData, freshInitData]);
});
