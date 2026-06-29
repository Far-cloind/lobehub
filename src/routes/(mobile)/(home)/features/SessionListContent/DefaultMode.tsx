import { type SidebarAgentItem } from '@lobechat/types';
import { type CollapseProps } from 'antd';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { SessionDefaultGroup } from '@/types/session';

import CollapseGroup from './CollapseGroup';
import Actions from './CollapseGroup/Actions';
import Inbox from './Inbox';
import SessionList from './List';
import ConfigGroupModal from './Modals/ConfigGroupModal';
import RenameGroupModal from './Modals/RenameGroupModal';

const DefaultMode = memo(() => {
  const { t } = useTranslation('chat');

  const [activeGroupId, setActiveGroupId] = useState<string>();
  const [renameGroupModalOpen, setRenameGroupModalOpen] = useState(false);
  const [configGroupModalOpen, setConfigGroupModalOpen] = useState(false);

  useFetchAgentList();

  const defaultAgents = useHomeStore(homeAgentListSelectors.ungroupedAgents);
  const customAgentGroups = useHomeStore(homeAgentListSelectors.agentGroups);
  const pinnedAgents = useHomeStore(homeAgentListSelectors.pinnedAgents);

  const filterItemsForView = (items: SidebarAgentItem[]) =>
    items.filter((item) => item.type !== 'group');

  const filteredDefaultAgents = filterItemsForView(defaultAgents);
  const filteredPinnedAgents = filterItemsForView(pinnedAgents);
  const filteredCustomAgentGroups = customAgentGroups.map((group) => ({
    ...group,
    items: filterItemsForView(group.items),
  }));

  const [sessionGroupKeys, updateSystemStatus] = useGlobalStore((s) => [
    systemStatusSelectors.sessionGroupKeys(s),
    s.updateSystemStatus,
  ]);

  const items = useMemo(
    () =>
      [
        filteredPinnedAgents.length > 0 && {
          children: <SessionList dataSource={filteredPinnedAgents} />,
          extra: <Actions isPinned openConfigModal={() => setConfigGroupModalOpen(true)} />,
          key: SessionDefaultGroup.Pinned,
          label: t('pin'),
        },
        ...filteredCustomAgentGroups.map(({ id, items, name }) => ({
          children: <SessionList dataSource={items} groupId={id} />,
          extra: (
            <Actions
              isCustomGroup
              id={id}
              openConfigModal={() => setConfigGroupModalOpen(true)}
              openRenameModal={() => setRenameGroupModalOpen(true)}
              onOpenChange={(isOpen) => {
                if (isOpen) setActiveGroupId(id);
              }}
            />
          ),
          key: id,
          label: name,
        })),
        {
          children: <SessionList dataSource={filteredDefaultAgents} />,
          extra: <Actions openConfigModal={() => setConfigGroupModalOpen(true)} />,
          key: SessionDefaultGroup.Default,
          label: t('defaultList'),
        },
      ].filter(Boolean) as CollapseProps['items'],
    [t, filteredCustomAgentGroups, filteredPinnedAgents, filteredDefaultAgents],
  );

  return (
    <>
      <Inbox />
      <CollapseGroup
        activeKey={sessionGroupKeys}
        items={items}
        onChange={(keys) => {
          const expandSessionGroupKeys = typeof keys === 'string' ? [keys] : keys;
          updateSystemStatus({ expandSessionGroupKeys });
        }}
      />
      {activeGroupId && (
        <RenameGroupModal
          id={activeGroupId}
          open={renameGroupModalOpen}
          onCancel={() => setRenameGroupModalOpen(false)}
        />
      )}
      <ConfigGroupModal
        open={configGroupModalOpen}
        onCancel={() => setConfigGroupModalOpen(false)}
      />
    </>
  );
});

DefaultMode.displayName = 'SessionDefaultMode';

export default DefaultMode;
