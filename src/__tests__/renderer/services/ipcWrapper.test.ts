/**
 * Tests for IPC Wrapper Factory
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createIpcMethod,
  createIpcMethodFactory,
  wrapService,
  IpcMethodOptionsWithDefault,
  IpcMethodOptionsRethrow,
} from '../../../renderer/services/ipcWrapper';

describe('ipcWrapper', () => {
  // Store console.error spy
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('createIpcMethod', () => {
    describe('with defaultValue (swallow errors)', () => {
      it('should return the result on success', async () => {
        const result = await createIpcMethod({
          call: () => Promise.resolve({ data: 'test' }),
          errorContext: 'Test operation',
          defaultValue: { data: 'default' },
        });

        expect(result).toEqual({ data: 'test' });
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should return the default value on error', async () => {
        const result = await createIpcMethod({
          call: () => Promise.reject(new Error('IPC failed')),
          errorContext: 'Test operation',
          defaultValue: { data: 'default' },
        });

        expect(result).toEqual({ data: 'default' });
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Test operation error:',
          expect.any(Error)
        );
      });

      it('should return empty array as default value', async () => {
        const result = await createIpcMethod({
          call: () => Promise.reject(new Error('Failed')),
          errorContext: 'Git branches',
          defaultValue: [] as string[],
        });

        expect(result).toEqual([]);
      });

      it('should return false as default value', async () => {
        const result = await createIpcMethod({
          call: () => Promise.reject(new Error('Failed')),
          errorContext: 'Is repo',
          defaultValue: false,
        });

        expect(result).toBe(false);
      });

      it('should return null as default value', async () => {
        const result = await createIpcMethod({
          call: () => Promise.reject(new Error('Failed')),
          errorContext: 'Get URL',
          defaultValue: null as string | null,
        });

        expect(result).toBeNull();
      });

      it('should apply transform function on success', async () => {
        const result = await createIpcMethod({
          call: () => Promise.resolve({ stdout: 'branch-name\n' }),
          errorContext: 'Git branch',
          defaultValue: { stdout: '' },
          transform: (r) => ({ stdout: r.stdout.trim() }),
        });

        expect(result).toEqual({ stdout: 'branch-name' });
      });

      it('should not apply transform function on error', async () => {
        const transform = vi.fn((r) => r);
        const result = await createIpcMethod({
          call: () => Promise.reject(new Error('Failed')),
          errorContext: 'Git branch',
          defaultValue: { stdout: '' },
          transform,
        });

        expect(result).toEqual({ stdout: '' });
        expect(transform).not.toHaveBeenCalled();
      });
    });

    describe('with rethrow: true (propagate errors)', () => {
      it('should return the result on success', async () => {
        const result = await createIpcMethod({
          call: () => Promise.resolve('success'),
          errorContext: 'Process spawn',
          rethrow: true,
        });

        expect(result).toBe('success');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should rethrow error after logging', async () => {
        const error = new Error('Spawn failed');

        await expect(
          createIpcMethod({
            call: () => Promise.reject(error),
            errorContext: 'Process spawn',
            rethrow: true,
          })
        ).rejects.toThrow('Spawn failed');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Process spawn error:',
          error
        );
      });

      it('should apply transform function on success', async () => {
        const result = await createIpcMethod({
          call: () => Promise.resolve(5),
          errorContext: 'Get count',
          rethrow: true,
          transform: (n) => n * 2,
        });

        expect(result).toBe(10);
      });

      it('should not apply transform function on error', async () => {
        const transform = vi.fn((r) => r);

        await expect(
          createIpcMethod({
            call: () => Promise.reject(new Error('Failed')),
            errorContext: 'Get count',
            rethrow: true,
            transform,
          })
        ).rejects.toThrow('Failed');

        expect(transform).not.toHaveBeenCalled();
      });
    });

    describe('type safety', () => {
      it('should infer correct return type with defaultValue', async () => {
        const options: IpcMethodOptionsWithDefault<{ branches: string[] }> = {
          call: () => Promise.resolve({ branches: ['main', 'dev'] }),
          errorContext: 'Git branches',
          defaultValue: { branches: [] },
        };

        const result = await createIpcMethod(options);
        // Type should be { branches: string[] }
        expect(result.branches).toEqual(['main', 'dev']);
      });

      it('should infer correct return type with rethrow', async () => {
        const options: IpcMethodOptionsRethrow<void> = {
          call: () => Promise.resolve(),
          errorContext: 'Process kill',
          rethrow: true,
        };

        const result = await createIpcMethod(options);
        // Type should be void
        expect(result).toBeUndefined();
      });
    });
  });

  describe('createIpcMethodFactory', () => {
    describe('with default behavior', () => {
      it('should create a factory that returns default values on error', async () => {
        const createGitMethod = createIpcMethodFactory('Git', 'default');

        const result = await createGitMethod(
          () => Promise.reject(new Error('Failed')),
          [] as string[],
          'branches'
        );

        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Git branches error:',
          expect.any(Error)
        );
      });

      it('should create a factory that returns results on success', async () => {
        const createGitMethod = createIpcMethodFactory('Git', 'default');

        const result = await createGitMethod(
          () => Promise.resolve(['main', 'feature']),
          [] as string[],
          'branches'
        );

        expect(result).toEqual(['main', 'feature']);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should use base context when operation not provided', async () => {
        const createMethod = createIpcMethodFactory('Service', 'default');

        await createMethod(() => Promise.reject(new Error('Failed')), null);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Service error:',
          expect.any(Error)
        );
      });
    });

    describe('with rethrow behavior', () => {
      it('should create a factory that rethrows errors', async () => {
        const createProcessMethod = createIpcMethodFactory('Process', 'rethrow');

        await expect(
          createProcessMethod(
            () => Promise.reject(new Error('Kill failed')),
            'kill'
          )
        ).rejects.toThrow('Kill failed');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Process kill error:',
          expect.any(Error)
        );
      });

      it('should create a factory that returns results on success', async () => {
        const createProcessMethod = createIpcMethodFactory('Process', 'rethrow');

        const result = await createProcessMethod(
          () => Promise.resolve(),
          'spawn'
        );

        expect(result).toBeUndefined();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should use base context when operation not provided', async () => {
        const createMethod = createIpcMethodFactory('Service', 'rethrow');

        await expect(
          createMethod(() => Promise.reject(new Error('Failed')))
        ).rejects.toThrow('Failed');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Service error:',
          expect.any(Error)
        );
      });
    });

    describe('real-world usage patterns', () => {
      it('should work for git service pattern', async () => {
        const createGitMethod = createIpcMethodFactory('Git', 'default');

        // Simulating gitService.getBranches
        const getBranches = (cwd: string) =>
          createGitMethod(
            async () => {
              // Simulate IPC call
              const result = await Promise.resolve({
                branches: ['main', 'feature-1'],
              });
              return result.branches || [];
            },
            [] as string[],
            'branches'
          );

        const branches = await getBranches('/some/path');
        expect(branches).toEqual(['main', 'feature-1']);
      });

      it('should work for process service pattern', async () => {
        const createProcessMethod = createIpcMethodFactory('Process', 'rethrow');

        // Simulating processService.spawn
        const spawn = (config: { cwd: string }) =>
          createProcessMethod(
            async () => {
              // Simulate IPC call that returns void
              await Promise.resolve();
            },
            'spawn'
          );

        await expect(spawn({ cwd: '/path' })).resolves.toBeUndefined();
      });
    });
  });

  describe('wrapService', () => {
    it('should wrap all methods with error handling', async () => {
      const rawService = {
        getBranches: (cwd: string) =>
          Promise.resolve({ branches: ['main'] }),
        getTags: (cwd: string) => Promise.resolve({ tags: ['v1.0'] }),
      };

      const wrapped = wrapService('Git', rawService, {
        defaultValues: {
          getBranches: { branches: [] },
          getTags: { tags: [] },
        },
      });

      const result = await wrapped.getBranches('/path');
      expect(result).toEqual({ branches: ['main'] });
    });

    it('should return default values on error', async () => {
      const rawService = {
        getBranches: () => Promise.reject(new Error('Failed')),
        getTags: () => Promise.resolve({ tags: ['v1.0'] }),
      };

      const wrapped = wrapService('Git', rawService, {
        defaultValues: {
          getBranches: { branches: [] as string[] },
          getTags: { tags: [] as string[] },
        },
      });

      const result = await wrapped.getBranches('/path');
      expect(result).toEqual({ branches: [] });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Git getBranches error:',
        expect.any(Error)
      );
    });

    it('should rethrow errors for specified methods', async () => {
      const rawService = {
        read: () => Promise.reject(new Error('Read failed')),
        write: () => Promise.reject(new Error('Write failed')),
      };

      const wrapped = wrapService('File', rawService, {
        defaultValues: {
          read: '',
        },
        rethrowMethods: ['write'],
      });

      // Read should return default
      const readResult = await wrapped.read();
      expect(readResult).toBe('');

      // Write should rethrow
      await expect(wrapped.write()).rejects.toThrow('Write failed');
    });

    it('should handle methods with multiple arguments', async () => {
      const rawService = {
        diff: (cwd: string, files: string[]) =>
          Promise.resolve({ diff: 'changes' }),
      };

      const wrapped = wrapService('Git', rawService, {
        defaultValues: {
          diff: { diff: '' },
        },
      });

      const result = await wrapped.diff('/path', ['file1.ts', 'file2.ts']);
      expect(result).toEqual({ diff: 'changes' });
    });

    it('should handle async operations correctly', async () => {
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      const rawService = {
        slowOperation: async () => {
          await delay(10);
          return { data: 'done' };
        },
      };

      const wrapped = wrapService('Async', rawService, {
        defaultValues: {
          slowOperation: { data: '' },
        },
      });

      const result = await wrapped.slowOperation();
      expect(result).toEqual({ data: 'done' });
    });

    it('should preserve method types', async () => {
      interface TestService {
        getString: (id: string) => Promise<string>;
        getNumber: (id: string) => Promise<number>;
        getArray: () => Promise<string[]>;
      }

      const rawService: TestService = {
        getString: (id) => Promise.resolve(`value-${id}`),
        getNumber: (id) => Promise.resolve(42),
        getArray: () => Promise.resolve(['a', 'b', 'c']),
      };

      const wrapped = wrapService('Test', rawService, {
        defaultValues: {
          getString: '',
          getNumber: 0,
          getArray: [],
        },
      });

      // These should all type-check correctly
      const str: string = await wrapped.getString('test');
      const num: number = await wrapped.getNumber('test');
      const arr: string[] = await wrapped.getArray();

      expect(str).toBe('value-test');
      expect(num).toBe(42);
      expect(arr).toEqual(['a', 'b', 'c']);
    });

    it('should work with empty options', async () => {
      const rawService = {
        doSomething: () => Promise.resolve('result'),
      };

      const wrapped = wrapService('Simple', rawService);

      const result = await wrapped.doSomething();
      expect(result).toBe('result');
    });

    it('should handle undefined as default value', async () => {
      const rawService = {
        maybeGet: () => Promise.reject(new Error('Not found')),
      };

      const wrapped = wrapService('Nullable', rawService, {
        defaultValues: {
          maybeGet: undefined,
        },
      });

      const result = await wrapped.maybeGet();
      expect(result).toBeUndefined();
    });
  });

  describe('error message formatting', () => {
    it('should format error context consistently', async () => {
      await createIpcMethod({
        call: () => Promise.reject(new Error('Test')),
        errorContext: 'Git status',
        defaultValue: null,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Git status error:',
        expect.any(Error)
      );
    });

    it('should include the original error object', async () => {
      const originalError = new Error('Original error message');

      await createIpcMethod({
        call: () => Promise.reject(originalError),
        errorContext: 'Operation',
        defaultValue: null,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Operation error:',
        originalError
      );
    });

    it('should handle non-Error objects as errors', async () => {
      await createIpcMethod({
        call: () => Promise.reject('string error'),
        errorContext: 'Operation',
        defaultValue: null,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Operation error:',
        'string error'
      );
    });
  });
});
