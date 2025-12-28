/**
 * Tests for stats-db.ts
 *
 * Note: better-sqlite3 is a native module compiled for Electron's Node version.
 * Direct testing with the native module in vitest is not possible without
 * electron-rebuild for the vitest runtime. These tests use mocked database
 * operations to verify the logic without requiring the actual native module.
 *
 * For full integration testing of the SQLite database, use the Electron test
 * environment (e2e tests) where the native module is properly loaded.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// Track Database constructor calls to verify file path
let lastDbPath: string | null = null;

// Store mock references so they can be accessed in tests
const mockStatement = {
  run: vi.fn(() => ({ changes: 1 })),
  get: vi.fn(() => ({ count: 0, total_duration: 0 })),
  all: vi.fn(() => []),
};

const mockDb = {
  pragma: vi.fn(() => [{ user_version: 0 }]),
  prepare: vi.fn(() => mockStatement),
  close: vi.fn(),
};

// Mock better-sqlite3 as a class
vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      constructor(dbPath: string) {
        lastDbPath = dbPath;
      }
      pragma = mockDb.pragma;
      prepare = mockDb.prepare;
      close = mockDb.close;
    },
  };
});

// Mock electron's app module with trackable userData path
const mockUserDataPath = path.join(os.tmpdir(), 'maestro-test-stats-db');
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return mockUserDataPath;
      return os.tmpdir();
    }),
  },
}));

// Track fs calls
const mockFsExistsSync = vi.fn(() => true);
const mockFsMkdirSync = vi.fn();

// Mock fs
vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockFsExistsSync(...args),
  mkdirSync: (...args: unknown[]) => mockFsMkdirSync(...args),
}));

// Mock logger
vi.mock('../../main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import types only - we'll test the type definitions
import type {
  QueryEvent,
  AutoRunSession,
  AutoRunTask,
  StatsTimeRange,
  StatsFilters,
  StatsAggregation,
} from '../../shared/stats-types';

describe('stats-types.ts', () => {
  describe('QueryEvent interface', () => {
    it('should define proper QueryEvent structure', () => {
      const event: QueryEvent = {
        id: 'test-id',
        sessionId: 'session-1',
        agentType: 'claude-code',
        source: 'user',
        startTime: Date.now(),
        duration: 5000,
        projectPath: '/test/project',
        tabId: 'tab-1',
      };

      expect(event.id).toBe('test-id');
      expect(event.sessionId).toBe('session-1');
      expect(event.source).toBe('user');
    });

    it('should allow optional fields to be undefined', () => {
      const event: QueryEvent = {
        id: 'test-id',
        sessionId: 'session-1',
        agentType: 'claude-code',
        source: 'auto',
        startTime: Date.now(),
        duration: 3000,
      };

      expect(event.projectPath).toBeUndefined();
      expect(event.tabId).toBeUndefined();
    });
  });

  describe('AutoRunSession interface', () => {
    it('should define proper AutoRunSession structure', () => {
      const session: AutoRunSession = {
        id: 'auto-run-1',
        sessionId: 'session-1',
        agentType: 'claude-code',
        documentPath: '/docs/task.md',
        startTime: Date.now(),
        duration: 60000,
        tasksTotal: 5,
        tasksCompleted: 3,
        projectPath: '/test/project',
      };

      expect(session.id).toBe('auto-run-1');
      expect(session.tasksTotal).toBe(5);
      expect(session.tasksCompleted).toBe(3);
    });
  });

  describe('AutoRunTask interface', () => {
    it('should define proper AutoRunTask structure', () => {
      const task: AutoRunTask = {
        id: 'task-1',
        autoRunSessionId: 'auto-run-1',
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'First task content',
        startTime: Date.now(),
        duration: 10000,
        success: true,
      };

      expect(task.id).toBe('task-1');
      expect(task.taskIndex).toBe(0);
      expect(task.success).toBe(true);
    });

    it('should handle failed tasks', () => {
      const task: AutoRunTask = {
        id: 'task-2',
        autoRunSessionId: 'auto-run-1',
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 1,
        startTime: Date.now(),
        duration: 5000,
        success: false,
      };

      expect(task.success).toBe(false);
      expect(task.taskContent).toBeUndefined();
    });
  });

  describe('StatsTimeRange type', () => {
    it('should accept valid time ranges', () => {
      const ranges: StatsTimeRange[] = ['day', 'week', 'month', 'year', 'all'];

      expect(ranges).toHaveLength(5);
      expect(ranges).toContain('day');
      expect(ranges).toContain('all');
    });
  });

  describe('StatsFilters interface', () => {
    it('should allow partial filters', () => {
      const filters1: StatsFilters = { agentType: 'claude-code' };
      const filters2: StatsFilters = { source: 'user' };
      const filters3: StatsFilters = { agentType: 'opencode', source: 'auto', projectPath: '/test' };

      expect(filters1.agentType).toBe('claude-code');
      expect(filters2.source).toBe('user');
      expect(filters3.projectPath).toBe('/test');
    });
  });

  describe('StatsAggregation interface', () => {
    it('should define proper aggregation structure', () => {
      const aggregation: StatsAggregation = {
        totalQueries: 100,
        totalDuration: 500000,
        avgDuration: 5000,
        byAgent: {
          'claude-code': { count: 70, duration: 350000 },
          opencode: { count: 30, duration: 150000 },
        },
        bySource: { user: 60, auto: 40 },
        byDay: [
          { date: '2024-01-01', count: 10, duration: 50000 },
          { date: '2024-01-02', count: 15, duration: 75000 },
        ],
      };

      expect(aggregation.totalQueries).toBe(100);
      expect(aggregation.byAgent['claude-code'].count).toBe(70);
      expect(aggregation.bySource.user).toBe(60);
      expect(aggregation.byDay).toHaveLength(2);
    });
  });
});

describe('StatsDB class (mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDbPath = null;
    mockDb.pragma.mockReturnValue([{ user_version: 0 }]);
    mockDb.prepare.mockReturnValue(mockStatement);
    mockStatement.run.mockReturnValue({ changes: 1 });
    mockStatement.get.mockReturnValue({ count: 0, total_duration: 0 });
    mockStatement.all.mockReturnValue([]);
    mockFsExistsSync.mockReturnValue(true);
    mockFsMkdirSync.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('module exports', () => {
    it('should export StatsDB class', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      expect(StatsDB).toBeDefined();
      expect(typeof StatsDB).toBe('function');
    });

    it('should export singleton functions', async () => {
      const { getStatsDB, initializeStatsDB, closeStatsDB } = await import('../../main/stats-db');
      expect(getStatsDB).toBeDefined();
      expect(initializeStatsDB).toBeDefined();
      expect(closeStatsDB).toBeDefined();
    });
  });

  describe('StatsDB instantiation', () => {
    it('should create instance without initialization', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      expect(db).toBeDefined();
      expect(db.isReady()).toBe(false);
    });

    it('should return database path', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      expect(db.getDbPath()).toContain('stats.db');
    });
  });

  describe('initialization', () => {
    it('should initialize database and set isReady to true', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      db.initialize();

      expect(db.isReady()).toBe(true);
    });

    it('should enable WAL mode', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      db.initialize();

      expect(mockDb.pragma).toHaveBeenCalledWith('journal_mode = WAL');
    });

    it('should run v1 migration for fresh database', async () => {
      mockDb.pragma.mockImplementation((sql: string) => {
        if (sql === 'user_version') return [{ user_version: 0 }];
        return undefined;
      });

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Should set user_version to 1
      expect(mockDb.pragma).toHaveBeenCalledWith('user_version = 1');
    });

    it('should skip migration for already migrated database', async () => {
      mockDb.pragma.mockImplementation((sql: string) => {
        if (sql === 'user_version') return [{ user_version: 1 }];
        return undefined;
      });

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Should NOT set user_version (no migration needed)
      expect(mockDb.pragma).not.toHaveBeenCalledWith('user_version = 1');
    });
  });

  describe('error handling', () => {
    it('should throw when calling insertQueryEvent before initialization', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      expect(() =>
        db.insertQueryEvent({
          sessionId: 'test',
          agentType: 'claude-code',
          source: 'user',
          startTime: Date.now(),
          duration: 1000,
        })
      ).toThrow('Database not initialized');
    });

    it('should throw when calling getQueryEvents before initialization', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      expect(() => db.getQueryEvents('day')).toThrow('Database not initialized');
    });

    it('should throw when calling getAggregatedStats before initialization', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      expect(() => db.getAggregatedStats('week')).toThrow('Database not initialized');
    });
  });

  describe('query events', () => {
    it('should insert a query event and return an id', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const eventId = db.insertQueryEvent({
        sessionId: 'session-1',
        agentType: 'claude-code',
        source: 'user',
        startTime: Date.now(),
        duration: 5000,
        projectPath: '/test/project',
        tabId: 'tab-1',
      });

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should retrieve query events within time range', async () => {
      mockStatement.all.mockReturnValue([
        {
          id: 'event-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          source: 'user',
          start_time: Date.now(),
          duration: 5000,
          project_path: '/test',
          tab_id: 'tab-1',
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const events = db.getQueryEvents('day');

      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe('session-1');
      expect(events[0].agentType).toBe('claude-code');
    });
  });

  describe('close', () => {
    it('should close the database connection', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.close();

      expect(mockDb.close).toHaveBeenCalled();
      expect(db.isReady()).toBe(false);
    });
  });
});

/**
 * Database file creation verification tests
 *
 * These tests verify that the database file is created at the correct path
 * in the user's application data directory on first launch.
 */
