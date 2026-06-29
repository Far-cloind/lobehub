import { type MenuProps } from '@lobehub/ui';
import {
  type CSSProperties,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import Menu from '@/components/Menu';

const BACKDROP_STYLE: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.15)',
  inset: 0,
  position: 'fixed',
  WebkitTapHighlightColor: 'transparent',
  zIndex: 1999,
};

const MENU_BASE_STYLE: CSSProperties = {
  background: 'var(--ant-color-bg-elevated)',
  border: '1px solid var(--ant-color-border-secondary)',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12)',
  maxHeight: '50vh',
  minWidth: 180,
  overflowY: 'auto',
  padding: 4,
  position: 'fixed',
  zIndex: 2000,
};

interface MobileMenuPopupProps {
  children: ReactNode;
  items: MenuProps['items'];
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const MobileMenuPopup = memo<MobileMenuPopupProps>(
  ({ children, items, onClose, onOpenChange, open }) => {
    const triggerRef = useRef<HTMLSpanElement>(null);
    const [position, setPosition] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

    const calculatePosition = useCallback(() => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = Math.min(window.innerHeight * 0.5, 300);

      let top = rect.bottom + 4;
      let left = rect.right - menuWidth;

      // Keep menu within viewport
      if (left < 8) left = 8;
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (top + menuHeight > window.innerHeight - 8) {
        top = rect.top - menuHeight - 4;
      }
      if (top < 8) top = 8;

      setPosition({ left, top });
    }, []);

    useEffect(() => {
      if (open) calculatePosition();
    }, [open, calculatePosition]);

    const handleBackdropClick = useCallback(() => {
      onOpenChange(false);
    }, [onOpenChange]);

    const handleMenuItemClick = useCallback(() => {
      onClose();
    }, [onClose]);

    if (!open) {
      return <span ref={triggerRef}>{children}</span>;
    }

    return (
      <span ref={triggerRef}>
        {children}
        <div aria-hidden style={BACKDROP_STYLE} onClick={handleBackdropClick} />
        <div
          style={{
            ...MENU_BASE_STYLE,
            left: position.left,
            top: position.top,
          }}
        >
          <Menu compact items={items} onClick={handleMenuItemClick} />
        </div>
      </span>
    );
  },
);

export default MobileMenuPopup;
