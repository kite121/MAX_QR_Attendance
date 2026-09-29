import { ApiError } from './ApiError';
import type {
  AttendanceSession,
  AuthResponse,
  CheckInContext,
  CheckInItem,
  CheckInResult,
  CheckInsResponse,
  EnrollStudentInput,
  Group,
  GroupsResponse,
  ManualCorrectionInput,
  QrTokenResponse,
  SessionsResponse,
  Student,
  StudentsResponse,
  User,
} from './types';

interface MockUser extends User {
  login: string;
  password: string;
  groupIds: string[];
}

interface MockToken {
  token: string;
  sessionId: string;
  expiresAt: string;
}

interface MockDatabase {
  sessions: AttendanceSession[];
  qrTokens: MockToken[];
  checkIns: Array<CheckInItem & { sessionId: string }>;
  customStudents: MockUser[];
  enrollments: Array<{ groupId: string; studentId: string }>;
}

const DATABASE_KEY = 'baam-max-mock-database-v1';
const MOCK_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 180;

const groups: Group[] = [
  { id: 'group-ivt-21', name: 'ИВТ-21', student_count: 2 },
  { id: 'group-pmi-22', name: 'ПМИ-22', student_count: 1 },
];

const users: MockUser[] = [
  {
    id: 'teacher-elena',
    max_user_id: '10001',
    display_name: 'Елена Соколова',
    role: 'teacher',
    login: 'teacher.demo',
    password: 'baam-demo',
    groupIds: ['group-ivt-21'],
  },
  {
    id: 'student-anna',
    max_user_id: '20001',
    display_name: 'Анна Смирнова',
    role: 'student',
    login: 'student.anna',
    password: 'baam-demo',
    groupIds: ['group-ivt-21'],
  },
  {
    id: 'student-kirill',
    max_user_id: '20002',
    display_name: 'Кирилл Волков',
    role: 'student',
    login: 'student.kirill',
    password: 'baam-demo',
    groupIds: ['group-ivt-21'],
  },
  {
    id: 'student-maria',
    max_user_id: '20003',
    display_name: 'Мария Орлова',
    role: 'student',
    login: 'student.outsider',
    password: 'baam-demo',
    groupIds: ['group-pmi-22'],
  },
];

function readDatabase(): MockDatabase {
  const emptyDatabase: MockDatabase = {
    sessions: [],
    qrTokens: [],
    checkIns: [],
    customStudents: [],
    enrollments: [],
  };
  try {
    const value = localStorage.getItem(DATABASE_KEY);
    if (!value) return emptyDatabase;
    const stored = JSON.parse(value) as Partial<MockDatabase>;
    return {
      ...emptyDatabase,
      ...stored,
      customStudents: stored.customStudents ?? [],
      enrollments: stored.enrollments ?? [],
    };
  } catch {
    return emptyDatabase;
  }
}

function writeDatabase(database: MockDatabase): void {
  localStorage.setItem(DATABASE_KEY, JSON.stringify(database));
}

function wait(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS));
}

function publicUser(user: MockUser): User {
  return {
    id: user.id,
    max_user_id: user.max_user_id,
    display_name: user.display_name,
    role: user.role,
  };
}

function getUser(accessToken: string): MockUser {
  const userId = accessToken.replace('mock-token:', '');
  const user = [...users, ...readDatabase().customStudents].find(
    (item) => item.id === userId,
  );
  if (!user) throw new ApiError('UNAUTHORIZED', 'Сессия входа недействительна', 401);
  return user;
}