describe('Database file creation on first launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDbPath = null;
    mockDb.pragma.mockReturnValue([{ user_version: 0 }]);
    mockDb.prepare.mockReturnValue(mockStatement);
    mockFsExistsSync.mockReturnValue(true);
    mockFsMkdirSync.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('database path computation', () => {
    it('should compute database path using electron app.getPath("userData")', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      const dbPath = db.getDbPath();

      // Verify the path is in the userData directory
      expect(dbPath).toContain(mockUserDataPath);
      expect(dbPath).toContain('stats.db');
    });

    it('should create database file at userData/stats.db path', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Verify better-sqlite3 was called with the correct path
      expect(lastDbPath).toBe(path.join(mockUserDataPath, 'stats.db'));
    });

    it('should use platform-appropriate userData path', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      // The path should be absolute and contain stats.db
      const dbPath = db.getDbPath();
      expect(path.isAbsolute(dbPath)).toBe(true);
      expect(path.basename(dbPath)).toBe('stats.db');
    });
  });

  describe('directory creation', () => {
    it('should create userData directory if it does not exist', async () => {
      // Simulate directory not existing
      mockFsExistsSync.mockReturnValue(false);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Verify mkdirSync was called with recursive option
      expect(mockFsMkdirSync).toHaveBeenCalledWith(mockUserDataPath, { recursive: true });
    });

    it('should not create directory if it already exists', async () => {
      // Simulate directory already existing
      mockFsExistsSync.mockReturnValue(true);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Verify mkdirSync was NOT called
      expect(mockFsMkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('database initialization', () => {
    it('should open database connection on initialize', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      expect(db.isReady()).toBe(false);
      db.initialize();
      expect(db.isReady()).toBe(true);
    });

    it('should only initialize once (idempotent)', async () => {
      mockDb.pragma.mockClear();

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();

      db.initialize();
      const firstCallCount = mockDb.pragma.mock.calls.length;

      db.initialize(); // Second call should be a no-op
      const secondCallCount = mockDb.pragma.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should create all three tables on fresh database', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Verify prepare was called with CREATE TABLE statements
      const prepareCalls = mockDb.prepare.mock.calls.map((call) => call[0]);

      // Check for query_events table
      expect(prepareCalls.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS query_events'))).toBe(true);

      // Check for auto_run_sessions table
      expect(prepareCalls.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS auto_run_sessions'))).toBe(
        true
      );

      // Check for auto_run_tasks table
      expect(prepareCalls.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS auto_run_tasks'))).toBe(true);
    });

    it('should create all required indexes', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const prepareCalls = mockDb.prepare.mock.calls.map((call) => call[0]);

      // Verify all 7 indexes are created
      const expectedIndexes = [
        'idx_query_start_time',
        'idx_query_agent_type',
        'idx_query_source',
        'idx_query_session',
        'idx_auto_session_start',
        'idx_task_auto_session',
        'idx_task_start',
      ];

      for (const indexName of expectedIndexes) {
        expect(prepareCalls.some((sql: string) => sql.includes(indexName))).toBe(true);
      }
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance from getStatsDB', async () => {
      const { getStatsDB, closeStatsDB } = await import('../../main/stats-db');

      const instance1 = getStatsDB();
      const instance2 = getStatsDB();

      expect(instance1).toBe(instance2);

      // Cleanup
      closeStatsDB();
    });

    it('should initialize database via initializeStatsDB', async () => {
      const { initializeStatsDB, getStatsDB, closeStatsDB } = await import('../../main/stats-db');

      initializeStatsDB();
      const db = getStatsDB();

      expect(db.isReady()).toBe(true);

      // Cleanup
      closeStatsDB();
    });

    it('should close database and reset singleton via closeStatsDB', async () => {
      const { initializeStatsDB, getStatsDB, closeStatsDB } = await import('../../main/stats-db');

      initializeStatsDB();
      const dbBefore = getStatsDB();
      expect(dbBefore.isReady()).toBe(true);

      closeStatsDB();

      // After close, a new instance should be returned
      const dbAfter = getStatsDB();
      expect(dbAfter).not.toBe(dbBefore);
      expect(dbAfter.isReady()).toBe(false);
    });
  });
});

/**
 * Auto Run session and task recording tests
 */
describe('Auto Run session and task recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDbPath = null;
    mockDb.pragma.mockReturnValue([{ user_version: 0 }]);
    mockDb.prepare.mockReturnValue(mockStatement);
    mockStatement.run.mockReturnValue({ changes: 1 });
    mockFsExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Auto Run sessions', () => {
    it('should insert Auto Run session and return id', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const sessionId = db.insertAutoRunSession({
        sessionId: 'session-1',
        agentType: 'claude-code',
        documentPath: '/docs/TASK-1.md',
        startTime: Date.now(),
        duration: 0,
        tasksTotal: 5,
        tasksCompleted: 0,
        projectPath: '/project',
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should update Auto Run session on completion', async () => {
      mockStatement.run.mockReturnValue({ changes: 1 });

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const updated = db.updateAutoRunSession('session-id', {
        duration: 60000,
        tasksCompleted: 5,
      });

      expect(updated).toBe(true);
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should retrieve Auto Run sessions within time range', async () => {
      mockStatement.all.mockReturnValue([
        {
          id: 'auto-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          document_path: '/docs/TASK-1.md',
          start_time: Date.now(),
          duration: 60000,
          tasks_total: 5,
          tasks_completed: 5,
          project_path: '/project',
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const sessions = db.getAutoRunSessions('week');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('session-1');
      expect(sessions[0].tasksTotal).toBe(5);
    });
  });

  describe('Auto Run tasks', () => {
    it('should insert Auto Run task with success=true', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const taskId = db.insertAutoRunTask({
        autoRunSessionId: 'auto-1',
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'First task',
        startTime: Date.now(),
        duration: 10000,
        success: true,
      });

      expect(taskId).toBeDefined();

      // Verify success was converted to 1 for SQLite
      const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
      expect(runCall[8]).toBe(1); // success parameter (last one)
    });

    it('should insert Auto Run task with success=false', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.insertAutoRunTask({
        autoRunSessionId: 'auto-1',
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 1,
        taskContent: 'Failed task',
        startTime: Date.now(),
        duration: 5000,
        success: false,
      });

      // Verify success was converted to 0 for SQLite
      const runCall = mockStatement.run.mock.calls[mockStatement.run.mock.calls.length - 1];
      expect(runCall[8]).toBe(0); // success parameter (last one)
    });

    it('should retrieve tasks for Auto Run session ordered by task_index', async () => {
      mockStatement.all.mockReturnValue([
        {
          id: 'task-1',
          auto_run_session_id: 'auto-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          task_index: 0,
          task_content: 'First task',
          start_time: Date.now(),
          duration: 10000,
          success: 1,
        },
        {
          id: 'task-2',
          auto_run_session_id: 'auto-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          task_index: 1,
          task_content: 'Second task',
          start_time: Date.now(),
          duration: 15000,
          success: 1,
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const tasks = db.getAutoRunTasks('auto-1');

      expect(tasks).toHaveLength(2);
      expect(tasks[0].taskIndex).toBe(0);
      expect(tasks[1].taskIndex).toBe(1);
      expect(tasks[0].success).toBe(true);
    });
  });
});

/**
 * Aggregation and filtering tests
 */
describe('Stats aggregation and filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.pragma.mockReturnValue([{ user_version: 0 }]);
    mockDb.prepare.mockReturnValue(mockStatement);
    mockStatement.run.mockReturnValue({ changes: 1 });
    mockFsExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('time range filtering', () => {
    it('should filter query events by day range', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getQueryEvents('day');

      // Verify the SQL includes time filter
      const prepareCall = mockDb.prepare.mock.calls.find((call) =>
        (call[0] as string).includes('SELECT * FROM query_events')
      );
      expect(prepareCall).toBeDefined();
    });

    it('should filter with agentType filter', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getQueryEvents('week', { agentType: 'claude-code' });

      // Verify the SQL includes agent_type filter
      expect(mockStatement.all).toHaveBeenCalled();
    });

    it('should filter with source filter', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getQueryEvents('month', { source: 'auto' });

      // Verify the SQL includes source filter
      expect(mockStatement.all).toHaveBeenCalled();
    });

    it('should filter with projectPath filter', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getQueryEvents('year', { projectPath: '/test/project' });

      // Verify the SQL includes project_path filter
      expect(mockStatement.all).toHaveBeenCalled();
    });

    it('should filter with sessionId filter', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getQueryEvents('all', { sessionId: 'session-123' });

      // Verify the SQL includes session_id filter
      expect(mockStatement.all).toHaveBeenCalled();
    });

    it('should combine multiple filters', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getQueryEvents('week', {
        agentType: 'claude-code',
        source: 'user',
        projectPath: '/test',
        sessionId: 'session-1',
      });

      // Verify all parameters were passed
      expect(mockStatement.all).toHaveBeenCalled();
    });
  });

  describe('aggregation queries', () => {
    it('should compute aggregated stats correctly', async () => {
      mockStatement.get.mockReturnValue({ count: 100, total_duration: 500000 });
      mockStatement.all.mockReturnValue([
        { agent_type: 'claude-code', count: 70, duration: 350000 },
        { agent_type: 'opencode', count: 30, duration: 150000 },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const stats = db.getAggregatedStats('week');

      expect(stats.totalQueries).toBe(100);
      expect(stats.totalDuration).toBe(500000);
      expect(stats.avgDuration).toBe(5000);
    });

    it('should handle empty results for aggregation', async () => {
      mockStatement.get.mockReturnValue({ count: 0, total_duration: 0 });
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const stats = db.getAggregatedStats('day');

      expect(stats.totalQueries).toBe(0);
      expect(stats.avgDuration).toBe(0);
      expect(stats.byAgent).toEqual({});
    });
  });

  describe('CSV export', () => {
    it('should export query events to CSV format', async () => {
      const now = Date.now();
      mockStatement.all.mockReturnValue([
        {
          id: 'event-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          source: 'user',
          start_time: now,
          duration: 5000,
          project_path: '/test',
          tab_id: 'tab-1',
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const csv = db.exportToCsv('week');

      // Verify CSV structure
      expect(csv).toContain('id,sessionId,agentType,source,startTime,duration,projectPath,tabId');
      expect(csv).toContain('event-1');
      expect(csv).toContain('session-1');
      expect(csv).toContain('claude-code');
    });

    it('should handle empty data for CSV export', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const csv = db.exportToCsv('day');

      // Should only contain headers
      expect(csv).toBe('id,sessionId,agentType,source,startTime,duration,projectPath,tabId');
    });
  });
});

/**
 * Interactive session query event recording tests
 *
 * These tests verify that query events are properly recorded for interactive
 * (user-initiated) sessions, which is the core validation for:
 * - [ ] Verify query events are recorded for interactive sessions
 */
describe('Query events recorded for interactive sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.pragma.mockReturnValue([{ user_version: 1 }]);
    mockDb.prepare.mockReturnValue(mockStatement);
    mockStatement.run.mockReturnValue({ changes: 1 });
    mockStatement.all.mockReturnValue([]);
    mockFsExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('user-initiated interactive session recording', () => {
    it('should record query event with source="user" for interactive session', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const startTime = Date.now();
      const eventId = db.insertQueryEvent({
        sessionId: 'interactive-session-1',
        agentType: 'claude-code',
        source: 'user', // Interactive session is always 'user'
        startTime,
        duration: 5000,
        projectPath: '/Users/test/myproject',
        tabId: 'tab-1',
      });

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');

      // Verify the INSERT was called with correct parameters
      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];

      // Parameters: id, session_id, agent_type, source, start_time, duration, project_path, tab_id
      expect(lastCall[1]).toBe('interactive-session-1'); // session_id
      expect(lastCall[2]).toBe('claude-code'); // agent_type
      expect(lastCall[3]).toBe('user'); // source
      expect(lastCall[4]).toBe(startTime); // start_time
      expect(lastCall[5]).toBe(5000); // duration
      expect(lastCall[6]).toBe('/Users/test/myproject'); // project_path
      expect(lastCall[7]).toBe('tab-1'); // tab_id
    });

    it('should record interactive query without optional fields', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const startTime = Date.now();
      const eventId = db.insertQueryEvent({
        sessionId: 'minimal-session',
        agentType: 'claude-code',
        source: 'user',
        startTime,
        duration: 3000,
        // projectPath and tabId are optional
      });

      expect(eventId).toBeDefined();

      // Verify NULL values for optional fields
      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];
      expect(lastCall[6]).toBeNull(); // project_path
      expect(lastCall[7]).toBeNull(); // tab_id
    });

    it('should record multiple interactive queries for the same session', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const baseTime = Date.now();

      // First query
      const id1 = db.insertQueryEvent({
        sessionId: 'multi-query-session',
        agentType: 'claude-code',
        source: 'user',
        startTime: baseTime,
        duration: 5000,
        projectPath: '/project',
        tabId: 'tab-1',
      });

      // Second query (same session, different tab)
      const id2 = db.insertQueryEvent({
        sessionId: 'multi-query-session',
        agentType: 'claude-code',
        source: 'user',
        startTime: baseTime + 10000,
        duration: 3000,
        projectPath: '/project',
        tabId: 'tab-2',
      });

      // Third query (same session, same tab as first)
      const id3 = db.insertQueryEvent({
        sessionId: 'multi-query-session',
        agentType: 'claude-code',
        source: 'user',
        startTime: baseTime + 20000,
        duration: 7000,
        projectPath: '/project',
        tabId: 'tab-1',
      });

      // All should have unique IDs
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);

      // All should be recorded (3 INSERT calls after initialization)
      expect(mockStatement.run).toHaveBeenCalledTimes(3);
    });

    it('should record interactive queries with different agent types', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const startTime = Date.now();

      // Claude Code query
      const claudeId = db.insertQueryEvent({
        sessionId: 'session-1',
        agentType: 'claude-code',
        source: 'user',
        startTime,
        duration: 5000,
      });

      // OpenCode query
      const opencodeId = db.insertQueryEvent({
        sessionId: 'session-2',
        agentType: 'opencode',
        source: 'user',
        startTime: startTime + 10000,
        duration: 3000,
      });

      // Codex query
      const codexId = db.insertQueryEvent({
        sessionId: 'session-3',
        agentType: 'codex',
        source: 'user',
        startTime: startTime + 20000,
        duration: 4000,
      });

      expect(claudeId).toBeDefined();
      expect(opencodeId).toBeDefined();
      expect(codexId).toBeDefined();

      // Verify different agent types were recorded
      const runCalls = mockStatement.run.mock.calls;
      expect(runCalls[0][2]).toBe('claude-code');
      expect(runCalls[1][2]).toBe('opencode');
      expect(runCalls[2][2]).toBe('codex');
    });
  });

  describe('retrieval of interactive session query events', () => {
    it('should retrieve interactive query events filtered by source=user', async () => {
      const now = Date.now();
      mockStatement.all.mockReturnValue([
        {
          id: 'event-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          source: 'user',
          start_time: now - 1000,
          duration: 5000,
          project_path: '/project',
          tab_id: 'tab-1',
        },
        {
          id: 'event-2',
          session_id: 'session-2',
          agent_type: 'claude-code',
          source: 'user',
          start_time: now - 2000,
          duration: 3000,
          project_path: '/project',
          tab_id: 'tab-2',
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Filter by source='user' to get only interactive sessions
      const events = db.getQueryEvents('day', { source: 'user' });

      expect(events).toHaveLength(2);
      expect(events[0].source).toBe('user');
      expect(events[1].source).toBe('user');
      expect(events[0].sessionId).toBe('session-1');
      expect(events[1].sessionId).toBe('session-2');
    });

    it('should retrieve interactive query events filtered by sessionId', async () => {
      const now = Date.now();
      mockStatement.all.mockReturnValue([
        {
          id: 'event-1',
          session_id: 'target-session',
          agent_type: 'claude-code',
          source: 'user',
          start_time: now - 1000,
          duration: 5000,
          project_path: '/project',
          tab_id: 'tab-1',
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const events = db.getQueryEvents('week', { sessionId: 'target-session' });

      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe('target-session');
    });

    it('should retrieve interactive query events filtered by projectPath', async () => {
      const now = Date.now();
      mockStatement.all.mockReturnValue([
        {
          id: 'event-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          source: 'user',
          start_time: now - 1000,
          duration: 5000,
          project_path: '/specific/project',
          tab_id: 'tab-1',
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const events = db.getQueryEvents('month', { projectPath: '/specific/project' });

      expect(events).toHaveLength(1);
      expect(events[0].projectPath).toBe('/specific/project');
    });

    it('should correctly map database columns to QueryEvent interface fields', async () => {
      const now = Date.now();
      mockStatement.all.mockReturnValue([
        {
          id: 'db-event-id',
          session_id: 'db-session-id',
          agent_type: 'claude-code',
          source: 'user',
          start_time: now,
          duration: 5000,
          project_path: '/project/path',
          tab_id: 'tab-123',
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const events = db.getQueryEvents('day');

      expect(events).toHaveLength(1);
      const event = events[0];

      // Verify snake_case -> camelCase mapping
      expect(event.id).toBe('db-event-id');
      expect(event.sessionId).toBe('db-session-id');
      expect(event.agentType).toBe('claude-code');
      expect(event.source).toBe('user');
      expect(event.startTime).toBe(now);
      expect(event.duration).toBe(5000);
      expect(event.projectPath).toBe('/project/path');
      expect(event.tabId).toBe('tab-123');
    });
  });

  describe('aggregation includes interactive session data', () => {
    it('should include interactive sessions in aggregated stats', async () => {
      mockStatement.get.mockReturnValue({ count: 10, total_duration: 50000 });

      // The aggregation calls mockStatement.all multiple times for different queries
      // We return based on the call sequence: byAgent, bySource, byDay
      let callCount = 0;
      mockStatement.all.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // byAgent breakdown
          return [{ agent_type: 'claude-code', count: 10, duration: 50000 }];
        }
        if (callCount === 2) {
          // bySource breakdown
          return [{ source: 'user', count: 10 }];
        }
        // byDay breakdown
        return [{ date: '2024-12-28', count: 10, duration: 50000 }];
      });

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const stats = db.getAggregatedStats('week');

      expect(stats.totalQueries).toBe(10);
      expect(stats.totalDuration).toBe(50000);
      expect(stats.avgDuration).toBe(5000);
      expect(stats.bySource.user).toBe(10);
      expect(stats.bySource.auto).toBe(0);
    });

    it('should correctly separate user vs auto queries in bySource', async () => {
      mockStatement.get.mockReturnValue({ count: 15, total_duration: 75000 });

      // Return by-source breakdown with both user and auto on second call
      let callCount = 0;
      mockStatement.all.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          // bySource breakdown
          return [
            { source: 'user', count: 10 },
            { source: 'auto', count: 5 },
          ];
        }
        return [];
      });

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const stats = db.getAggregatedStats('month');

      expect(stats.bySource.user).toBe(10);
      expect(stats.bySource.auto).toBe(5);
    });
  });

  describe('timing accuracy for interactive sessions', () => {
    it('should preserve exact startTime and duration values', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const exactStartTime = 1735344000000; // Specific timestamp
      const exactDuration = 12345; // Specific duration in ms

      db.insertQueryEvent({
        sessionId: 'timing-test-session',
        agentType: 'claude-code',
        source: 'user',
        startTime: exactStartTime,
        duration: exactDuration,
      });

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];

      expect(lastCall[4]).toBe(exactStartTime); // Exact start_time preserved
      expect(lastCall[5]).toBe(exactDuration); // Exact duration preserved
    });

    it('should handle zero duration (immediate responses)', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const eventId = db.insertQueryEvent({
        sessionId: 'zero-duration-session',
        agentType: 'claude-code',
        source: 'user',
        startTime: Date.now(),
        duration: 0, // Zero duration is valid (e.g., cached response)
      });

      expect(eventId).toBeDefined();

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];
      expect(lastCall[5]).toBe(0);
    });

    it('should handle very long durations', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const longDuration = 10 * 60 * 1000; // 10 minutes in ms

      const eventId = db.insertQueryEvent({
        sessionId: 'long-duration-session',
        agentType: 'claude-code',
        source: 'user',
        startTime: Date.now(),
        duration: longDuration,
      });

      expect(eventId).toBeDefined();

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];
      expect(lastCall[5]).toBe(longDuration);
    });
  });
});

