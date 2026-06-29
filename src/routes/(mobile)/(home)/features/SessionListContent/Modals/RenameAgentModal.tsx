import { type ModalProps } from '@lobehub/ui';
import { Input, Modal } from '@lobehub/ui';
import { App } from 'antd';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useHomeStore } from '@/store/home';

interface RenameAgentModalProps extends ModalProps {
  id: string;
}

const RenameAgentModal = memo<RenameAgentModalProps>(({ id, open, onCancel }) => {
  const { t } = useTranslation('chat');
  const { message } = App.useApp();

  const meta = useAgentStore(agentSelectors.getAgentMetaById(id));
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(meta?.title ?? '');
  }, [meta]);

  return (
    <Modal
      allowFullscreen
      destroyOnHidden
      okButtonProps={{ loading }}
      open={open}
      title={t('rename', { ns: 'common' })}
      width={400}
      onCancel={(e) => {
        setInput(meta?.title ?? '');
        onCancel?.(e);
      }}
      onOk={async (e) => {
        if (input.length === 0 || input.length > 30) return;
        setLoading(true);
        try {
          useHomeStore.getState().setAgentUpdatingId(id);
          await useAgentStore.getState().optimisticUpdateAgentMeta(id, { title: input });
          await useHomeStore.getState().refreshAgentList();
        } finally {
          useHomeStore.getState().setAgentUpdatingId(null);
          setLoading(false);
        }
        onCancel?.(e);
      }}
    >
      <Input
        autoFocus
        defaultValue={meta?.title}
        placeholder={t('sessionGroup.inputPlaceholder')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
    </Modal>
  );
});

export default RenameAgentModal;
