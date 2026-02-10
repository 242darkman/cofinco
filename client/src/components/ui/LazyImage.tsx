/**
 * P2.4: Lazy loading image component with placeholder
 * Optimized for slow connections with blur-up effect
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { User, Image as ImageIcon } from 'lucide-react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  placeholder?: 'blur' | 'skeleton' | 'icon';
  fallbackSrc?: string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  onLoadComplete?: () => void;
  onError?: () => void;
}

export function LazyImage({
  src,
  alt,
  placeholder = 'skeleton',
  fallbackSrc,
  aspectRatio,
  objectFit = 'cover',
  className = '',
  onLoadComplete,
  onError,
  ...props
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoadComplete?.();
  }, [onLoadComplete]);

  const handleError = useCallback(() => {
    setHasError(true);
    if (fallbackSrc && imgRef.current) {
      imgRef.current.src = fallbackSrc;
    }
    onError?.();
  }, [fallbackSrc, onError]);

  // Resolve storage URLs
  const resolvedSrc = src && !src.startsWith('http') && !src.startsWith('/api/') && !src.startsWith('data:')
    ? `/api/storage/files/${src}`
    : src;

  const objectFitClass = {
    cover: 'object-cover',
    contain: 'object-contain',
    fill: 'object-fill',
    none: 'object-none',
  }[objectFit];

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio }}
    >
      {/* Placeholder */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-700/50 animate-pulse">
          {placeholder === 'icon' && (
            <ImageIcon className="w-8 h-8 text-slate-500" />
          )}
          {placeholder === 'skeleton' && (
            <div className="w-full h-full bg-slate-700/50" />
          )}
          {placeholder === 'blur' && (
            <div className="w-full h-full bg-slate-700/30 backdrop-blur-sm" />
          )}
        </div>
      )}

      {/* Actual image - only loaded when in view */}
      {isInView && !hasError && (
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`
            w-full h-full ${objectFitClass}
            transition-opacity duration-300
            ${isLoaded ? 'opacity-100' : 'opacity-0'}
          `}
          {...props}
        />
      )}

      {/* Error fallback */}
      {hasError && !fallbackSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-700/50">
          <ImageIcon className="w-8 h-8 text-slate-500" />
        </div>
      )}
    </div>
  );
}

/**
 * Avatar component with lazy loading
 */
interface LazyAvatarProps {
  src?: string | null;
  alt: string;
  size?: number | 'sm' | 'md' | 'lg' | 'xl';
  fallbackInitials?: string;
  className?: string;
  showBorder?: boolean;
  status?: 'online' | 'offline' | 'away' | 'busy';
}

const AVATAR_SIZES = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

export function LazyAvatar({
  src,
  alt,
  size = 'md',
  fallbackInitials,
  className = '',
  showBorder = false,
  status,
}: LazyAvatarProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const sizeValue = typeof size === 'number' ? size : AVATAR_SIZES[size];

  // Get initials from alt text if no fallbackInitials provided
  const initials = fallbackInitials || alt
    .split(' ')
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Resolve storage URLs
  const resolvedSrc = src && !src.startsWith('http') && !src.startsWith('/api/') && !src.startsWith('data:')
    ? `/api/storage/files/${src}`
    : src;

  const statusColors = {
    online: 'bg-emerald-500',
    offline: 'bg-slate-500',
    away: 'bg-amber-500',
    busy: 'bg-red-500',
  };

  return (
    <div
      className={`
        relative flex-shrink-0 rounded-full overflow-hidden
        ${showBorder ? 'ring-2 ring-slate-600' : ''}
        ${className}
      `}
      style={{ width: sizeValue, height: sizeValue }}
    >
      {/* Fallback with initials */}
      {(!src || hasError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-cyan-600 to-blue-700">
          {fallbackInitials || initials ? (
            <span
              className="font-semibold text-white"
              style={{ fontSize: sizeValue * 0.4 }}
            >
              {initials}
            </span>
          ) : (
            <User className="text-white" style={{ width: sizeValue * 0.5, height: sizeValue * 0.5 }} />
          )}
        </div>
      )}

      {/* Avatar image */}
      {src && !hasError && (
        <img
          src={resolvedSrc || undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`
            absolute inset-0 w-full h-full object-cover
            transition-opacity duration-200
            ${isLoaded ? 'opacity-100' : 'opacity-0'}
          `}
        />
      )}

      {/* Loading skeleton */}
      {src && !isLoaded && !hasError && (
        <div className="absolute inset-0 bg-slate-700/50 animate-pulse" />
      )}

      {/* Status indicator */}
      {status && (
        <div
          className={`
            absolute bottom-0 right-0 rounded-full border-2 border-slate-800
            ${statusColors[status]}
          `}
          style={{
            width: Math.max(8, sizeValue * 0.25),
            height: Math.max(8, sizeValue * 0.25),
          }}
        />
      )}
    </div>
  );
}

/**
 * Background image with lazy loading and blur-up effect
 */
interface LazyBackgroundProps {
  src: string;
  className?: string;
  children?: React.ReactNode;
  overlay?: boolean;
  overlayOpacity?: number;
}

export function LazyBackground({
  src,
  className = '',
  children,
  overlay = true,
  overlayOpacity = 0.6,
}: LazyBackgroundProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const img = new Image();
          img.src = src;
          img.onload = () => setIsLoaded(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [src]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
    >
      {/* Placeholder */}
      <div
        className={`
          absolute inset-0 bg-slate-800
          transition-opacity duration-500
          ${isLoaded ? 'opacity-0' : 'opacity-100'}
        `}
      />

      {/* Background image */}
      <div
        className={`
          absolute inset-0 bg-cover bg-center
          transition-opacity duration-500
          ${isLoaded ? 'opacity-100' : 'opacity-0'}
        `}
        style={{ backgroundImage: `url(${src})` }}
      />

      {/* Overlay */}
      {overlay && (
        <div
          className="absolute inset-0 bg-slate-900"
          style={{ opacity: overlayOpacity }}
        />
      )}

      {/* Content */}
      {children && (
        <div className="relative z-10">{children}</div>
      )}
    </div>
  );
}

export default LazyImage;