function requireRole(accessToken: string, role: User['role']): MockUser {
  const user = getUser(accessToken);
  if (user.role !== role) throw new ApiError('FORBIDDEN', 'Недостаточно прав', 403);
  return user;
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function isEnrolled(student: MockUser, groupId: string, database: MockDatabase): boolean {
  return (
    student.groupIds.includes(groupId) ||
    database.enrollments.some(
      (item) => item.groupId === groupId && item.studentId === student.id,
    )
  );
}

function allStudents(database: MockDatabase): MockUser[] {
  return [...users, ...database.customStudents].filter((user) => user.role === 'student');
}

function publicStudent(student: MockUser): Student {
  return {
    id: student.id,
    max_user_id: student.max_user_id,
    display_name: student.display_name,
  };
}

function requireTeacherGroup(accessToken: string, groupId: string): MockUser {
  const teacher = requireRole(accessToken, 'teacher');
  if (!teacher.groupIds.includes(groupId)) {
    throw new ApiError('GROUP_NOT_FOUND', 'Группа не найдена', 404);
  }
  return teacher;
}

function requireTeacherSession(
  accessToken: string,
  sessionId: string,
  database: MockDatabase,
): AttendanceSession {
  const teacher = requireRole(accessToken, 'teacher');
  const session = database.sessions.find((item) => item.id === sessionId);
  if (!session || !teacher.groupIds.includes(session.group_id)) {
    throw new ApiError('SESSION_NOT_FOUND', 'Сессия не найдена', 404);
  }
  return session;
}

export const mockApi = {
  async authMock(login: string, password: string): Promise<AuthResponse> {
    await wait();
    const user = users.find((item) => item.login === login && item.password === password);
    if (!user) throw new ApiError('UNAUTHORIZED', 'Неверный логин или пароль', 401);
    return {
      access_token: `mock-token:${user.id}`,
      token_type: 'bearer',
      user: publicUser(user),
    };
  },

  async authMax(): Promise<AuthResponse> {
    await wait();
    throw new ApiError(
      'INVALID_INIT_DATA',
      'Mock API поддерживает вход только через тестовые аккаунты',
      400,
    );
  },

  async getGroups(accessToken: string): Promise<GroupsResponse> {
    await wait();
    const teacher = requireRole(accessToken, 'teacher');
    const database = readDatabase();
    return {
      items: groups
        .filter((group) => teacher.groupIds.includes(group.id))
        .map((group) => ({
          ...group,
          student_count: allStudents(database).filter((student) =>
            isEnrolled(student, group.id, database),
          ).length,
        })),
    };
  },

  async getGroupStudents(
    accessToken: string,
    groupId: string,
  ): Promise<StudentsResponse> {
    await wait();
    requireTeacherGroup(accessToken, groupId);
    const database = readDatabase();
    return {
      items: allStudents(database)
        .filter((student) => isEnrolled(student, groupId, database))
        .sort((first, second) =>
          first.display_name.localeCompare(second.display_name, 'ru'),
        )
        .map(publicStudent),
    };
  },

  async enrollStudent(
    accessToken: string,
    groupId: string,
    input: EnrollStudentInput,
  ): Promise<Student> {
    await wait();
    requireTeacherGroup(accessToken, groupId);
    const maxUserId = input.max_user_id.trim();
    const displayName = input.display_name.trim();
    if (!/^\d{1,20}$/.test(maxUserId) || !displayName) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Укажите числовой MAX ID и имя студента',
        422,
      );
    }

    const database = readDatabase();
    let student = allStudents(database).find((item) => item.max_user_id === maxUserId);
    if (!student) {
      student = {
        id: createId('student'),
        max_user_id: maxUserId,
        display_name: displayName,
        role: 'student',
        login: '',
        password: '',
        groupIds: [],
      };
      database.customStudents.push(student);
    }
    if (!isEnrolled(student, groupId, database)) {
      database.enrollments.push({ groupId, studentId: student.id });
    }
    writeDatabase(database);
    return publicStudent(student);
  },

  async createSession(
    accessToken: string,
    groupId: string,
    title: string,
  ): Promise<AttendanceSession> {
    await wait();
    const teacher = requireRole(accessToken, 'teacher');
    if (!teacher.groupIds.includes(groupId)) {
      throw new ApiError('GROUP_NOT_FOUND', 'Группа не найдена', 404);
    }

    const database = readDatabase();
    const activeSession = database.sessions.find(
      (session) => session.group_id === groupId && session.status === 'active',
    );
    if (activeSession) return activeSession;

    const session: AttendanceSession = {
      id: createId('session'),
      group_id: groupId,
      title,
      status: 'active',
      started_at: new Date().toISOString(),
    };
    database.sessions.push(session);
    writeDatabase(database);
    return session;
  },

  async getActiveSession(
    accessToken: string,
    groupId: string,
  ): Promise<AttendanceSession> {
    await wait();
    requireTeacherGroup(accessToken, groupId);
    const session = readDatabase().sessions.find(
      (item) => item.group_id === groupId && item.status === 'active',
    );
    if (!session) {
      throw new ApiError('SESSION_NOT_FOUND', 'Активная сессия не найдена', 404);
    }
    return session;
  },

  async getSession(accessToken: string, sessionId: string): Promise<AttendanceSession> {
    await wait();
    const database = readDatabase();
    return requireTeacherSession(accessToken, sessionId, database);
  },

  async getSessions(accessToken: string, groupId: string): Promise<SessionsResponse> {
    await wait();
    requireTeacherGroup(accessToken, groupId);
    return {
      items: readDatabase()
        .sessions.filter((session) => session.group_id === groupId)
        .sort(
          (first, second) =>
            new Date(second.started_at).getTime() - new Date(first.started_at).getTime(),
        ),
    };
  },

  async getQrToken(accessToken: string, sessionId: string): Promise<QrTokenResponse> {
    await wait();
    const database = readDatabase();
    const session = requireTeacherSession(accessToken, sessionId, database);
    if (session.status === 'closed') {
      throw new ApiError('SESSION_CLOSED', 'Сессия уже завершена', 409);
    }

    const token = createId('qr');
    const expiresAt = new Date(Date.now() + 10_000).toISOString();
    database.qrTokens.push({ token, sessionId, expiresAt });
    database.qrTokens = database.qrTokens.filter(
      (item) => new Date(item.expiresAt).getTime() > Date.now() - 60_000,
    );
    writeDatabase(database);
    return {
      token,
      deep_link: `${window.location.origin}/student/check-in?startapp=${encodeURIComponent(token)}`,
      expires_at: expiresAt,
    };
  },

  async getCheckInContext(accessToken: string, token: string): Promise<CheckInContext> {
    await wait();
    const student = requireRole(accessToken, 'student');
    const database = readDatabase();
    const qrToken = database.qrTokens.find((item) => item.token === token);
    if (!qrToken) throw new ApiError('QR_TOKEN_INVALID', 'QR-код недействителен', 400);
    const session = database.sessions.find((item) => item.id === qrToken.sessionId);
    if (!session) throw new ApiError('SESSION_NOT_FOUND', 'Сессия не найдена', 404);
    const group = groups.find((item) => item.id === session.group_id)!;
    const teacher = users.find(
      (item) => item.role === 'teacher' && item.groupIds.includes(session.group_id),
    )!;

    let status: CheckInContext['status'] = 'available';
    if (new Date(qrToken.expiresAt).getTime() <= Date.now()) status = 'expired';
    else if (session.status === 'closed') status = 'session_closed';
    else if (!isEnrolled(student, session.group_id, database)) status = 'not_enrolled';
    else if (
      database.checkIns.some(
        (item) => item.sessionId === session.id && item.student_id === student.id,
      )
    )
      status = 'already_checked_in';

    return {
      session_id: session.id,
      lesson_title: session.title,
      group_name: group.name,
      teacher_name: teacher.display_name,
      status,
      expires_at: qrToken.expiresAt,
    };
  },

  async checkIn(accessToken: string, token: string): Promise<CheckInResult> {
    const context = await this.getCheckInContext(accessToken, token);
    const statusErrors: Partial<Record<CheckInContext['status'], ApiError>> = {
      expired: new ApiError('QR_TOKEN_EXPIRED', 'Срок действия QR-кода истёк', 400),
      session_closed: new ApiError('SESSION_CLOSED', 'Сессия уже завершена', 409),
      not_enrolled: new ApiError(
        'STUDENT_NOT_ENROLLED',
        'Вы не состоите в этой группе',
        403,
      ),
      already_checked_in: new ApiError('ALREADY_CHECKED_IN', 'Вы уже отметились', 409),
    };
    const statusError = statusErrors[context.status];
    if (statusError) throw statusError;

    const student = requireRole(accessToken, 'student');
    const checkedInAt = new Date().toISOString();
    const database = readDatabase();
    database.checkIns.push({
      sessionId: context.session_id,
      student_id: student.id,
      display_name: student.display_name,
      checked_in_at: checkedInAt,
      attendance_status: 'present',
      source: 'qr',
    });
    writeDatabase(database);
    return {
      status: 'checked_in',
      checked_in_at: checkedInAt,
      session_id: context.session_id,
    };
  },

  async getCheckIns(accessToken: string, sessionId: string): Promise<CheckInsResponse> {
    await wait();
    const database = readDatabase();
    const session = requireTeacherSession(accessToken, sessionId, database);
    const items = database.checkIns
      .filter((item) => item.sessionId === sessionId)
      .sort(
        (first, second) =>
          new Date(second.checked_in_at).getTime() -
          new Date(first.checked_in_at).getTime(),
      )
      .map((item) => ({
        student_id: item.student_id,
        display_name: item.display_name,
        checked_in_at: item.checked_in_at,
        attendance_status: item.attendance_status,
        source: item.source,
      }));
    return {
      session_id: sessionId,
      status: session.status,
      present_count: items.length,
      student_count: allStudents(database).filter((student) =>
        isEnrolled(student, session.group_id, database),
      ).length,
      items,
    };
  },

  async correctCheckIn(
    accessToken: string,
    sessionId: string,
    input: ManualCorrectionInput,
  ): Promise<CheckInsResponse> {
    await wait();
    const database = readDatabase();
    const session = requireTeacherSession(accessToken, sessionId, database);
    const student = allStudents(database).find((item) => item.id === input.student_id);
    if (!student || !isEnrolled(student, session.group_id, database)) {
      throw new ApiError('STUDENT_NOT_ENROLLED', 'Студент не найден в группе', 404);
    }
    if (input.reason.trim().length < 5) {
      throw new ApiError('VALIDATION_ERROR', 'Укажите причину изменения', 422);
    }

    const existingIndex = database.checkIns.findIndex(
      (item) => item.sessionId === sessionId && item.student_id === student.id,
    );
    if (input.action === 'add') {
      if (existingIndex >= 0) {
        throw new ApiError('ALREADY_CHECKED_IN', 'Студент уже отмечен', 409);
      }
      database.checkIns.push({
        sessionId,
        student_id: student.id,
        display_name: student.display_name,
        checked_in_at: new Date().toISOString(),
        attendance_status: input.attendance_status ?? 'present',
        source: 'manual',
      });
    } else if (input.action === 'remove') {
      if (existingIndex < 0) {
        throw new ApiError('VALIDATION_ERROR', 'Отметка не найдена', 409);
      }
      database.checkIns.splice(existingIndex, 1);
    } else {
      if (existingIndex < 0) {
        throw new ApiError('VALIDATION_ERROR', 'Отметка не найдена', 409);
      }
      if (!input.attendance_status) {
        throw new ApiError('VALIDATION_ERROR', 'Выберите статус', 422);
      }
      database.checkIns[existingIndex].attendance_status = input.attendance_status;
      database.checkIns[existingIndex].source = 'manual';
    }
    writeDatabase(database);
    return this.getCheckIns(accessToken, sessionId);
  },

  async exportSessionCsv(accessToken: string, sessionId: string): Promise<Blob> {
    await wait();
    const database = readDatabase();
    const session = requireTeacherSession(accessToken, sessionId, database);
    const checkIns = new Map(
      database.checkIns
        .filter((item) => item.sessionId === sessionId)
        .map((item) => [item.student_id, item]),
    );
    const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = allStudents(database)
      .filter((student) => isEnrolled(student, session.group_id, database))
      .sort((first, second) =>
        first.display_name.localeCompare(second.display_name, 'ru'),
      )
      .map((student) => {
        const checkIn = checkIns.get(student.id);
        return [
          student.id,
          student.max_user_id ?? '',
          student.display_name,
          checkIn?.attendance_status ?? 'absent',
          checkIn?.checked_in_at ?? '',
          checkIn?.source ?? '',
        ]
          .map(escapeCsv)
          .join(',');
      });
    return new Blob(
      [
        '\ufeffstudent_id,max_user_id,display_name,status,checked_in_at,source\r\n',
        rows.join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8' },
    );
  },

  async closeSession(accessToken: string, sessionId: string): Promise<AttendanceSession> {
    await wait();
    const database = readDatabase();
    const session = requireTeacherSession(accessToken, sessionId, database);
    session.status = 'closed';
    session.closed_at = new Date().toISOString();
    session.present_count = database.checkIns.filter(
      (item) => item.sessionId === sessionId,
    ).length;
    writeDatabase(database);
    return session;
  },
};
