import { memo } from 'react';
import { Link } from 'react-router';

import { DEFAULT_INBOX_AVATAR } from '@/const/meta';
import { SESSION_CHAT_URL } from '@/const/url';
import { useNavigateToAgent } from '@/hooks/useNavigateToAgent';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { useServerConfigStore } from '@/store/serverConfig';

import ListItem from '../ListItem';

const Inbox = memo(() => {
  const mobile = useServerConfigStore((s) => s.isMobile);
  const navigateToAgent = useNavigateToAgent();
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
  const isInboxActive = !!inboxAgentId && activeAgentId === inboxAgentId;

  return (
    <Link
      aria-label={'Lobe AI'}
      to={SESSION_CHAT_URL(inboxAgentId, mobile)}
      onClick={(e) => {
        e.preventDefault();
        navigateToAgent(inboxAgentId);
      }}
    >
      <ListItem
        active={isInboxActive}
        avatar={DEFAULT_INBOX_AVATAR}
        key={'inbox'}
        title={'Lobe AI'}
        styles={{
          container: {
            gap: 12,
          },
          content: {
            gap: 6,
            maskImage: `linear-gradient(90deg, #000 90%, transparent)`,
          },
        }}
      />
    </Link>
  );
});

export default Inbox;
