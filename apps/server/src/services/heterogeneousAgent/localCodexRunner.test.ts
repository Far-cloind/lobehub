import { EventEmitter } from 'node:events';

import type { AgentStreamEvent, SpawnAgentHandle } from '@lobechat/heterogeneous-agents/spawn';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelLocalCodexRun, spawnLocalCodex } from './localCodexRunner';

const mocks = vi.hoisted(() => ({
  spawnAgent: vi.fn(),
}));

vi.mock('@lobechat/heterogeneous-agents/spawn', () => ({ spawnAgent: mocks.spawnAgent }));

vi.mock('@/envs/app', () => ({
  appEnv: {
    LOCAL_CODEX_COMMAND: '/opt/codex/bin/codex',
    LOCAL_CODEX_WORKING_DIR: '/srv/workspace',
  },
}));

const event: AgentStreamEvent = {
  data: { content: 'hello' },
  operationId: 'op-1',
  stepIndex: 0,
  timestamp: 1,
  type: 'stream_chunk',
};

const createHandle = (events: AsyncIterable<AgentStreamEvent>): SpawnAgentHandle =>
  ({
    events,
    exit: Promise.resolve({ code: 0, signal: null }),
    kill: vi.fn(),
    pid: 123,
    sessionId: 'session-1',
    stderr: new EventEmitter(),
  }) as unknown as SpawnAgentHandle;

const createService = () => ({
  heteroFinish: vi.fn(),
  heteroIngest: vi.fn(),
});

describe('localCodexRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses server-controlled command and cwd and ingests Codex events', async () => {
    const handle = createHandle(
      (async function* () {
        yield event;
      })(),
    );
    const service = createService();
    mocks.spawnAgent.mockResolvedValue(handle);

    await spawnLocalCodex({
      assistantMessageId: 'assistant-1',
      heterogeneousAgentService: service as any,
      operationId: 'op-1',
      prompt: 'do the work',
      systemContext: 'server context',
      topicId: 'topic-1',
      userId: 'user-1',
    });

    expect(mocks.spawnAgent).toHaveBeenCalledWith({
      agentType: 'codex',
      command: '/opt/codex/bin/codex',
      cwd: '/srv/workspace',
      extraArgs: undefined,
      includePartialMessages: true,
      operationId: 'op-1',
      prompt: [
        { text: 'server context', type: 'text' },
        { text: 'do the work', type: 'text' },
      ],
      resumeSessionId: undefined,
    });
    expect(service.heteroIngest).toHaveBeenCalledWith({
      agentType: 'codex',
      assistantMessageId: 'assistant-1',
      events: [event],
      operationId: 'op-1',
      topicId: 'topic-1',
    });
    expect(service.heteroFinish).toHaveBeenCalledWith({
      agentType: 'codex',
      error: undefined,
      operationId: 'op-1',
      result: 'success',
      sessionId: 'session-1',
      topicId: 'topic-1',
    });
  });

  it('kills and finalizes a cancelled local run', async () => {
    let releaseEvents!: () => void;
    const eventsReady = new Promise<void>((resolve) => {
      releaseEvents = resolve;
    });
    const handle = createHandle(
      (async function* () {
        await eventsReady;
        yield event;
      })(),
    );
    const service = createService();
    mocks.spawnAgent.mockResolvedValue(handle);

    const run = spawnLocalCodex({
      assistantMessageId: 'assistant-1',
      heterogeneousAgentService: service as any,
      operationId: 'op-cancel',
      prompt: 'do the work',
      topicId: 'topic-1',
      userId: 'user-1',
    });

    await vi.waitFor(() => expect(mocks.spawnAgent).toHaveBeenCalled());
    expect(cancelLocalCodexRun('op-cancel', 'another-user')).toBe(false);
    expect(cancelLocalCodexRun('op-cancel', 'user-1')).toBe(true);
    releaseEvents();
    await run;

    expect(handle.kill).toHaveBeenCalledWith('SIGINT');
    expect(service.heteroIngest).not.toHaveBeenCalled();
    expect(service.heteroFinish).toHaveBeenNthCalledWith(1, {
      agentType: 'codex',
      error: undefined,
      operationId: 'op-cancel',
      result: 'cancelled',
      sessionId: 'session-1',
      topicId: 'topic-1',
    });
    expect(service.heteroFinish).toHaveBeenNthCalledWith(2, {
      agentType: 'codex',
      operationId: 'op-cancel',
      result: 'success',
      sessionId: 'session-1',
      topicId: 'topic-1',
    });
  });
});
