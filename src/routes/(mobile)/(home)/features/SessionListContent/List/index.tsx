import { useAnalytics } from '@lobehub/analytics/react';
import { memo } from 'react';
import { Link } from 'react-router';

import { SESSION_CHAT_URL } from '@/const/index';
import { type SidebarAgentItem } from '@/database/repositories/home';
import { useNavigateToAgent } from '@/hooks/useNavigateToAgent';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
import { useServerConfigStore } from '@/store/serverConfig';
import { getUserStoreState } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import SkeletonList from '../../SkeletonList';
import AddButton from './AddButton';
import SessionItem from './Item';

interface SessionListProps {
  dataSource?: SidebarAgentItem[];
  groupId?: string;
  showAddButton?: boolean;
}
const SessionList = memo<SessionListProps>(({ dataSource, groupId, showAddButton = true }) => {
  const { analytics } = useAnalytics();

  const agentGroups = useHomeStore(homeAgentListSelectors.agentGroups);
  const isInit = useHomeStore(homeAgentListSelectors.isAgentListInit);
  const mobile = useServerConfigStore((s) => s.isMobile);

  const navigateToAgent = useNavigateToAgent();

  const isEmpty = !dataSource || dataSource.length === 0;
  return !isInit ? (
    <SkeletonList />
  ) : !isEmpty ? (
    dataSource.map((item) => (
      <Link
        aria-label={item.id}
        key={item.id}
        to={SESSION_CHAT_URL(item.id, mobile)}
        onClick={(e) => {
          e.preventDefault();
          navigateToAgent(item.id);

          if (analytics) {
            const userStore = getUserStoreState();
            const userId = userProfileSelectors.userId(userStore);
            const folder = agentGroups.find((group) =>
              group.items.some((entry) => entry.id === item.id),
            );

            analytics.track({
              name: 'switch_session',
              properties: {
                assistant_name: item.title || 'Untitled Agent',
                group_id: folder?.id || 'default',
                group_name: folder?.name || 'Default',
                session_id: item.id,
                spm: 'homepage.chat.session_list_item.click',
                user_id: userId || 'anonymous',
              },
            });
          }
        }}
      >
        <SessionItem item={item} />
      </Link>
    ))
  ) : (
    showAddButton && <AddButton groupId={groupId} />
  );
});

export default SessionList;
