'use client';

import { Tooltip } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { lambdaQuery } from '@/libs/trpc/client';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';

const styles = createStaticStyles(({ css }) => ({
  item: css`
    color: ${cssVar.colorTextSecondary};
  `,
  model: css`
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
  separator: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  status: css`
    display: flex;
    flex: none;
    gap: 6px;
    align-items: center;

    height: 28px;
    padding-inline: 4px;

    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  `,
  tooltip: css`
    display: grid;
    gap: 4px;
    font-size: 12px;
  `,
}));

const formatReset = (resetsAt?: number) =>
  resetsAt ? new Date(resetsAt * 1000).toLocaleString() : '--';

interface CodexRuntimeStatusProps {
  agentId: string;
}

const CodexRuntimeStatus = memo<CodexRuntimeStatusProps>(({ agentId }) => {
  const { t } = useTranslation('chat');
  const topicId = useChatStore((s) => s.activeTopicId);
  const agencyConfig = useAgentStore(agentByIdSelectors.getAgencyConfigById(agentId));
  const provider = agencyConfig?.heterogeneousProvider;
  const isCodex = provider?.type === 'codex';
  const { data } = lambdaQuery.aiAgent.getLocalCodexStatus.useQuery(
    { topicId: topicId ?? undefined },
    {
      enabled: isCodex,
      refetchInterval: 5000,
      staleTime: 4000,
    },
  );

  if (!isCodex) return null;

  const model = provider.model || data?.model || 'default';
  const contextPercent =
    data?.contextRemaining !== undefined && data.contextWindow
      ? Math.round((data.contextRemaining / data.contextWindow) * 100)
      : undefined;
  const fiveHourPercent =
    data?.primary?.usedPercent !== undefined
      ? Math.max(0, Math.round(100 - data.primary.usedPercent))
      : undefined;
  const weeklyPercent =
    data?.secondary?.usedPercent !== undefined
      ? Math.max(0, Math.round(100 - data.secondary.usedPercent))
      : undefined;

  const tooltip = (
    <div className={styles.tooltip}>
      <span>
        {t('codexRuntime.context')}: {data?.contextRemaining?.toLocaleString() ?? '--'} /{' '}
        {data?.contextWindow?.toLocaleString() ?? '--'} tokens
      </span>
      <span>
        {t('codexRuntime.fiveHour')}: {fiveHourPercent ?? '--'}% ·{' '}
        {formatReset(data?.primary?.resetsAt)}
      </span>
      <span>
        {t('codexRuntime.weekly')}: {weeklyPercent ?? '--'}% ·{' '}
        {formatReset(data?.secondary?.resetsAt)}
      </span>
    </div>
  );

  return (
    <Tooltip title={tooltip}>
      <div className={styles.status}>
        <span className={styles.model}>{model}</span>
        <span className={styles.separator}>·</span>
        <span className={styles.item}>
          {t('codexRuntime.context')} {contextPercent ?? '--'}%
        </span>
        <span className={styles.separator}>·</span>
        <span className={styles.item}>
          {t('codexRuntime.fiveHour')} {fiveHourPercent ?? '--'}%
        </span>
        <span className={styles.separator}>·</span>
        <span className={styles.item}>
          {t('codexRuntime.weekly')} {weeklyPercent ?? '--'}%
        </span>
      </div>
    </Tooltip>
  );
});

CodexRuntimeStatus.displayName = 'CodexRuntimeStatus';

export default CodexRuntimeStatus;
