// SSE parser suite (pure vitest — the parser is pure functions over string
// chunks; the streaming consumer is exercised by jest against the mock network
// and by the live proof against a real server). The cases pin the WHATWG
// event-stream grammar: field parsing, dispatch-on-blank-line, CR/CRLF/LF and
// their chunk-boundary splits, BOM, comments, id/retry semantics.
import { describe, expect, it, vi } from 'vitest'

// sse.ts's closure reaches expo-constants through the api-client one-door;
// mock it at the module boundary (the kv.test.ts convention) so the PURE
// parser under test loads in plain node. The consumer path is not exercised
// here — jest drives it against the mock network, the live proof against a
// real server.
vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }))

import { endSse, feedSse, SSE_INITIAL_STATE, type SseEvent, type SseParserState } from './sse'

/** Feed chunks in sequence; collect every dispatched event. */
function collect(chunks: readonly string[]): {
  readonly events: readonly SseEvent[]
  readonly state: SseParserState
} {
  let state = SSE_INITIAL_STATE
  const events: SseEvent[] = []
  for (const chunk of chunks) {
    const fed = feedSse(state, chunk)
    state = fed.state
    events.push(...fed.events)
  }
  const ended = endSse(state)
  events.push(...ended.events)
  return { events, state: ended.state }
}

describe('feedSse — dispatch model', () => {
  it('dispatches a single data event on the blank line, defaulting the type to message', () => {
    const { events } = collect(['data: hello\n\n'])
    expect(events).toEqual([{ event: 'message', data: 'hello', id: null }])
  })

  it('does NOT dispatch until the blank line arrives', () => {
    let state = SSE_INITIAL_STATE
    const first = feedSse(state, 'data: pending\n')
    expect(first.events).toEqual([])
    state = first.state
    const second = feedSse(state, '\n')
    expect(second.events).toEqual([{ event: 'message', data: 'pending', id: null }])
  })

  it('joins multiple data lines with LF (the multi-line payload form)', () => {
    const { events } = collect(['data: one\ndata: two\n\n'])
    expect(events).toEqual([{ event: 'message', data: 'one\ntwo', id: null }])
  })

  it('a blank line with no data dispatches NOTHING and resets a pending event type', () => {
    const { events } = collect(['event: tick\n\n', 'data: after\n\n'])
    // The tick type must not leak into the next event.
    expect(events).toEqual([{ event: 'message', data: 'after', id: null }])
  })

  it('carries event type and id (the server demo shape: event/data/id per tick)', () => {
    const { events } = collect(['event: tick\ndata: 1\nid: 1\n\n'])
    expect(events).toEqual([{ event: 'tick', data: '1', id: '1' }])
  })

  it('last-event-id is STICKY across events until overwritten', () => {
    const { events } = collect(['id: 7\ndata: a\n\n', 'data: b\n\n', 'id: 8\ndata: c\n\n'])
    expect(events.map((event) => event.id)).toEqual(['7', '7', '8'])
  })

  it('an empty data field still dispatches (empty string payload)', () => {
    const { events } = collect(['data:\n\n'])
    expect(events).toEqual([{ event: 'message', data: '', id: null }])
  })
})

describe('feedSse — field grammar', () => {
  it('strips exactly ONE leading space from a value ("data:  x" keeps the second space)', () => {
    const { events } = collect(['data:  two spaces\n\n'])
    expect(events[0]?.data).toBe(' two spaces')
  })

  it('a colon-less line is a field with an empty value', () => {
    // "data" alone appends '' — two of them dispatch as '\n'-joined empties.
    const { events } = collect(['data\ndata\n\n'])
    expect(events).toEqual([{ event: 'message', data: '\n', id: null }])
  })

  it('keeps every colon after the first inside the value', () => {
    const { events } = collect(['data: a:b:c\n\n'])
    expect(events[0]?.data).toBe('a:b:c')
  })

  it('ignores comment lines (the keep-alive ping form)', () => {
    const { events } = collect([': ping\ndata: real\n: another\n\n'])
    expect(events).toEqual([{ event: 'message', data: 'real', id: null }])
  })

  it('ignores unknown fields', () => {
    const { events } = collect(['unknown: x\ndata: kept\n\n'])
    expect(events).toEqual([{ event: 'message', data: 'kept', id: null }])
  })

  it('ignores an id containing NUL (must not poison the sticky id)', () => {
    const { events } = collect(['id: ok\ndata: a\n\n', 'id: bad\0id\ndata: b\n\n'])
    expect(events.map((event) => event.id)).toEqual(['ok', 'ok'])
  })

  it('accepts a digits-only retry and ignores everything else', () => {
    const { state } = collect(['retry: 2500\n\n'])
    expect(state.retryMs).toBe(2500)
    const ignored = collect(['retry: 2500\n', 'retry: soon\n\n'])
    expect(ignored.state.retryMs).toBe(2500)
  })
})

