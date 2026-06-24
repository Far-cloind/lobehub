import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getLocalCodexStatus,
  listLocalCodexModels,
  listLocalCodexSkills,
} from './localCodexStatus';

const mocks = vi.hoisted(() => ({
  codexHome: '',
}));

vi.mock('@lobechat/heterogeneous-agents/spawn', () => ({
  getCodexHome: () => mocks.codexHome,
}));

describe('getLocalCodexStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the latest rate-limit record from Codex session files', async () => {
    mocks.codexHome = path.join(process.env.TMPDIR || '/tmp', `lobehub-codex-status-${Date.now()}`);
    const sessionDir = path.join(mocks.codexHome, 'sessions', '2026', '06', '24');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      path.join(sessionDir, 'rollout-test.jsonl'),
      [
        JSON.stringify({
          payload: { model: 'gpt-5.5' },
          type: 'turn_context',
        }),
        JSON.stringify({
          payload: {
            info: {
              model_context_window: 1000,
              total_token_usage: { total_tokens: 100 },
            },
            rate_limits: {
              plan_type: 'plus',
              primary: { resets_at: 100, used_percent: 10, window_minutes: 300 },
              secondary: { resets_at: 200, used_percent: 20, window_minutes: 10_080 },
            },
          },
          timestamp: '2026-06-24T10:00:00.000Z',
        }),
        JSON.stringify({
          payload: {
            info: {
              model_context_window: 1000,
              total_token_usage: { total_tokens: 250 },
            },
            rate_limits: {
              plan_type: 'plus',
              primary: { resets_at: 300, used_percent: 51, window_minutes: 300 },
              secondary: { resets_at: 400, used_percent: 21, window_minutes: 10_080 },
            },
          },
          timestamp: '2026-06-24T11:00:00.000Z',
        }),
      ].join('\n'),
    );

    await expect(getLocalCodexStatus()).resolves.toEqual({
      contextRemaining: 750,
      contextWindow: 1000,
      model: 'gpt-5.5',
      planType: 'plus',
      primary: { resetsAt: 300, usedPercent: 51, windowMinutes: 300 },
      secondary: { resetsAt: 400, usedPercent: 21, windowMinutes: 10_080 },
      updatedAt: '2026-06-24T11:00:00.000Z',
      usedTokens: 250,
    });
  });

  it('reads a specific Codex session by native session id', async () => {
    mocks.codexHome = path.join(process.env.TMPDIR || '/tmp', `lobehub-codex-status-${Date.now()}`);
    const sessionDir = path.join(mocks.codexHome, 'sessions', '2026', '06', '24');
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      path.join(sessionDir, 'rollout-2026-test-session-123.jsonl'),
      JSON.stringify({
        payload: {
          info: { model_context_window: 1000, total_token_usage: { total_tokens: 400 } },
          rate_limits: {
            primary: { resets_at: 100, used_percent: 10, window_minutes: 300 },
          },
        },
        timestamp: '2026-06-24T11:00:00.000Z',
      }),
    );

    await expect(getLocalCodexStatus('session-123')).resolves.toMatchObject({
      contextRemaining: 600,
      contextWindow: 1000,
    });
    await expect(getLocalCodexStatus('missing-session')).resolves.toBeUndefined();
  });

  it('lists visible cached models and Codex system skills', async () => {
    mocks.codexHome = path.join(process.env.TMPDIR || '/tmp', `lobehub-codex-status-${Date.now()}`);
    await mkdir(path.join(mocks.codexHome, 'skills', '.system', 'imagegen'), { recursive: true });
    await writeFile(
      path.join(mocks.codexHome, 'models_cache.json'),
      JSON.stringify({
        models: [
          {
            context_window: 372000,
            description: 'Frontier model',
            display_name: 'GPT-5.5',
            slug: 'gpt-5.5',
            visibility: 'list',
          },
          { slug: 'hidden', visibility: 'hide' },
        ],
      }),
    );
    await writeFile(
      path.join(mocks.codexHome, 'skills', '.system', 'imagegen', 'SKILL.md'),
      '---\nname: "imagegen"\ndescription: "Generate images"\n---\n',
    );

    await expect(listLocalCodexModels()).resolves.toEqual([
      {
        contextWindow: 372000,
        description: 'Frontier model',
        displayName: 'GPT-5.5',
        slug: 'gpt-5.5',
      },
    ]);
    await expect(listLocalCodexSkills()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'imagegen', source: 'codex-system' }),
      ]),
    );
  });
});