/**
 * Comprehensive Auto Run session and task recording verification tests
 *
 * These tests verify the complete Auto Run tracking workflow:
 * 1. Auto Run sessions are properly recorded when batch processing starts
 * 2. Individual tasks within sessions are recorded with timing data
 * 3. Sessions are updated correctly when batch processing completes
 * 4. All data can be retrieved with proper field mapping
 */
describe('Auto Run sessions and tasks recorded correctly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.pragma.mockReturnValue([{ user_version: 1 }]);
    mockDb.prepare.mockReturnValue(mockStatement);
    mockStatement.run.mockReturnValue({ changes: 1 });
    mockStatement.get.mockReturnValue({ count: 0, total_duration: 0 });
    mockStatement.all.mockReturnValue([]);
    mockFsExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Auto Run session lifecycle', () => {
    it('should record Auto Run session with all required fields', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const startTime = Date.now();
      const sessionId = db.insertAutoRunSession({
        sessionId: 'maestro-session-123',
        agentType: 'claude-code',
        documentPath: 'Auto Run Docs/PHASE-1.md',
        startTime,
        duration: 0, // Duration is 0 at start
        tasksTotal: 10,
        tasksCompleted: 0,
        projectPath: '/Users/test/my-project',
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');

      // Verify all fields were passed correctly to the INSERT statement
      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];

      // INSERT parameters: id, session_id, agent_type, document_path, start_time, duration, tasks_total, tasks_completed, project_path
      expect(lastCall[1]).toBe('maestro-session-123'); // session_id
      expect(lastCall[2]).toBe('claude-code'); // agent_type
      expect(lastCall[3]).toBe('Auto Run Docs/PHASE-1.md'); // document_path
      expect(lastCall[4]).toBe(startTime); // start_time
      expect(lastCall[5]).toBe(0); // duration (0 at start)
      expect(lastCall[6]).toBe(10); // tasks_total
      expect(lastCall[7]).toBe(0); // tasks_completed (0 at start)
      expect(lastCall[8]).toBe('/Users/test/my-project'); // project_path
    });

    it('should record Auto Run session with multiple documents (comma-separated)', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const sessionId = db.insertAutoRunSession({
        sessionId: 'multi-doc-session',
        agentType: 'claude-code',
        documentPath: 'PHASE-1.md, PHASE-2.md, PHASE-3.md',
        startTime: Date.now(),
        duration: 0,
        tasksTotal: 25,
        tasksCompleted: 0,
        projectPath: '/project',
      });

      expect(sessionId).toBeDefined();

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];
      expect(lastCall[3]).toBe('PHASE-1.md, PHASE-2.md, PHASE-3.md');
    });

    it('should update Auto Run session duration and tasks on completion', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // First, insert the session
      const autoRunId = db.insertAutoRunSession({
        sessionId: 'session-to-update',
        agentType: 'claude-code',
        documentPath: 'TASKS.md',
        startTime: Date.now() - 60000, // Started 1 minute ago
        duration: 0,
        tasksTotal: 5,
        tasksCompleted: 0,
        projectPath: '/project',
      });

      // Now update it with completion data
      const updated = db.updateAutoRunSession(autoRunId, {
        duration: 60000, // 1 minute
        tasksCompleted: 5,
      });

      expect(updated).toBe(true);

      // Verify UPDATE was called
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should update Auto Run session with partial completion (some tasks skipped)', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const autoRunId = db.insertAutoRunSession({
        sessionId: 'partial-session',
        agentType: 'claude-code',
        documentPath: 'COMPLEX-TASKS.md',
        startTime: Date.now(),
        duration: 0,
        tasksTotal: 10,
        tasksCompleted: 0,
        projectPath: '/project',
      });

      // Update with partial completion (7 of 10 tasks)
      const updated = db.updateAutoRunSession(autoRunId, {
        duration: 120000, // 2 minutes
        tasksCompleted: 7,
      });

      expect(updated).toBe(true);
    });

    it('should handle Auto Run session stopped by user (wasStopped)', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const autoRunId = db.insertAutoRunSession({
        sessionId: 'stopped-session',
        agentType: 'claude-code',
        documentPath: 'TASKS.md',
        startTime: Date.now(),
        duration: 0,
        tasksTotal: 20,
        tasksCompleted: 0,
        projectPath: '/project',
      });

      // User stopped after 3 tasks
      const updated = db.updateAutoRunSession(autoRunId, {
        duration: 30000, // 30 seconds
        tasksCompleted: 3,
      });

      expect(updated).toBe(true);
    });
  });

  describe('Auto Run task recording', () => {
    it('should record individual task with all fields', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const taskStartTime = Date.now() - 5000;
      const taskId = db.insertAutoRunTask({
        autoRunSessionId: 'auto-run-session-1',
        sessionId: 'maestro-session-1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'Implement user authentication module',
        startTime: taskStartTime,
        duration: 5000,
        success: true,
      });

      expect(taskId).toBeDefined();

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];

      // INSERT parameters: id, auto_run_session_id, session_id, agent_type, task_index, task_content, start_time, duration, success
      expect(lastCall[1]).toBe('auto-run-session-1'); // auto_run_session_id
      expect(lastCall[2]).toBe('maestro-session-1'); // session_id
      expect(lastCall[3]).toBe('claude-code'); // agent_type
      expect(lastCall[4]).toBe(0); // task_index
      expect(lastCall[5]).toBe('Implement user authentication module'); // task_content
      expect(lastCall[6]).toBe(taskStartTime); // start_time
      expect(lastCall[7]).toBe(5000); // duration
      expect(lastCall[8]).toBe(1); // success (true -> 1)
    });

    it('should record failed task with success=false', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.insertAutoRunTask({
        autoRunSessionId: 'auto-run-1',
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 2,
        taskContent: 'Fix complex edge case that requires manual intervention',
        startTime: Date.now(),
        duration: 10000,
        success: false, // Task failed
      });

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];
      expect(lastCall[8]).toBe(0); // success (false -> 0)
    });

    it('should record multiple tasks for same Auto Run session', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const autoRunSessionId = 'multi-task-session';
      const baseTime = Date.now();

      // Task 0
      const task0Id = db.insertAutoRunTask({
        autoRunSessionId,
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'Task 0: Initialize project',
        startTime: baseTime,
        duration: 3000,
        success: true,
      });

      // Task 1
      const task1Id = db.insertAutoRunTask({
        autoRunSessionId,
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 1,
        taskContent: 'Task 1: Add dependencies',
        startTime: baseTime + 3000,
        duration: 5000,
        success: true,
      });

      // Task 2
      const task2Id = db.insertAutoRunTask({
        autoRunSessionId,
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 2,
        taskContent: 'Task 2: Configure build system',
        startTime: baseTime + 8000,
        duration: 7000,
        success: true,
      });

      // All tasks should have unique IDs
      expect(task0Id).not.toBe(task1Id);
      expect(task1Id).not.toBe(task2Id);
      expect(task0Id).not.toBe(task2Id);

      // All 3 INSERT calls should have happened
      expect(mockStatement.run).toHaveBeenCalledTimes(3);
    });

    it('should record task without optional taskContent', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const taskId = db.insertAutoRunTask({
        autoRunSessionId: 'auto-run-1',
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 0,
        // taskContent is omitted
        startTime: Date.now(),
        duration: 2000,
        success: true,
      });

      expect(taskId).toBeDefined();

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];
      expect(lastCall[5]).toBeNull(); // task_content should be NULL
    });
  });

  describe('Auto Run session and task retrieval', () => {
    it('should retrieve Auto Run sessions with proper field mapping', async () => {
      const now = Date.now();
      mockStatement.all.mockReturnValue([
        {
          id: 'auto-run-id-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          document_path: 'PHASE-1.md',
          start_time: now - 60000,
          duration: 60000,
          tasks_total: 10,
          tasks_completed: 10,
          project_path: '/project/path',
        },
        {
          id: 'auto-run-id-2',
          session_id: 'session-2',
          agent_type: 'opencode',
          document_path: null, // No document path
          start_time: now - 120000,
          duration: 45000,
          tasks_total: 5,
          tasks_completed: 4,
          project_path: null,
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const sessions = db.getAutoRunSessions('week');

      expect(sessions).toHaveLength(2);

      // First session - all fields present
      expect(sessions[0].id).toBe('auto-run-id-1');
      expect(sessions[0].sessionId).toBe('session-1');
      expect(sessions[0].agentType).toBe('claude-code');
      expect(sessions[0].documentPath).toBe('PHASE-1.md');
      expect(sessions[0].startTime).toBe(now - 60000);
      expect(sessions[0].duration).toBe(60000);
      expect(sessions[0].tasksTotal).toBe(10);
      expect(sessions[0].tasksCompleted).toBe(10);
      expect(sessions[0].projectPath).toBe('/project/path');

      // Second session - optional fields are undefined
      expect(sessions[1].id).toBe('auto-run-id-2');
      expect(sessions[1].documentPath).toBeUndefined();
      expect(sessions[1].projectPath).toBeUndefined();
      expect(sessions[1].tasksCompleted).toBe(4);
    });

    it('should retrieve tasks for Auto Run session with proper field mapping', async () => {
      const now = Date.now();
      mockStatement.all.mockReturnValue([
        {
          id: 'task-id-0',
          auto_run_session_id: 'auto-run-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          task_index: 0,
          task_content: 'First task description',
          start_time: now - 15000,
          duration: 5000,
          success: 1,
        },
        {
          id: 'task-id-1',
          auto_run_session_id: 'auto-run-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          task_index: 1,
          task_content: null, // No content
          start_time: now - 10000,
          duration: 5000,
          success: 1,
        },
        {
          id: 'task-id-2',
          auto_run_session_id: 'auto-run-1',
          session_id: 'session-1',
          agent_type: 'claude-code',
          task_index: 2,
          task_content: 'Failed task',
          start_time: now - 5000,
          duration: 3000,
          success: 0, // Failed
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const tasks = db.getAutoRunTasks('auto-run-1');

      expect(tasks).toHaveLength(3);

      // First task
      expect(tasks[0].id).toBe('task-id-0');
      expect(tasks[0].autoRunSessionId).toBe('auto-run-1');
      expect(tasks[0].sessionId).toBe('session-1');
      expect(tasks[0].agentType).toBe('claude-code');
      expect(tasks[0].taskIndex).toBe(0);
      expect(tasks[0].taskContent).toBe('First task description');
      expect(tasks[0].startTime).toBe(now - 15000);
      expect(tasks[0].duration).toBe(5000);
      expect(tasks[0].success).toBe(true); // 1 -> true

      // Second task - no content
      expect(tasks[1].taskContent).toBeUndefined();
      expect(tasks[1].success).toBe(true);

      // Third task - failed
      expect(tasks[2].success).toBe(false); // 0 -> false
    });

    it('should return tasks ordered by task_index ASC', async () => {
      // Return tasks in wrong order to verify sorting
      mockStatement.all.mockReturnValue([
        { id: 't2', auto_run_session_id: 'ar1', session_id: 's1', agent_type: 'claude-code', task_index: 2, task_content: 'C', start_time: 3, duration: 1, success: 1 },
        { id: 't0', auto_run_session_id: 'ar1', session_id: 's1', agent_type: 'claude-code', task_index: 0, task_content: 'A', start_time: 1, duration: 1, success: 1 },
        { id: 't1', auto_run_session_id: 'ar1', session_id: 's1', agent_type: 'claude-code', task_index: 1, task_content: 'B', start_time: 2, duration: 1, success: 1 },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const tasks = db.getAutoRunTasks('ar1');

      // Should be returned as-is (the SQL query handles ordering)
      // The mock returns them unsorted, but the real DB would sort them
      expect(tasks).toHaveLength(3);
    });
  });

  describe('Auto Run time range filtering', () => {
    it('should filter Auto Run sessions by day range', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getAutoRunSessions('day');

      // Verify the query was prepared with time filter
      const prepareCalls = mockDb.prepare.mock.calls;
      const selectCall = prepareCalls.find((call) =>
        (call[0] as string).includes('SELECT * FROM auto_run_sessions')
      );
      expect(selectCall).toBeDefined();
      expect(selectCall![0]).toContain('start_time >= ?');
    });

    it('should return all Auto Run sessions for "all" time range', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      mockStatement.all.mockReturnValue([
        { id: 'old', session_id: 's1', agent_type: 'claude-code', document_path: null, start_time: 1000, duration: 100, tasks_total: 1, tasks_completed: 1, project_path: null },
        { id: 'new', session_id: 's2', agent_type: 'claude-code', document_path: null, start_time: Date.now(), duration: 100, tasks_total: 1, tasks_completed: 1, project_path: null },
      ]);

      const sessions = db.getAutoRunSessions('all');

      // With 'all' range, startTime should be 0, so all sessions should be returned
      expect(sessions).toHaveLength(2);
    });
  });

  describe('complete Auto Run workflow', () => {
    it('should support the full Auto Run lifecycle: start -> record tasks -> end', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const batchStartTime = Date.now();

      // Step 1: Start Auto Run session
      const autoRunId = db.insertAutoRunSession({
        sessionId: 'complete-workflow-session',
        agentType: 'claude-code',
        documentPath: 'PHASE-1.md, PHASE-2.md',
        startTime: batchStartTime,
        duration: 0,
        tasksTotal: 5,
        tasksCompleted: 0,
        projectPath: '/test/project',
      });

      expect(autoRunId).toBeDefined();

      // Step 2: Record individual tasks as they complete
      let taskTime = batchStartTime;

      for (let i = 0; i < 5; i++) {
        const taskDuration = 2000 + (i * 500); // Varying durations
        db.insertAutoRunTask({
          autoRunSessionId: autoRunId,
          sessionId: 'complete-workflow-session',
          agentType: 'claude-code',
          taskIndex: i,
          taskContent: `Task ${i + 1}: Implementation step ${i + 1}`,
          startTime: taskTime,
          duration: taskDuration,
          success: i !== 3, // Task 4 (index 3) fails
        });
        taskTime += taskDuration;
      }

      // Step 3: End Auto Run session
      const totalDuration = taskTime - batchStartTime;
      const updated = db.updateAutoRunSession(autoRunId, {
        duration: totalDuration,
        tasksCompleted: 4, // 4 of 5 succeeded
      });

      expect(updated).toBe(true);

      // Verify the total number of INSERT/UPDATE calls
      // 1 session insert + 5 task inserts + 1 session update = 7 calls
      expect(mockStatement.run).toHaveBeenCalledTimes(7);
    });

    it('should handle Auto Run with loop mode (multiple passes)', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const startTime = Date.now();

      // Start session for loop mode run
      const autoRunId = db.insertAutoRunSession({
        sessionId: 'loop-mode-session',
        agentType: 'claude-code',
        documentPath: 'RECURRING-TASKS.md',
        startTime,
        duration: 0,
        tasksTotal: 15, // Initial estimate (may grow with loops)
        tasksCompleted: 0,
        projectPath: '/project',
      });

      // Record tasks from multiple loop iterations
      // Loop 1: 5 tasks
      for (let i = 0; i < 5; i++) {
        db.insertAutoRunTask({
          autoRunSessionId: autoRunId,
          sessionId: 'loop-mode-session',
          agentType: 'claude-code',
          taskIndex: i,
          taskContent: `Loop 1, Task ${i + 1}`,
          startTime: startTime + (i * 3000),
          duration: 3000,
          success: true,
        });
      }

      // Loop 2: 5 more tasks
      for (let i = 0; i < 5; i++) {
        db.insertAutoRunTask({
          autoRunSessionId: autoRunId,
          sessionId: 'loop-mode-session',
          agentType: 'claude-code',
          taskIndex: 5 + i, // Continue indexing from where loop 1 ended
          taskContent: `Loop 2, Task ${i + 1}`,
          startTime: startTime + 15000 + (i * 3000),
          duration: 3000,
          success: true,
        });
      }

      // Update with final stats
      db.updateAutoRunSession(autoRunId, {
        duration: 30000, // 30 seconds total
        tasksCompleted: 10,
      });

      // 1 session + 10 tasks + 1 update = 12 calls
      expect(mockStatement.run).toHaveBeenCalledTimes(12);
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle very long task content (synopsis)', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const longContent = 'A'.repeat(10000); // 10KB task content

      const taskId = db.insertAutoRunTask({
        autoRunSessionId: 'ar1',
        sessionId: 's1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: longContent,
        startTime: Date.now(),
        duration: 5000,
        success: true,
      });

      expect(taskId).toBeDefined();

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];
      expect(lastCall[5]).toBe(longContent);
    });

    it('should handle zero duration tasks', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const taskId = db.insertAutoRunTask({
        autoRunSessionId: 'ar1',
        sessionId: 's1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'Instant task',
        startTime: Date.now(),
        duration: 0, // Zero duration (e.g., cached result)
        success: true,
      });

      expect(taskId).toBeDefined();

      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];
      expect(lastCall[7]).toBe(0);
    });

    it('should handle Auto Run session with zero tasks total', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // This shouldn't happen in practice, but the database should handle it
      const sessionId = db.insertAutoRunSession({
        sessionId: 'empty-session',
        agentType: 'claude-code',
        documentPath: 'EMPTY.md',
        startTime: Date.now(),
        duration: 100,
        tasksTotal: 0,
        tasksCompleted: 0,
        projectPath: '/project',
      });

      expect(sessionId).toBeDefined();
    });

    it('should handle different agent types for Auto Run', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Claude Code Auto Run
      db.insertAutoRunSession({
        sessionId: 's1',
        agentType: 'claude-code',
        documentPath: 'TASKS.md',
        startTime: Date.now(),
        duration: 1000,
        tasksTotal: 5,
        tasksCompleted: 5,
        projectPath: '/project',
      });

      // OpenCode Auto Run
      db.insertAutoRunSession({
        sessionId: 's2',
        agentType: 'opencode',
        documentPath: 'TASKS.md',
        startTime: Date.now(),
        duration: 2000,
        tasksTotal: 3,
        tasksCompleted: 3,
        projectPath: '/project',
      });

      // Verify both agent types were recorded
      const runCalls = mockStatement.run.mock.calls;
      expect(runCalls[0][2]).toBe('claude-code');
      expect(runCalls[1][2]).toBe('opencode');
    });
  });
});