describe('feedSse — line endings and chunk boundaries', () => {
  const CANONICAL: SseEvent = { event: 'message', data: 'x', id: null }

  it.each([
    ['LF', 'data: x\n\n'],
    ['CRLF', 'data: x\r\n\r\n'],
    ['CR', 'data: x\r\r'],
    ['mixed', 'data: x\r\n\n'],
  ])('%s terminators parse identically', (_name, stream) => {
    expect(collect([stream]).events).toEqual([CANONICAL])
  })

  it('handles a chunk boundary mid-line', () => {
    expect(collect(['data: he', 'llo\n\n']).events).toEqual([
      { event: 'message', data: 'hello', id: null },
    ])
  })

  it('handles a chunk boundary mid-field-name', () => {
    expect(collect(['da', 'ta: split\n\n']).events).toEqual([
      { event: 'message', data: 'split', id: null },
    ])
  })

  it('handles a CRLF split ACROSS chunks as one terminator, not two', () => {
    // 'data: x\r' + '\n\r\n' — the deferred CR must pair with the next chunk's
    // LF; double-counting would dispatch an empty extra event.
    expect(collect(['data: x\r', '\n\r\n']).events).toEqual([CANONICAL])
  })

  it('a lone CR at a chunk end still terminates its line once more input arrives', () => {
    expect(collect(['data: x\r', 'data: y\n\n']).events).toEqual([
      { event: 'message', data: 'x\ny', id: null },
    ])
  })

  it('one character per chunk parses identically to one big chunk', () => {
    const stream = 'event: tick\r\ndata: 1\r\nid: 1\r\n\r\nevent: tick\r\ndata: 2\r\nid: 2\r\n\r\n'
    const whole = collect([stream]).events
    const trickled = collect([...stream]).events
    expect(trickled).toEqual(whole)
    expect(whole).toEqual([
      { event: 'tick', data: '1', id: '1' },
      { event: 'tick', data: '2', id: '2' },
    ])
  })
})

describe('feedSse — BOM handling', () => {
  it('strips a leading BOM from the stream', () => {
    expect(collect(['\uFEFFdata: x\n\n']).events).toEqual([
      { event: 'message', data: 'x', id: null },
    ])
  })

  it('strips the BOM even when it arrives as its own chunk', () => {
    expect(collect(['\uFEFF', 'data: x\n\n']).events).toEqual([
      { event: 'message', data: 'x', id: null },
    ])
  })

  it('does NOT strip a BOM later in the stream (only the first character)', () => {
    const { events } = collect(['data: a\n\n', '\uFEFFdata: b\n\n'])
    // The second BOM lands inside a field NAME, making it unknown — ignored.
    expect(events).toEqual([{ event: 'message', data: 'a', id: null }])
  })
})

describe('endSse — end of stream', () => {
  it('discards an incomplete trailing event (no fabricated half-events)', () => {
    const { events } = collect(['data: complete\n\ndata: cut off mid'])
    expect(events).toEqual([{ event: 'message', data: 'complete', id: null }])
  })

  it('flushes a deferred CR-terminated final line', () => {
    // The stream ends '…\r\r' with the last CR deferred — close must count it
    // as the dispatching blank line.
    let state = SSE_INITIAL_STATE
    const fed = feedSse(state, 'data: x\r\r')
    state = fed.state
    expect(fed.events).toEqual([])
    const ended = endSse(state)
    expect(ended.events).toEqual([{ event: 'message', data: 'x', id: null }])
  })

  it('is a no-op on a cleanly terminated stream', () => {
    const fed = feedSse(SSE_INITIAL_STATE, 'data: x\n\n')
    expect(endSse(fed.state).events).toEqual([])
  })
})
