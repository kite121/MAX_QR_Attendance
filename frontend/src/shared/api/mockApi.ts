import { ApiError } from './ApiError';
import type {
  AttendanceSession,
  AuthResponse,
  CheckInContext,
  CheckInItem,
  CheckInResult,
  CheckInsResponse,
  Group,
  GroupsResponse,
  QrTokenResponse,
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
  const emptyDatabase: MockDatabase = { sessions: [], qrTokens: [], checkIns: [] };
  try {
    const value = localStorage.getItem(DATABASE_KEY);
    return value ? (JSON.parse(value) as MockDatabase) : emptyDatabase;
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
  const user = users.find((item) => item.id === userId);
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
    return { items: groups.filter((group) => teacher.groupIds.includes(group.id)) };
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

  async getQrToken(accessToken: string, sessionId: string): Promise<QrTokenResponse> {
    await wait();
    requireRole(accessToken, 'teacher');
    const database = readDatabase();
    const session = database.sessions.find((item) => item.id === sessionId);
    if (!session) throw new ApiError('SESSION_NOT_FOUND', 'Сессия не найдена', 404);
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
    else if (!student.groupIds.includes(session.group_id)) status = 'not_enrolled';
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
    requireRole(accessToken, 'teacher');
    const database = readDatabase();
    const session = database.sessions.find((item) => item.id === sessionId);
    if (!session) throw new ApiError('SESSION_NOT_FOUND', 'Сессия не найдена', 404);
    const group = groups.find((item) => item.id === session.group_id)!;
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
      }));
    return {
      session_id: sessionId,
      status: session.status,
      present_count: items.length,
      student_count: group.student_count,
      items,
    };
  },

  async closeSession(accessToken: string, sessionId: string): Promise<AttendanceSession> {
    await wait();
    requireRole(accessToken, 'teacher');
    const database = readDatabase();
    const session = database.sessions.find((item) => item.id === sessionId);
    if (!session) throw new ApiError('SESSION_NOT_FOUND', 'Сессия не найдена', 404);
    session.status = 'closed';
    session.closed_at = new Date().toISOString();
    session.present_count = database.checkIns.filter(
      (item) => item.sessionId === sessionId,
    ).length;
    writeDatabase(database);
    return session;
  },
};
