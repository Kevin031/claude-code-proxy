import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SessionList from '../../components/SessionList.vue'
import * as api from '../../api'

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api')
  return {
    ...actual,
    listSessions: vi.fn(),
    clearAllLogs: vi.fn(),
    openLogDir: vi.fn(),
    subscribeLogEvents: vi.fn(() => vi.fn()),
  }
})

describe('SessionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
    window.alert = vi.fn()
  })

  const mockSessions = [
    {
      sessionId: 'abc12345-xyz',
      requestCount: 3,
      timeSpan: {
        start: '2024-01-15T10:00:00.000Z',
        end: '2024-01-15T10:00:05.000Z',
        duration: 5000,
      },
      endpoints: ['/v1/messages'],
      detailUrl: '/logs/sessions/abc12345-xyz',
    },
    {
      sessionId: 'def67890-uvw',
      requestCount: 1,
      timeSpan: {
        start: '2024-01-15T09:00:00.000Z',
        end: '2024-01-15T09:00:01.000Z',
        duration: 1000,
      },
      endpoints: ['/v1/models'],
      detailUrl: '/logs/sessions/def67890-uvw',
    },
  ]

  it('should render session list after loading', async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      sessions: mockSessions,
      count: 2,
    })

    const wrapper = mount(SessionList, {
      props: { selectedSessionId: null },
    })

    await flushPromises()

    expect(wrapper.find('.session-count').text()).toBe('2 个会话')
    expect(wrapper.findAll('.session-item').length).toBe(2)
  })

  it('should show empty state when no sessions', async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      sessions: [],
      count: 0,
    })

    const wrapper = mount(SessionList, {
      props: { selectedSessionId: null },
    })

    await flushPromises()

    expect(wrapper.find('.empty').text()).toBe('暂无会话记录')
  })

  it('should show error state on load failure', async () => {
    vi.mocked(api.listSessions).mockRejectedValue(new Error('Network error'))

    const wrapper = mount(SessionList, {
      props: { selectedSessionId: null },
    })

    await flushPromises()

    expect(wrapper.find('.error').text()).toBe('Network error')
  })

  it('should emit select event when clicking a session', async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      sessions: mockSessions,
      count: 2,
    })

    const wrapper = mount(SessionList, {
      props: { selectedSessionId: null },
    })

    await flushPromises()

    await wrapper.findAll('.session-item')[0].trigger('click')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['abc12345-xyz'])
  })

  it('should highlight selected session', async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      sessions: mockSessions,
      count: 2,
    })

    const wrapper = mount(SessionList, {
      props: { selectedSessionId: 'abc12345-xyz' },
    })

    await flushPromises()

    const items = wrapper.findAll('.session-item')
    expect(items[0].classes()).toContain('active')
    expect(items[1].classes()).not.toContain('active')
  })

  it('should call clearAllLogs and refresh on clear button click', async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      sessions: mockSessions,
      count: 2,
    })
    vi.mocked(api.clearAllLogs).mockResolvedValue({
      success: true,
      message: '已清空',
      deletedCount: 5,
    })

    const wrapper = mount(SessionList, {
      props: { selectedSessionId: null },
    })

    await flushPromises()
    await wrapper.find('.clear-btn').trigger('click')
    await flushPromises()

    expect(api.clearAllLogs).toHaveBeenCalled()
  })

  it('should call openLogDir on open dir button click', async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      sessions: mockSessions,
      count: 2,
    })
    vi.mocked(api.openLogDir).mockResolvedValue({ success: true, path: '/logs' })

    const wrapper = mount(SessionList, {
      props: { selectedSessionId: null },
    })

    await flushPromises()
    await wrapper.find('.open-dir-btn').trigger('click')
    await flushPromises()

    expect(api.openLogDir).toHaveBeenCalled()
  })

  it('should display session metadata correctly', async () => {
    vi.mocked(api.listSessions).mockResolvedValue({
      sessions: [mockSessions[0]],
      count: 1,
    })

    const wrapper = mount(SessionList, {
      props: { selectedSessionId: null },
    })

    await flushPromises()

    const item = wrapper.find('.session-item')
    expect(item.find('.session-id').text()).toBe('abc12345')
    expect(item.find('.request-count').text()).toBe('3 请求')
    expect(item.find('.endpoint-tag').text()).toBe('/v1/messages')
  })
})
