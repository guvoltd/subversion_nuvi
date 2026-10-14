import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check, ChevronDown, Terminal, Link2 } from 'lucide-react';
import { ServerConfig } from '../types';
import { buildCheckoutUrl } from '../utils/checkoutUrl';
import { copyToClipboard } from '../utils/clipboard';

interface CheckoutCopyButtonProps {
  repoName: string;
  serverConfig?: ServerConfig | null;
  size?: 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

export const CheckoutCopyButton: React.FC<CheckoutCopyButtonProps> = ({
  repoName,
  serverConfig,
  size = 'sm',
  className = '',
  style
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedMode, setCopiedMode] = useState<'cmd' | 'url' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const checkoutUrl = buildCheckoutUrl(repoName, serverConfig);
  const checkoutCmd = `svn checkout ${checkoutUrl}`;

  // Close dropdown menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  const handleCopyCmd = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await copyToClipboard(checkoutCmd);
    setCopiedMode('cmd');
    setIsOpen(false);
    setTimeout(() => setCopiedMode(null), 2500);
  };

  const handleCopyUrl = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await copyToClipboard(checkoutUrl);
    setCopiedMode('url');
    setIsOpen(false);
    setTimeout(() => setCopiedMode(null), 2500);
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block', ...style }}
      className={`checkout-copy-dropdown-wrapper ${className}`}
    >
      {/* Main Copy Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        className={`btn btn-secondary ${size === 'sm' ? 'btn-sm' : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: size === 'sm' ? '0.25rem 0.6rem' : '0.45rem 0.85rem',
          fontSize: size === 'sm' ? '0.78rem' : '0.85rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          borderColor: isOpen ? 'var(--accent-primary, #3b82f6)' : undefined,
          backgroundColor: isOpen ? 'rgba(59, 130, 246, 0.15)' : undefined
        }}
        title="Copy checkout command or repository URL"
      >
        {copiedMode ? (
          <>
            <Check size={size === 'sm' ? 13 : 15} color="#34d399" />
            <span style={{ color: '#34d399' }}>
              {copiedMode === 'cmd' ? 'Copied Command!' : 'Copied URL!'}
            </span>
          </>
        ) : (
          <>
            <Copy size={size === 'sm' ? 13 : 15} />
            <span>Copy</span>
            <ChevronDown
              size={size === 'sm' ? 12 : 14}
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s ease',
                opacity: 0.85
              }}
            />
          </>
        )}
      </button>

      {/* Pulldown Sub Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            right: 0,
            minWidth: '270px',
            maxWidth: '340px',
            backgroundColor: 'var(--bg-secondary, #1e293b)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
            borderRadius: '8px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            zIndex: 1050,
            padding: '0.45rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            animation: 'modalFadeIn 0.15s ease-out'
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            style={{
              padding: '0.25rem 0.55rem',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-dim, #94a3b8)'
            }}
          >
            Copy to Clipboard
          </div>

          {/* Option 1: Checkout Command */}
          <button
            type="button"
            onClick={handleCopyCmd}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              width: '100%',
              padding: '0.5rem 0.65rem',
              border: '1px solid transparent',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'var(--text-main, #f1f5f9)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.14)';
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '1px'
              }}
            >
              <Terminal size={14} color="#60a5fa" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#93c5fd' }}>
                Copy Checkout Command
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-dim, #94a3b8)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: '0.1rem'
                }}
              >
                {checkoutCmd}
              </div>
            </div>
          </button>

          {/* Option 2: URL Only */}
          <button
            type="button"
            onClick={handleCopyUrl}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              width: '100%',
              padding: '0.5rem 0.65rem',
              border: '1px solid transparent',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'var(--text-main, #f1f5f9)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.12s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(52, 211, 153, 0.14)';
              e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.3)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                backgroundColor: 'rgba(52, 211, 153, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '1px'
              }}
            >
              <Link2 size={14} color="#34d399" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#6ee7b7' }}>
                Copy URL Only
              </div>
              <div
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-dim, #94a3b8)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: '0.1rem'
                }}
              >
                {checkoutUrl}
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

