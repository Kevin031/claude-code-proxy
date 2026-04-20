import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listSessions,
  getSessionDetail,
  getSessionRequests,
  getRequestDetail,
  clearAllLogs,
  formatDate,
  formatDuration,
  formatBytes,
} from '../api'

describe('API layer', () => {
  beforeEach(() => {
    // 模拟 fetch
globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listSessions', () => {
    it('should return parsed session list', async () => {
      const mockData = {
        sessions: [
          {
            sessionId: 'sess-1',
            requestCount: 2,
            timeSpan: { start: '2024-01-15T10:00:00.000Z', end: '2024-01-15T10:00:05.000Z', duration: 5000 },
            endpoints: ['/v1/messages'],
            detailUrl: '/logs/sessions/sess-1',
          },
        ],
        count: 1,
      }
      ;(globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await listSessions()
      expect(result).toEqual(mockData)
      expect(globalThis.fetch).toHaveBeenCalledWith('/logs/sessions')
    })

    it('should throw on HTTP error', async () => {
      ;(globalThis.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: { message: 'Server error' } }),
      })

      await expect(listSessions()).rejects.toThrow('Server error')
    })
  })

  describe('getSessionDetail', () => {
    it('should return session detail', async () => {
      const mockData = {
        sessionId: 'sess-1',
        requestCount: 1,
        timeSpan: { start: '2024-01-15T10:00:00.000Z', end: '2024-01-15T10:00:01.000Z', duration: 1000 },
        endpoints: ['/v1/messages'],
        detailUrl: '/logs/sessions/sess-1',
        requests: [],
      }
      ;(globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await getSessionDetail('sess-1')
      expect(result.sessionId).toBe('sess-1')
      expect(globalThis.fetch).toHaveBeenCalledWith('/logs/sessions/sess-1')
    })
  })

  describe('getSessionRequests', () => {
    it('should return session requests', async () => {
      const mockData = {
        sessionId: 'sess-1',
        requests: [],
        count: 0,
      }
      ;(globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await getSessionRequests('sess-1')
      expect(result.sessionId).toBe('sess-1')
    })
  })

  describe('getRequestDetail', () => {
    it('should return request detail', async () => {
      const mockData = {
        sessionId: 'sess-1',
        requestId: 'req-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        requestBody: { model: 'glm-4' },
        responseBody: { id: 'msg-1' },
      }
      ;(globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await getRequestDetail('sess-1', 'req-1')
      expect(result.requestId).toBe('req-1')
    })
  })

  describe('clearAllLogs', () => {
    it('should clear all logs', async () => {
      const mockData = { success: true, message: '已清空日志', deletedCount: 5 }
      ;(globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const result = await clearAllLogs()
      expect(result.deletedCount).toBe(5)
      expect(globalThis.fetch).toHaveBeenCalledWith('/logs', { method: 'DELETE' })
    })
  })
})

describe('format utilities', () => {
  describe('formatDate', () => {
    it('should format ISO date string', () => {
      const result = formatDate('2024-01-15T10:30:00.000Z')
      expect(result).toContain('1')
      expect(result).toContain('15')
    })
  })

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms')
    })

    it('should format seconds for >= 1000ms', () => {
      expect(formatDuration(1500)).toBe('1.5s')
      expect(formatDuration(3000)).toBe('3.0s')
    })
  })

  describe('formatBytes', () => {
    it('should handle 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B')
    })

    it('should format bytes', () => {
      expect(formatBytes(512)).toBe('512 B')
    })

    it('should format kilobytes', () => {
      expect(formatBytes(1536)).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      expect(formatBytes(2 * 1024 * 1024)).toBe('2 MB')
    })

    it('should format gigabytes', () => {
      expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3 GB')
    })
  })
})
