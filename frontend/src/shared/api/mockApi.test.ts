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
    expect(checkIns.items[0]).toMatchObject({
      display_name: 'Анна Смирнова',
      attendance_status: 'present',
      source: 'qr',
    });

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

  it('manages the roster through the proposed MAX ID enrollment contract', async () => {
    const teacher = await mockApi.authMock('teacher.demo', 'baam-demo');
    const result = await mockApi.enrollStudent(teacher.access_token, 'group-ivt-21', {
      max_user_id: '20004',
      display_name: 'Илья Петров',
    });

    expect(result).toEqual({ imported: 1, already_enrolled: 0 });
    await expect(
      mockApi.getGroupStudents(teacher.access_token, 'group-ivt-21'),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ max_user_id: '20004', display_name: 'Илья Петров' }),
      ]),
    });
    await expect(mockApi.getGroups(teacher.access_token)).resolves.toMatchObject({
      items: [expect.objectContaining({ student_count: 3 })],
    });
  });

  it('imports CSV idempotently and exposes group stats and audit', async () => {
    const teacher = await mockApi.authMock('teacher.demo', 'baam-demo');
    const csv = new File(
      ['max_user_id;display_name\r\n20004;"Илья Петров"\r\n20005;"Анна, Петрова"'],
      'roster.csv',
      { type: 'text/csv' },
    );
    await expect(
      mockApi.importStudentsCsv(teacher.access_token, 'group-ivt-21', csv),
    ).resolves.toEqual({ imported: 2, already_enrolled: 0 });
    await expect(
      mockApi.importStudentsCsv(teacher.access_token, 'group-ivt-21', csv),
    ).resolves.toEqual({ imported: 0, already_enrolled: 2 });
    await expect(
      mockApi.getGroupStats(teacher.access_token, 'group-ivt-21'),
    ).resolves.toMatchObject({ group_id: 'group-ivt-21', sessions_count: 0 });
    await expect(
      mockApi.getGroupAudit(teacher.access_token, 'group-ivt-21'),
    ).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          action: 'roster_import',
          reason: 'imported=0; already_enrolled=2',
        }),
      ]),
    });
  });

  it('rejects malformed roster imports atomically', async () => {
    const teacher = await mockApi.authMock('teacher.demo', 'baam-demo');
    const csv = new File(
      ['max_user_id,display_name\n20004,Valid Student\nnot-a-number,Invalid Student'],
      'invalid.csv',
      { type: 'text/csv' },
    );
    await expect(
      mockApi.importStudentsCsv(teacher.access_token, 'group-ivt-21', csv),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
    await expect(
      mockApi.getGroupStudents(teacher.access_token, 'group-ivt-21'),
    ).resolves.toMatchObject({
      items: expect.not.arrayContaining([
        expect.objectContaining({ max_user_id: '20004' }),
      ]),
    });
  });

  it('restores sessions, edits attendance and exports the selected session', async () => {
    const teacher = await mockApi.authMock('teacher.demo', 'baam-demo');
    const session = await mockApi.createSession(
      teacher.access_token,
      'group-ivt-21',
      'Алгоритмы',
    );

    await expect(
      mockApi.getActiveSession(teacher.access_token, 'group-ivt-21'),
    ).resolves.toMatchObject({ id: session.id });

    const corrected = await mockApi.correctCheckIn(teacher.access_token, session.id, {
      student_id: 'student-kirill',
      action: 'add',
      attendance_status: 'late',
      reason: 'Опоздал из-за транспорта',
    });
    expect(corrected.items[0]).toMatchObject({
      attendance_status: 'late',
      source: 'manual',
    });

    const csv = await mockApi.exportSessionCsv(teacher.access_token, session.id);
    expect(csv.type).toContain('text/csv');
    expect(csv.size).toBeGreaterThan(0);

    await mockApi.closeSession(teacher.access_token, session.id);
    await expect(
      mockApi.getSessions(teacher.access_token, 'group-ivt-21'),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: session.id })] });
  });
});
