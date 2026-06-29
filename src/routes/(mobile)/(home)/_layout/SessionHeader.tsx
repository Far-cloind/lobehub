'use client';

import { ActionIcon, Flexbox } from '@lobehub/ui';
import { ChatHeader } from '@lobehub/ui/mobile';
import { MessageSquarePlus } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router';

import { ProductLogo } from '@/components/Branding';
import { MOBILE_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import UserAvatar from '@/features/User/UserAvatar';
import { mobileHeaderSticky } from '@/styles/mobileHeader';

import MobileMenuPopup from '../features/SessionListContent/MobileMenuPopup';
import { useMobileCreateAgentMenuItems } from '../features/SessionListContent/useMobileCreateAgentMenuItems';
import { styles } from './SessionHeader/style';

const Header = memo(() => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { createDefaultAgent, enableLocalCodexBridge, isCreating, items } =
    useMobileCreateAgentMenuItems();

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

  const addButton = (
    <ActionIcon
      icon={MessageSquarePlus}
      loading={isCreating}
      size={MOBILE_HEADER_ICON_SIZE}
      onClick={handleTriggerClick}
    />
  );

  return (
    <ChatHeader
      style={mobileHeaderSticky}
      left={
        <Flexbox horizontal align={'center'} className={styles.leftContainer} gap={8}>
          <UserAvatar size={32} onClick={() => navigate('/me')} />
          <ProductLogo type={'text'} />
        </Flexbox>
      }
      right={
        enableLocalCodexBridge ? (
          <MobileMenuPopup
            items={items}
            open={menuOpen}
            onClose={handleClose}
            onOpenChange={handleOpenChange}
          >
            {addButton}
          </MobileMenuPopup>
        ) : (
          addButton
        )
      }
    />
  );
});

export default Header;
