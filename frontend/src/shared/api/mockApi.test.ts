import { beforeEach, describe, expect, it } from 'vitest';

import { mockApi } from './mockApi';

describe('mock API attendance contract', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('completes the teacher to student P0 scenario', async () => {
    const teacher = await mockApi.authMock('teacher.demo', 'baam-demo');
    const groups = await mockApi.getGroups(teacher.access_token);
    const session = await mockApi.createSession(
      teacher.access_token,
      groups.items[0].id,
      'Математика',
    );
    const qr = await mockApi.getQrToken(teacher.access_token, session.id);

    const student = await mockApi.authMock('student.anna', 'baam-demo');
    const context = await mockApi.getCheckInContext(student.access_token, qr.token);
    expect(context).toMatchObject({
      lesson_title: 'Математика',
      group_name: 'ИВТ-21',
      status: 'available',
    });

    const result = await mockApi.checkIn(student.access_token, qr.token);
    expect(result.status).toBe('checked_in');

    const checkIns = await mockApi.getCheckIns(teacher.access_token, session.id);
    expect(checkIns).toMatchObject({ present_count: 1, student_count: 2 });
    expect(checkIns.items[0].display_name).toBe('Анна Смирнова');

    await expect(mockApi.checkIn(student.access_token, qr.token)).rejects.toMatchObject({
      code: 'ALREADY_CHECKED_IN',
      status: 409,
    });

    await mockApi.closeSession(teacher.access_token, session.id);
    await expect(
      mockApi.getCheckIns(teacher.access_token, session.id),
    ).resolves.toMatchObject({
      status: 'closed',
      present_count: 1,
    });
    await expect(
      mockApi.getCheckInContext(student.access_token, qr.token),
    ).resolves.toMatchObject({ status: 'session_closed' });
  });

  it('rejects a student from another group', async () => {
    const teacher = await mockApi.authMock('teacher.demo', 'baam-demo');
    const session = await mockApi.createSession(
      teacher.access_token,
      'group-ivt-21',
      'Физика',
    );
    const qr = await mockApi.getQrToken(teacher.access_token, session.id);
    const outsider = await mockApi.authMock('student.outsider', 'baam-demo');

    await expect(
      mockApi.getCheckInContext(outsider.access_token, qr.token),
    ).resolves.toMatchObject({ status: 'not_enrolled' });
    await expect(mockApi.checkIn(outsider.access_token, qr.token)).rejects.toMatchObject({
      code: 'STUDENT_NOT_ENROLLED',
      status: 403,
    });
  });

  it('never persists access tokens in local storage', async () => {
    const response = await mockApi.authMock('teacher.demo', 'baam-demo');
    expect(response.access_token).toContain('mock-token:');
    expect(JSON.stringify(localStorage)).not.toContain(response.access_token);
  });
});