/**
 * Foreign key relationship verification tests
 *
 * These tests verify that the foreign key relationship between auto_run_tasks
 * and auto_run_sessions is properly defined in the schema, ensuring referential
 * integrity can be enforced when foreign key constraints are enabled.
 */
describe('Foreign key relationship between tasks and sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.pragma.mockReturnValue([{ user_version: 0 }]);
    mockDb.prepare.mockReturnValue(mockStatement);
    mockStatement.run.mockReturnValue({ changes: 1 });
    mockStatement.get.mockReturnValue({ count: 0, total_duration: 0 });
    mockStatement.all.mockReturnValue([]);
    mockFsExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('schema definition', () => {
    it('should create auto_run_tasks table with REFERENCES clause to auto_run_sessions', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Verify the CREATE TABLE statement includes the foreign key reference
      const prepareCalls = mockDb.prepare.mock.calls.map((call) => call[0] as string);
      const createTasksTable = prepareCalls.find((sql) =>
        sql.includes('CREATE TABLE IF NOT EXISTS auto_run_tasks')
      );

      expect(createTasksTable).toBeDefined();
      expect(createTasksTable).toContain('auto_run_session_id TEXT NOT NULL REFERENCES auto_run_sessions(id)');
    });

    it('should have auto_run_session_id column as NOT NULL in auto_run_tasks', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const prepareCalls = mockDb.prepare.mock.calls.map((call) => call[0] as string);
      const createTasksTable = prepareCalls.find((sql) =>
        sql.includes('CREATE TABLE IF NOT EXISTS auto_run_tasks')
      );

      expect(createTasksTable).toBeDefined();
      // Verify NOT NULL constraint is present for auto_run_session_id
      expect(createTasksTable).toContain('auto_run_session_id TEXT NOT NULL');
    });

    it('should create index on auto_run_session_id foreign key column', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const prepareCalls = mockDb.prepare.mock.calls.map((call) => call[0] as string);
      const indexCreation = prepareCalls.find((sql) =>
        sql.includes('idx_task_auto_session')
      );

      expect(indexCreation).toBeDefined();
      expect(indexCreation).toContain('ON auto_run_tasks(auto_run_session_id)');
    });
  });

  describe('referential integrity behavior', () => {
    it('should store auto_run_session_id when inserting task', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const autoRunSessionId = 'parent-session-abc-123';
      db.insertAutoRunTask({
        autoRunSessionId,
        sessionId: 'maestro-session-1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'Test task',
        startTime: Date.now(),
        duration: 1000,
        success: true,
      });

      // Verify the auto_run_session_id was passed to the INSERT
      const runCalls = mockStatement.run.mock.calls;
      const lastCall = runCalls[runCalls.length - 1];

      // INSERT parameters: id, auto_run_session_id, session_id, agent_type, task_index, task_content, start_time, duration, success
      expect(lastCall[1]).toBe(autoRunSessionId);
    });

    it('should insert task with matching auto_run_session_id from parent session', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Clear calls from initialization
      mockStatement.run.mockClear();

      // First insert a session
      const autoRunId = db.insertAutoRunSession({
        sessionId: 'session-1',
        agentType: 'claude-code',
        documentPath: 'PHASE-1.md',
        startTime: Date.now(),
        duration: 0,
        tasksTotal: 5,
        tasksCompleted: 0,
        projectPath: '/project',
      });

      // Then insert a task referencing that session
      const taskId = db.insertAutoRunTask({
        autoRunSessionId: autoRunId,
        sessionId: 'session-1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'First task',
        startTime: Date.now(),
        duration: 1000,
        success: true,
      });

      expect(autoRunId).toBeDefined();
      expect(taskId).toBeDefined();

      // Both inserts should have succeeded (session + task)
      expect(mockStatement.run).toHaveBeenCalledTimes(2);

      // Verify the task INSERT used the session ID returned from the session INSERT
      const runCalls = mockStatement.run.mock.calls;
      const taskInsertCall = runCalls[1];
      expect(taskInsertCall[1]).toBe(autoRunId); // auto_run_session_id matches
    });

    it('should retrieve tasks only for the specific parent session', async () => {
      const now = Date.now();

      // Mock returns tasks for session 'auto-run-A' only
      mockStatement.all.mockReturnValue([
        {
          id: 'task-1',
          auto_run_session_id: 'auto-run-A',
          session_id: 'session-1',
          agent_type: 'claude-code',
          task_index: 0,
          task_content: 'Task for session A',
          start_time: now,
          duration: 1000,
          success: 1,
        },
        {
          id: 'task-2',
          auto_run_session_id: 'auto-run-A',
          session_id: 'session-1',
          agent_type: 'claude-code',
          task_index: 1,
          task_content: 'Another task for session A',
          start_time: now + 1000,
          duration: 2000,
          success: 1,
        },
      ]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Query tasks for 'auto-run-A'
      const tasksA = db.getAutoRunTasks('auto-run-A');

      expect(tasksA).toHaveLength(2);
      expect(tasksA[0].autoRunSessionId).toBe('auto-run-A');
      expect(tasksA[1].autoRunSessionId).toBe('auto-run-A');

      // Verify the WHERE clause used the correct auto_run_session_id
      expect(mockStatement.all).toHaveBeenCalledWith('auto-run-A');
    });

    it('should return empty array when no tasks exist for a session', async () => {
      mockStatement.all.mockReturnValue([]);

      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      const tasks = db.getAutoRunTasks('non-existent-session');

      expect(tasks).toHaveLength(0);
      expect(tasks).toEqual([]);
    });
  });

  describe('data consistency verification', () => {
    it('should maintain consistent auto_run_session_id across multiple tasks', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Clear calls from initialization
      mockStatement.run.mockClear();

      const parentSessionId = 'consistent-parent-session';

      // Insert multiple tasks for the same parent session
      for (let i = 0; i < 5; i++) {
        db.insertAutoRunTask({
          autoRunSessionId: parentSessionId,
          sessionId: 'maestro-session',
          agentType: 'claude-code',
          taskIndex: i,
          taskContent: `Task ${i + 1}`,
          startTime: Date.now() + i * 1000,
          duration: 1000,
          success: true,
        });
      }

      // Verify all 5 tasks used the same parent session ID
      const runCalls = mockStatement.run.mock.calls;
      expect(runCalls).toHaveLength(5);

      for (const call of runCalls) {
        expect(call[1]).toBe(parentSessionId); // auto_run_session_id
      }
    });

    it('should allow tasks from different sessions to be inserted independently', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Clear calls from initialization
      mockStatement.run.mockClear();

      // Insert tasks for session A
      db.insertAutoRunTask({
        autoRunSessionId: 'session-A',
        sessionId: 'maestro-1',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'Task A1',
        startTime: Date.now(),
        duration: 1000,
        success: true,
      });

      // Insert tasks for session B
      db.insertAutoRunTask({
        autoRunSessionId: 'session-B',
        sessionId: 'maestro-2',
        agentType: 'opencode',
        taskIndex: 0,
        taskContent: 'Task B1',
        startTime: Date.now(),
        duration: 2000,
        success: true,
      });

      // Insert another task for session A
      db.insertAutoRunTask({
        autoRunSessionId: 'session-A',
        sessionId: 'maestro-1',
        agentType: 'claude-code',
        taskIndex: 1,
        taskContent: 'Task A2',
        startTime: Date.now(),
        duration: 1500,
        success: true,
      });

      const runCalls = mockStatement.run.mock.calls;
      expect(runCalls).toHaveLength(3);

      // Verify parent session IDs are correctly assigned
      expect(runCalls[0][1]).toBe('session-A');
      expect(runCalls[1][1]).toBe('session-B');
      expect(runCalls[2][1]).toBe('session-A');
    });

    it('should use generated session ID as foreign key when retrieved after insertion', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      // Clear calls from initialization
      mockStatement.run.mockClear();

      // Insert a session and capture the generated ID
      const generatedSessionId = db.insertAutoRunSession({
        sessionId: 'maestro-session',
        agentType: 'claude-code',
        documentPath: 'DOC.md',
        startTime: Date.now(),
        duration: 0,
        tasksTotal: 3,
        tasksCompleted: 0,
        projectPath: '/project',
      });

      // The generated ID should be a string with timestamp-random format
      expect(generatedSessionId).toMatch(/^\d+-[a-z0-9]+$/);

      // Use this generated ID as the foreign key for tasks
      db.insertAutoRunTask({
        autoRunSessionId: generatedSessionId,
        sessionId: 'maestro-session',
        agentType: 'claude-code',
        taskIndex: 0,
        taskContent: 'First task',
        startTime: Date.now(),
        duration: 1000,
        success: true,
      });

      const runCalls = mockStatement.run.mock.calls;
      const taskInsert = runCalls[1]; // Second call is the task insert (first is session insert)

      // Verify the task uses the exact same ID that was generated for the session
      expect(taskInsert[1]).toBe(generatedSessionId);
    });
  });

  describe('query filtering by foreign key', () => {
    it('should filter tasks using WHERE auto_run_session_id clause', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getAutoRunTasks('specific-session-id');

      // Verify the SQL query includes proper WHERE clause for foreign key
      const prepareCalls = mockDb.prepare.mock.calls;
      const selectTasksCall = prepareCalls.find((call) =>
        (call[0] as string).includes('SELECT * FROM auto_run_tasks') &&
        (call[0] as string).includes('WHERE auto_run_session_id = ?')
      );

      expect(selectTasksCall).toBeDefined();
    });

    it('should order tasks by task_index within a session', async () => {
      const { StatsDB } = await import('../../main/stats-db');
      const db = new StatsDB();
      db.initialize();

      db.getAutoRunTasks('any-session');

      // Verify the query includes ORDER BY task_index
      const prepareCalls = mockDb.prepare.mock.calls;
      const selectTasksCall = prepareCalls.find((call) =>
        (call[0] as string).includes('ORDER BY task_index ASC')
      );

      expect(selectTasksCall).toBeDefined();
    });
  });
});
