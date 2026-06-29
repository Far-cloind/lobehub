import { Button, Flexbox } from '@lobehub/ui';
import { Plus } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useServerConfigStore } from '@/store/serverConfig';

import MobileMenuPopup from '../MobileMenuPopup';
import { useMobileCreateAgentMenuItems } from '../useMobileCreateAgentMenuItems';

const AddButton = memo<{ groupId?: string }>(({ groupId }) => {
  const { t } = useTranslation('chat');
  const mobile = useServerConfigStore((s) => s.isMobile);
  const [menuOpen, setMenuOpen] = useState(false);
  const { createDefaultAgent, enableLocalCodexBridge, isCreating, items } =
    useMobileCreateAgentMenuItems({ groupId });

  const handleOpenChange = useCallback((open: boolean) => {
    setMenuOpen(open);
  }, []);

  const handleClose = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const handleTriggerClick = useCallback(() => {
    if (enableLocalCodexBridge) {
      setMenuOpen((prev) => !prev);
    } else {
      void createDefaultAgent();
    }
  }, [createDefaultAgent, enableLocalCodexBridge]);

  const button = (
    <Button
      block
      icon={Plus}
      loading={isCreating}
      style={{ marginTop: 8 }}
      variant={'filled'}
      onClick={handleTriggerClick}
    >
      {t('newAgent')}
    </Button>
  );

  return (
    <Flexbox flex={1} padding={mobile ? 16 : 0}>
      {enableLocalCodexBridge ? (
        <MobileMenuPopup
          items={items}
          open={menuOpen}
          onClose={handleClose}
          onOpenChange={handleOpenChange}
        >
          {button}
        </MobileMenuPopup>
      ) : (
        button
      )}
    </Flexbox>
  );
});

export default AddButton;
