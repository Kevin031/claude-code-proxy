import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RequestPanel from '../../components/RequestPanel.vue'
import * as api from '../../api'

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api')
  return {
    ...actual,
    getSessionRequests: vi.fn(),
  }
})

describe('RequestPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockRequests = [
    {
      requestId: 'req-1',
      timestamp: '2024-01-15T10:00:00.000Z',
      request: {
        method: 'POST',
        path: '/v1/messages',
        headers: { 'content-type': 'application/json' },
        query: {},
        body: { model: 'glm-4', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] },
      },
      response: {
        timestamp: '2024-01-15T10:00:01.000Z',
        statusCode: 200,
        headers: {},
        body: { id: 'msg-1', content: 'hi' },
        responseTime: 500,
      },
      error: null,
    },
    {
      requestId: 'req-2',
      timestamp: '2024-01-15T10:00:05.000Z',
      request: {
        method: 'GET',
        path: '/v1/models',
        headers: {},
        query: {},
        body: null,
      },
      response: {
        timestamp: '2024-01-15T10:00:06.000Z',
        statusCode: 200,
        headers: {},
        body: { data: [] },
        responseTime: 200,
      },
      error: null,
    },
  ]

  it('should render request list after loading', async () => {
    vi.mocked(api.getSessionRequests).mockResolvedValue({
      sessionId: 'sess-1',
      requests: mockRequests,
      count: 2,
    })

    const wrapper = mount(RequestPanel, {
      props: { sessionId: 'sess-1' },
    })

    await flushPromises()

    const items = wrapper.findAll('.request-item')
    expect(items.length).toBe(2)
    expect(items[0].find('.method-badge').text()).toBe('POST')
    expect(items[0].find('.req-title-text').text()).toBe('hello')
  })

  it('should select first request by default', async () => {
    vi.mocked(api.getSessionRequests).mockResolvedValue({
      sessionId: 'sess-1',
      requests: mockRequests,
      count: 2,
    })

    const wrapper = mount(RequestPanel, {
      props: { sessionId: 'sess-1' },
    })

    await flushPromises()

    expect(wrapper.find('.request-item.active').exists()).toBe(true)
  })

  it('should show loading state', async () => {
    vi.mocked(api.getSessionRequests).mockImplementation(
      () => new Promise(() => {}) // never resolves
    )

    const wrapper = mount(RequestPanel, {
      props: { sessionId: 'sess-1' },
    })

    await flushPromises()

    expect(wrapper.find('.panel-loading').exists()).toBe(true)
  })

  it('should show error state on failure', async () => {
    vi.mocked(api.getSessionRequests).mockRejectedValue(new Error('Load failed'))

    const wrapper = mount(RequestPanel, {
      props: { sessionId: 'sess-1' },
    })

    await flushPromises()

    expect(wrapper.find('.panel-error').text()).toBe('Load failed')
  })

  it('should switch selected request on click', async () => {
    vi.mocked(api.getSessionRequests).mockResolvedValue({
      sessionId: 'sess-1',
      requests: mockRequests,
      count: 2,
    })

    const wrapper = mount(RequestPanel, {
      props: { sessionId: 'sess-1' },
    })

    await flushPromises()

    const items = wrapper.findAll('.request-item')
    await items[1].trigger('click')

    expect(items[1].classes()).toContain('active')
  })

  it('should apply correct method class', async () => {
    vi.mocked(api.getSessionRequests).mockResolvedValue({
      sessionId: 'sess-1',
      requests: mockRequests,
      count: 2,
    })

    const wrapper = mount(RequestPanel, {
      props: { sessionId: 'sess-1' },
    })

    await flushPromises()

    const methods = wrapper.findAll('.method-badge')
    expect(methods[0].classes()).toContain('method-POST')
    expect(methods[1].classes()).toContain('method-GET')
  })

  it('should apply correct status class', async () => {
    vi.mocked(api.getSessionRequests).mockResolvedValue({
      sessionId: 'sess-1',
      requests: [
        {
          ...mockRequests[0],
          response: { ...mockRequests[0].response, statusCode: 200 },
        },
        {
          ...mockRequests[1],
          response: { ...mockRequests[1].response, statusCode: 404 },
        },
      ],
      count: 2,
    })

    const wrapper = mount(RequestPanel, {
      props: { sessionId: 'sess-1' },
    })

    await flushPromises()

    const statuses = wrapper.findAll('.status-badge')
    expect(statuses[0].classes()).toContain('status-2xx')
    expect(statuses[1].classes()).toContain('status-4xx')
  })

  it('should switch tabs between request and response', async () => {
    vi.mocked(api.getSessionRequests).mockResolvedValue({
      sessionId: 'sess-1',
      requests: mockRequests,
      count: 1,
    })

    const wrapper = mount(RequestPanel, {
      props: { sessionId: 'sess-1' },
    })

    await flushPromises()

    // Default tab is request
    const tabs = wrapper.findAll('.tab-btn')
    expect(tabs[0].classes()).toContain('active')

    // Switch to response tab
    await tabs[1].trigger('click')
    expect(tabs[1].classes()).toContain('active')
  })
})
