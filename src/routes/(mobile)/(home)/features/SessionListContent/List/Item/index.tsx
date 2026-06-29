import { DEFAULT_AVATAR } from '@lobechat/const';
import { type SidebarAgentItem } from '@lobechat/types';
import React, { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shallow } from 'zustand/shallow';

import { isDesktop } from '@/const/version';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';
import { useGlobalStore } from '@/store/global';

import ListItem from '../../ListItem';
import CreateGroupModal from '../../Modals/CreateGroupModal';
import RenameAgentModal from '../../Modals/RenameAgentModal';
import Actions from './Actions';

interface SessionItemProps {
  item: SidebarAgentItem;
}

const SessionItem = memo<SessionItemProps>(({ item }) => {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  const openAgentInNewWindow = useGlobalStore((s) => s.openAgentInNewWindow);

  const [active] = useChatStore((s) => [s.activeAgentId === item.id]);
  const [loading] = useChatStore((s) => [
    operationSelectors.isAgentRuntimeRunning(s) && item.id === s.activeAgentId,
  ]);

  const handleDoubleClick = () => {
    if (isDesktop) {
      openAgentInNewWindow(item.id);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', item.id);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (isDesktop && e.dataTransfer.dropEffect === 'none') {
      openAgentInNewWindow(item.id);
    }
  };

  const actions = useMemo(
    () => (
      <Actions
        group={(item as any).groupId || undefined}
        id={item.id}
        openCreateGroupModal={() => setCreateGroupModalOpen(true)}
        openRenameModal={() => setRenameModalOpen(true)}
        parentType={item.type}
        pinned={item.pinned}
        setOpen={setOpen}
      />
    ),
    [item],
  );

  return (
    <>
      <ListItem
        actions={actions}
        active={active}
        avatar={(item.avatar as any) || DEFAULT_AVATAR}
        avatarBackground={item.backgroundColor || undefined}
        date={item.updatedAt?.valueOf()}
        draggable={isDesktop}
        key={item.id}
        loading={loading}
        pin={item.pinned}
        showAction={open}
        title={item.title || t('defaultAgent')}
        type={item.type}
        styles={{
          container: {
            gap: 12,
          },
          content: {
            gap: 6,
            maskImage: `linear-gradient(90deg, #000 90%, transparent)`,
          },
        }}
        onDoubleClick={handleDoubleClick}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
      />
      <CreateGroupModal
        id={item.id}
        open={createGroupModalOpen}
        onCancel={() => setCreateGroupModalOpen(false)}
      />
      <RenameAgentModal
        id={item.id}
        open={renameModalOpen}
        onCancel={() => setRenameModalOpen(false)}
      />
    </>
  );
}, shallow);

export default SessionItem;
