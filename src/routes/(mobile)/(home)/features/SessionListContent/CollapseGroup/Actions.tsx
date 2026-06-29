import { ActionIcon, Icon, type MenuProps } from '@lobehub/ui';
import { confirmModal } from '@lobehub/ui/base-ui';
import { App } from 'antd';
import { createStaticStyles } from 'antd-style';
import { MoreVertical, PencilLine, Settings2, Trash, UsersRound } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MemberSelectionModal } from '@/components/MemberSelectionModal';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAgentGroupStore } from '@/store/agentGroup';
import { useSessionStore } from '@/store/session';

import MobileMenuPopup from '../MobileMenuPopup';
import { useMobileCreateAgentMenuItems } from '../useMobileCreateAgentMenuItems';

const styles = createStaticStyles(({ css, cssVar }) => ({
  modalRoot: css`
    z-index: 2000;
  `,
}));
interface ActionsProps {
  id?: string;
  isCustomGroup?: boolean;
  isPinned?: boolean;
  onOpenChange?: (open: boolean) => void;
  openConfigModal: () => void;
  openRenameModal?: () => void;
}

type ItemOfType<T> = T extends (infer Item)[] ? Item : never;
type MenuItemType = ItemOfType<MenuProps['items']>;

const Actions = memo<ActionsProps>(
  ({ id, openRenameModal, openConfigModal, onOpenChange, isCustomGroup, isPinned }) => {
    const { t } = useTranslation(['chat', 'common']);
    const { message } = App.useApp();

    const isMobile = useIsMobile();
    const [menuOpen, setMenuOpen] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);

    const [removeSessionGroup] = useSessionStore((s) => [s.removeSessionGroup]);

    const [createGroup] = useAgentGroupStore((s) => [s.createGroup]);
    const { isCreating: isCreatingAgent, items: createAgentItems } = useMobileCreateAgentMenuItems({
      groupId: id,
      isPinned,
      showFeedback: true,
    });

    const sessionGroupConfigPublicItem: MenuItemType = {
      icon: <Icon icon={Settings2} />,
      key: 'config',
      label: t('sessionGroup.config'),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        openConfigModal();
      },
    };

    const newGroupChatItem: MenuItemType = {
      icon: <Icon icon={UsersRound} />,
      key: 'newGroupChat',
      label: t('newGroupChat'),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setIsGroupModalOpen(true);
      },
    };

    const handleCreateGroupWithMembers = async (
      selectedAgents: string[],
      hostConfig?: { model?: string; provider?: string },
      enableSupervisor?: boolean,
    ) => {
      try {
        setIsCreatingGroup(true);

        const config: any = {};

        if (enableSupervisor !== undefined) {
          config.enableSupervisor = enableSupervisor;
        }

        if (hostConfig) {
          config.orchestratorModel = hostConfig.model;
          config.orchestratorProvider = hostConfig.provider;
        }

        await createGroup(
          {
            config: Object.keys(config).length > 0 ? config : undefined,
            title: 'New Group Chat',
          },
          selectedAgents,
        );
        setIsGroupModalOpen(false);
      } catch (error) {
        console.error('Failed to create group:', error);
        message.error({ content: t('sessionGroup.createGroupFailed') });
      } finally {
        setIsCreatingGroup(false);
      }
    };

    const handleGroupModalCancel = () => {
      setIsGroupModalOpen(false);
    };

    const customGroupItems: MenuProps['items'] = useMemo(
      () => [
        {
          icon: <Icon icon={PencilLine} />,
          key: 'rename',
          label: t('sessionGroup.rename'),
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            openRenameModal?.();
          },
        },
        sessionGroupConfigPublicItem,
        {
          type: 'divider',
        },
        {
          danger: true,
          icon: <Icon icon={Trash} />,
          key: 'delete',
          label: t('delete', { ns: 'common' }),
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            confirmModal({
              cancelText: t('cancel', { ns: 'common' }),
              content: t('sessionGroup.confirmRemoveGroupAlert'),
              okButtonProps: { danger: true },
              okText: t('delete', { ns: 'common' }),
              onOk: async () => {
                if (!id) return;
                await removeSessionGroup(id);
              },
              title: t('delete', { ns: 'common' }),
            });
          },
        },
      ],
      [],
    );

    const defaultItems: MenuProps['items'] = useMemo(() => [sessionGroupConfigPublicItem], []);

    const tailItems = useMemo(
      () => (isCustomGroup ? customGroupItems : defaultItems),
      [isCustomGroup, customGroupItems, defaultItems],
    );

    const menuItems = useMemo(() => {
      return [...createAgentItems, newGroupChatItem, { type: 'divider' as const }, ...tailItems];
    }, [createAgentItems, newGroupChatItem, tailItems]);

    const handleOpenChange = (open: boolean) => {
      setMenuOpen(open);
      onOpenChange?.(open);
    };

    return (
      <>
        <MobileMenuPopup
          items={menuItems}
          open={menuOpen}
          onClose={() => handleOpenChange(false)}
          onOpenChange={handleOpenChange}
        >
          <ActionIcon
            active={isMobile ? true : false}
            icon={MoreVertical}
            loading={isCreatingAgent || isCreatingGroup}
            size={{ blockSize: 22, size: 16 }}
            style={{ background: isMobile ? 'transparent' : '', marginRight: -8 }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenChange(true);
            }}
          />
        </MobileMenuPopup>

        <MemberSelectionModal
          mode="create"
          open={isGroupModalOpen}
          onCancel={handleGroupModalCancel}
          onConfirm={handleCreateGroupWithMembers}
        />
      </>
    );
  },
);

export default Actions;
