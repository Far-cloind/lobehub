import { describe, expect, it } from 'vitest';

import { processCommands } from './index';

const baseParams = {
  message: 'hello',
  context: {
    agentId: 'agent-1',
    topicId: 'topic-1',
  },
} as any;

describe('processCommands', () => {
  it('should return empty overrides when no editorData', () => {
    expect(processCommands(baseParams)).toEqual({});
  });

  it('should return empty overrides when no command tags', () => {
    const params = {
      ...baseParams,
      editorData: {
        root: {
          children: [
            {
              children: [
                {
                  actionCategory: 'skill',
                  actionLabel: 'Translate',
                  actionType: 'translate',
                  type: 'action-tag',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'root',
        },
      },
    };
    expect(processCommands(params)).toEqual({});
  });

  it('should return forceNewTopic for newTopic command', () => {
    const params = {
      ...baseParams,
      editorData: {
        root: {
          children: [
            {
              children: [
                {
                  actionCategory: 'command',
                  actionLabel: 'Send in new topic',
                  actionType: 'newTopic',
                  type: 'action-tag',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'root',
        },
      },
    };

    const result = processCommands(params);
    expect(result.forceNewTopic).toBe(true);
  });

  it('should return triggerCompression for compact command', () => {
    const params = {
      ...baseParams,
      editorData: {
        root: {
          children: [
            {
              children: [
                {
                  actionCategory: 'command',
                  actionLabel: 'Compact context',
                  actionType: 'compact',
                  type: 'action-tag',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'root',
        },
      },
    };

    const result = processCommands(params);
    expect(result.triggerCompression).toBe(true);
  });

  it('should return triggerCodexStatus for a literal status command', () => {
    expect(processCommands({ ...baseParams, message: '/status' })).toEqual({
      triggerCodexStatus: true,
    });
  });

  it('should parse Codex model and skill commands', () => {
    expect(processCommands({ ...baseParams, message: '/model' })).toEqual({
      showCodexModel: true,
    });
    expect(processCommands({ ...baseParams, message: '/model gpt-5.4' })).toEqual({
      switchCodexModel: 'gpt-5.4',
    });
    expect(processCommands({ ...baseParams, message: '/skills' })).toEqual({
      listCodexSkills: true,
    });
    expect(processCommands({ ...baseParams, message: '/skill imagegen create a logo' })).toEqual({
      invokeCodexSkill: { name: 'imagegen', task: 'create a logo' },
    });
    expect(processCommands({ ...baseParams, message: '/skill' })).toEqual({
      showCodexSkillHelp: true,
    });
  });

  it.each([
    ['model', { showCodexModel: true }],
    ['skills', { listCodexSkills: true }],
    ['skill', { showCodexSkillHelp: true }],
  ])('should process the %s command tag', (type, expected) => {
    const result = processCommands({
      ...baseParams,
      editorData: {
        root: {
          children: [
            {
              children: [
                {
                  actionCategory: 'command',
                  actionLabel: type,
                  actionType: type,
                  type: 'action-tag',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'root',
        },
      },
    });

    expect(result).toEqual(expected);
  });

  it('should return triggerCodexStatus for a status command tag', () => {
    const result = processCommands({
      ...baseParams,
      editorData: {
        root: {
          children: [
            {
              children: [
                {
                  actionCategory: 'command',
                  actionLabel: 'Codex usage status',
                  actionType: 'status',
                  type: 'action-tag',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'root',
        },
      },
    });

    expect(result.triggerCodexStatus).toBe(true);
  });

  it('should merge overrides from multiple commands', () => {
    const params = {
      ...baseParams,
      editorData: {
        root: {
          children: [
            {
              children: [
                {
                  actionCategory: 'command',
                  actionLabel: 'Send in new topic',
                  actionType: 'newTopic',
                  type: 'action-tag',
                },
                {
                  actionCategory: 'command',
                  actionLabel: 'Compact context',
                  actionType: 'compact',
                  type: 'action-tag',
                },
              ],
              type: 'paragraph',
            },
          ],
          type: 'root',
        },
      },
    };

    const result = processCommands(params);
    expect(result.forceNewTopic).toBe(true);
    expect(result.triggerCompression).toBe(true);
  });
});
