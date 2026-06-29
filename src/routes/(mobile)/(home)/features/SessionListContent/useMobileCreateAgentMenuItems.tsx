import { DEFAULT_AVATAR } from '@lobechat/const';
import { HETEROGENEOUS_AGENT_CLIENT_CONFIGS } from '@lobechat/heterogeneous-agents/client';
import { Icon, type MenuProps } from '@lobehub/ui';
import { App } from 'antd';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useCreateHeteroAgent } from '@/hooks/useCreateHeteroAgent';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useSessionStore } from '@/store/session';

interface UseMobileCreateAgentMenuItemsOptions {
  groupId?: string;
  isPinned?: boolean;
  onSuccess?: () => void;
  showFeedback?: boolean;
}

type ItemOfType<T> = T extends (infer Item)[] ? Item : never;
type MenuItemType = ItemOfType<MenuProps['items']>;

export const useMobileCreateAgentMenuItems = ({
  groupId,
  isPinned,
  onSuccess,
  showFeedback = false,
}: UseMobileCreateAgentMenuItemsOptions = {}) => {
  const { t } = useTranslation('chat');
  const { message } = App.useApp();
  const navigate = useWorkspaceAwareNavigate();
  const createSession = useSessionStore((s) => s.createSession);
  const createHeterogeneousAgent = useCreateHeteroAgent();
  const enableLocalCodexBridge = useServerConfigStore(serverConfigSelectors.enableLocalCodexBridge);
  const [creatingKey, setCreatingKey] = useState<string>();

  const codexDefinition = useMemo(
    () => HETEROGENEOUS_AGENT_CLIENT_CONFIGS.find((definition) => definition.type === 'codex'),
    [],
  );

  const createDefaultAgent = useCallback(async () => {
    const feedbackKey = 'mobileCreateAgent';
    setCreatingKey('newAgent');
    if (showFeedback) {
      message.loading({ content: t('sessionGroup.creatingAgent'), duration: 0, key: feedbackKey });
    }

    try {
      const id = await createSession({
        group: groupId,
        meta: { avatar: DEFAULT_AVATAR, title: t('defaultAgent') },
        pinned: isPinned,
      });
      if (showFeedback) {
        message.success({ content: t('sessionGroup.createAgentSuccess'), key: feedbackKey });
      }
      onSuccess?.();
      navigate(`/agent/${id}`);
    } catch {
      if (showFeedback) {
        message.destroy(feedbackKey);
      }
    } finally {
      setCreatingKey(undefined);
    }
  }, [createSession, groupId, isPinned, message, navigate, onSuccess, showFeedback, t]);

  const createCodexAgent = useCallback(async () => {
    if (!codexDefinition) return;

    const feedbackKey = 'mobileCreateCodexAgent';
    setCreatingKey(codexDefinition.menuKey);
    if (showFeedback) {
      message.loading({ content: t('sessionGroup.creatingAgent'), duration: 0, key: feedbackKey });
    }

    try {
      await createHeterogeneousAgent(codexDefinition, { groupId, onSuccess });
      if (showFeedback) {
        message.success({ content: t('sessionGroup.createAgentSuccess'), key: feedbackKey });
      }
    } catch {
      if (showFeedback) {
        message.destroy(feedbackKey);
      }
    } finally {
      setCreatingKey(undefined);
    }
  }, [codexDefinition, createHeterogeneousAgent, groupId, message, onSuccess, showFeedback, t]);

  const items = useMemo<MenuProps['items']>(() => {
    const baseItems: MenuItemType[] = [
      {
        icon: <Icon icon={Plus} />,
        key: 'newAgent',
        label: t('newAgent'),
        onClick: async ({ domEvent }) => {
          domEvent.stopPropagation();
          await createDefaultAgent();
        },
      },
    ];

    if (!enableLocalCodexBridge || !codexDefinition) return baseItems;

    const CodexIcon = codexDefinition.icon;

    return [
      ...baseItems,
      {
        icon: <CodexIcon size={'1em'} />,
        key: codexDefinition.menuKey,
        label: t(codexDefinition.menuLabelKey),
        onClick: async ({ domEvent }) => {
          domEvent.stopPropagation();
          await createCodexAgent();
        },
      },
    ];
  }, [codexDefinition, createCodexAgent, createDefaultAgent, enableLocalCodexBridge, t]);

  return {
    createCodexAgent,
    createDefaultAgent,
    enableLocalCodexBridge,
    isCreating: !!creatingKey,
    items,
  };
};
