import React, { useState, useRef, useEffect } from 'react';
import { resolveStorageUrl } from '../../lib/format';

export interface AvatarProps {
  photoUrl?: string | null;
  fullName: string;
  initials?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  className?: string;
  showStatus?: boolean;
  status?: 'online' | 'offline' | 'busy' | 'away';
}

const Avatar: React.FC<AvatarProps> = ({ 
  photoUrl, 
  fullName, 
  initials, 
  size = 'md', 
  className = '',
  showStatus = false,
  status = 'online'
}) => {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imgRef = useRef<HTMLImageElement>(null);

  const resolvedUrl = photoUrl ? resolveStorageUrl(photoUrl) : null;

  useEffect(() => {
    if (!resolvedUrl) {
      setImageState('error');
      return;
    }

    const img = new Image();
    img.src = resolvedUrl;

    if (img.complete && img.naturalHeight > 0) {
      setImageState('loaded');
      return;
    }

    setImageState('loading');
    img.onload = () => setImageState('loaded');
    img.onerror = () => setImageState('error');

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [resolvedUrl]);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
    xxl: 'w-24 h-24 text-2xl',
  }[size];

  const borderClasses = size === 'sm' || size === 'xs'
    ? 'border border-edge'
    : 'border-2 border-edge';

  const generatedInitials = initials || fullName
    .split(' ')
    .map(n => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  const statusColors = {
    online: 'bg-status-success',
    offline: 'bg-content-muted',
    busy: 'bg-status-danger',
    away: 'bg-status-warning',
  };

  const statusDotSizes = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
    xl: 'w-4 h-4',
    xxl: 'w-5 h-5',
  }[size];

  const innerContent = () => {
    if (!resolvedUrl || imageState === 'error') {
      return (
        <div className={`w-full h-full rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold ${className}`}>
          {generatedInitials}
        </div>
      );
    }

    if (imageState === 'loaded') {
      return (
        <img
          ref={imgRef}
          src={resolvedUrl}
          alt={fullName}
          className={`w-full h-full rounded-full object-cover ${className}`}
          onError={() => setImageState('error')}
          loading="lazy"
        />
      );
    }

    return (
      <div className={`w-full h-full rounded-full bg-surface-elevated animate-pulse ${className}`} />
    );
  };

  return (
    <div className={`relative flex-shrink-0 ${sizeClasses} rounded-full ${borderClasses}`}>
      {innerContent()}
      {showStatus && (
        <span className={`absolute bottom-0 right-0 ${statusDotSizes} ${statusColors[status]} border-2 border-surface rounded-full`} />
      )}
    </div>
  );
};

export { Avatar };
export default Avatar;
