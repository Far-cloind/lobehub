import { memo } from 'react';

import { useHomeStore } from '@/store/home';
import { useSessionStore } from '@/store/session';

import SkeletonList from '../SkeletonList';
import SessionList from './List';

const SearchMode = memo(() => {
  const sessionSearchKeywords = useSessionStore((s) => s.sessionSearchKeywords);
  const [isAgentListInit, useSearchAgents] = useHomeStore((s) => [
    s.isAgentListInit,
    s.useSearchAgents,
  ]);

  const { data, isLoading } = useSearchAgents(sessionSearchKeywords);
  const filteredData = data?.filter((item) => item.type !== 'group');

  return !isAgentListInit || isLoading ? (
    <SkeletonList />
  ) : (
    <SessionList dataSource={filteredData} showAddButton={false} />
  );
});

SearchMode.displayName = 'SessionSearchMode';

export default SearchMode;
