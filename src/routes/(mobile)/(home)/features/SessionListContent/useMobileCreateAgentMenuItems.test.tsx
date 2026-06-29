/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMobileCreateAgentMenuItems } from './useMobileCreateAgentMenuItems';

const createSessionMock = vi.hoisted(() => vi.fn().mockResolvedValue('new-agent-id'));
const createHeteroAgentMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const messageLoadingMock = vi.hoisted(() => vi.fn());
const messageSuccessMock = vi.hoisted(() => vi.fn());
const messageDestroyMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const serverConfigMocks = vi.hoisted(() => ({
  enableLocalCodexBridge: false,
}));

vi.mock('@lobechat/heterogeneous-agents/client', () => ({
  HETEROGENEOUS_AGENT_CLIENT_CONFIGS: [
    {
      avatar: 'avatar',
      command: 'codex',
      icon: () => null,
      iconId: 'Codex',
      menuKey: 'newCodexAgent',
      menuLabelKey: 'newCodexAgent',
      title: 'Codex',
      type: 'codex',
    },
  ],
}));

vi.mock('@lobehub/ui', () => ({
  Icon: () => null,
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: {
        destroy: messageDestroyMock,
        loading: messageLoadingMock,
        success: messageSuccessMock,
      },
    }),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/hooks/useCreateHeteroAgent', () => ({
  useCreateHeteroAgent: () => createHeteroAgentMock,
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => navigateMock,
}));

vi.mock('@/store/serverConfig', () => ({
  serverConfigSelectors: {
    enableLocalCodexBridge: (s: { serverConfig: { enableLocalCodexBridge: boolean } }) =>
      s.serverConfig.enableLocalCodexBridge,
  },
  useServerConfigStore: (
    selector: (state: { serverConfig: { enableLocalCodexBridge: boolean } }) => unknown,
  ) =>
    selector({
      serverConfig: {
        enableLocalCodexBridge: serverConfigMocks.enableLocalCodexBridge,
      },
    }),
}));

vi.mock('@/store/session', () => ({
  useSessionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      createSession: createSessionMock,
    }),
}));

type MenuActionItem = {
  key: string;
  onClick?: (info: { domEvent: { stopPropagation: () => void } }) => Promise<void>;
};

describe('useMobileCreateAgentMenuItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverConfigMocks.enableLocalCodexBridge = false;
  });

  it('creates a normal agent session and navigates when the bridge is disabled', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useMobileCreateAgentMenuItems({ groupId: 'group-1', isPinned: true, onSuccess }),
    );

    expect(result.current.items).toHaveLength(1);

    const item = result.current.items?.[0] as MenuActionItem;

    await act(async () => {
      await item.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    expect(createSessionMock).toHaveBeenCalledWith({
      group: 'group-1',
      meta: { avatar: '/avatars/agent-default.png', title: 'defaultAgent' },
      pinned: true,
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/agent/new-agent-id');
    expect(createHeteroAgentMock).not.toHaveBeenCalled();
  });

  it('exposes and runs the Codex action when the bridge is enabled', async () => {
    serverConfigMocks.enableLocalCodexBridge = true;
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useMobileCreateAgentMenuItems({ groupId: 'group-2', onSuccess }),
    );

    expect(result.current.items).toHaveLength(2);

    const item = result.current.items?.[1] as MenuActionItem;

    await act(async () => {
      await item.onClick?.({ domEvent: { stopPropagation: vi.fn() } });
    });

    expect(createHeteroAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'codex',
        menuKey: 'newCodexAgent',
        type: 'codex',
      }),
      { groupId: 'group-2', onSuccess },
    );
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
