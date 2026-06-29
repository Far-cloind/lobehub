import { ActionIcon, DropdownMenu, Icon } from '@lobehub/ui';
import { confirmModal } from '@lobehub/ui/base-ui';
import { App } from 'antd';
import { type ItemType } from 'antd/es/menu/interface';
import isEqual from 'fast-deep-equal';
import {
  Check,
  ExternalLink,
  ListTree,
  LucideCopy,
  LucidePlus,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Trash,
} from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { isDesktop } from '@/const/index';
import { usePermission } from '@/hooks/usePermission';
import { chatGroupService } from '@/services/chatGroup';
import { useGlobalStore } from '@/store/global';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { SessionDefaultGroup } from '@/types/index';

interface ActionProps {
  group: string | undefined;
  id: string;
  openCreateGroupModal: () => void;
  openRenameModal: () => void;
  parentType: 'agent' | 'group';
  pinned: boolean;
  setOpen: (open: boolean) => void;
}

const Actions = memo<ActionProps>(
  ({ group, id, openCreateGroupModal, openRenameModal, parentType, pinned, setOpen }) => {
    const { t } = useTranslation('chat');
    const { allowed: canCreate, reason: createReason } = usePermission('create_content');
    const { allowed: canEdit, reason: editReason } = usePermission('edit_own_content');

    const openAgentInNewWindow = useGlobalStore((s) => s.openAgentInNewWindow);

    const sessionCustomGroups = useHomeStore(homeAgentListSelectors.agentGroups, isEqual);
    const [
      duplicateAgent,
      duplicateAgentGroup,
      pinAgent,
      pinAgentGroup,
      refreshAgentList,
      removeAgent,
      removeAgentGroup,
      updateAgentGroup,
    ] = useHomeStore((s) => [
      s.duplicateAgent,
      s.duplicateAgentGroup,
      s.pinAgent,
      s.pinAgentGroup,
      s.refreshAgentList,
      s.removeAgent,
      s.removeAgentGroup,
      s.updateAgentGroup,
    ]);

    const { message } = App.useApp();

    const isDefault = group === SessionDefaultGroup.Default;

    const items = useMemo(
      () =>
        (
          [
            {
              disabled: !canEdit,
              icon: <Icon icon={pinned ? PinOff : Pin} />,
              key: 'pin',
              label: t(pinned ? 'pinOff' : 'pin'),
              title: editReason,
              onClick: () => {
                if (!canEdit) return;
                if (parentType === 'group') {
                  pinAgentGroup(id, !pinned);
                } else {
                  pinAgent(id, !pinned);
                }
              },
            },
            {
              disabled: !canEdit,
              icon: <Icon icon={Pencil} />,
              key: 'rename',
              label: t('rename', { ns: 'common' }),
              title: editReason,
              onClick: ({ domEvent }) => {
                domEvent.stopPropagation();
                if (!canEdit) return;
                openRenameModal();
              },
            },
            {
              disabled: !canCreate,
              icon: <Icon icon={LucideCopy} />,
              key: 'duplicate',
              label: t('duplicate', { ns: 'common' }),
              title: createReason,
              onClick: ({ domEvent }) => {
                domEvent.stopPropagation();
                if (!canCreate) return;

                if (parentType === 'group') {
                  duplicateAgentGroup(id);
                } else {
                  duplicateAgent(id);
                }
              },
            },
            ...(isDesktop
              ? [
                  {
                    icon: <Icon icon={ExternalLink} />,
                    key: 'openInNewWindow',
                    label: t('openInNewWindow'),
                    onClick: ({ domEvent }: { domEvent: Event }) => {
                      domEvent.stopPropagation();
                      openAgentInNewWindow(id);
                    },
                  },
                ]
              : []),
            {
              type: 'divider',
            },
            {
              children: [
                ...sessionCustomGroups.map(({ id: groupId, name }) => ({
                  disabled: !canEdit,
                  icon: group === groupId ? <Icon icon={Check} /> : <div />,
                  key: groupId,
                  label: name,
                  title: editReason,
                  onClick: async () => {
                    if (!canEdit) return;
                    if (parentType === 'group') {
                      await chatGroupService.updateGroup(id, { groupId });
                      await refreshAgentList();
                    } else {
                      await updateAgentGroup(id, groupId);
                    }
                  },
                })),
                {
                  disabled: !canEdit,
                  icon: isDefault ? <Icon icon={Check} /> : <div />,
                  key: 'defaultList',
                  label: t('defaultList'),
                  title: editReason,
                  onClick: async () => {
                    if (!canEdit) return;
                    if (parentType === 'group') {
                      await chatGroupService.updateGroup(id, { groupId: null });
                      await refreshAgentList();
                    } else {
                      await updateAgentGroup(id, SessionDefaultGroup.Default);
                    }
                  },
                },
                {
                  type: 'divider',
                },
                {
                  disabled: !canCreate,
                  icon: <Icon icon={LucidePlus} />,
                  key: 'createGroup',
                  label: <div>{t('sessionGroup.createGroup')}</div>,
                  title: createReason,
                  onClick: ({ domEvent }) => {
                    domEvent.stopPropagation();
                    if (!canCreate) return;
                    openCreateGroupModal();
                  },
                },
              ],
              disabled: !canEdit,
              icon: <Icon icon={ListTree} />,
              key: 'moveGroup',
              label: t('sessionGroup.moveGroup'),
              title: editReason,
            },
            {
              type: 'divider',
            },
            {
              danger: true,
              disabled: !canEdit,
              icon: <Icon icon={Trash} />,
              key: 'delete',
              label: t('delete', { ns: 'common' }),
              title: editReason,
              onClick: ({ domEvent }) => {
                domEvent.stopPropagation();
                if (!canEdit) return;
                confirmModal({
                  okButtonProps: { danger: true },
                  onOk: async () => {
                    if (parentType === 'group') {
                      await removeAgentGroup(id);
                      message.success(t('confirmRemoveGroupSuccess'));
                    } else {
                      await removeAgent(id);
                      message.success(t('confirmRemoveSessionSuccess'));
                    }
                  },
                  title:
                    parentType === 'group'
                      ? t('confirmRemoveChatGroupItemAlert')
                      : t('confirmRemoveSessionItemAlert'),
                });
              },
            },
          ] as ItemType[]
        ).filter(Boolean),
      [
        canCreate,
        canEdit,
        createReason,
        duplicateAgent,
        duplicateAgentGroup,
        editReason,
        group,
        id,
        isDefault,
        openAgentInNewWindow,
        openCreateGroupModal,
        openRenameModal,
        parentType,
        pinAgent,
        pinAgentGroup,
        pinned,
        refreshAgentList,
        removeAgentGroup,
        removeAgent,
        sessionCustomGroups,
        t,
        updateAgentGroup,
        message,
      ],
    );

    return (
      <DropdownMenu items={items} onOpenChange={setOpen}>
        <ActionIcon
          icon={MoreVertical}
          size={{
            blockSize: 28,
            size: 16,
          }}
        />
      </DropdownMenu>
    );
  },
);

export default Actions;
