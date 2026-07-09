import { useState, useEffect, useCallback } from 'react';

interface PushSubscriptionState {
  isSubscribed: boolean;
  isSupported: boolean;
  isLoading: boolean;
  error: string | null;
  permission: NotificationPermission | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushSubscriptionState>({
    isSubscribed: false,
    isSupported: false,
    isLoading: true,
    error: null,
    permission: null
  });

  const checkSupport = useCallback(() => {
    const isSupported = 'serviceWorker' in navigator && 
                        'PushManager' in window &&
                        'Notification' in window;
    return isSupported;
  }, []);

  const getPermission = useCallback(() => {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return null;
  }, []);

  const checkSubscription = useCallback(async () => {
    try {
      if (!checkSupport()) {
        setState(prev => ({ ...prev, isSupported: false, isLoading: false }));
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      setState(prev => ({
        ...prev,
        isSubscribed: !!subscription,
        isSupported: true,
        isLoading: false,
        permission: getPermission()
      }));
      
      return !!subscription;
    } catch (error: any) {
      console.error('Error checking subscription:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
      return false;
    }
  }, [checkSupport, getPermission]);

  const subscribe = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      if (!checkSupport()) {
        throw new Error('Push notifications not supported');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      await navigator.serviceWorker.ready;

      const vapidResponse = await fetch('/api/push/vapid-public-key', {
        credentials: 'include'
      });
      
      if (!vapidResponse.ok) {
        throw new Error('Failed to get VAPID key');
      }
      
      const { publicKey } = await vapidResponse.json();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      const deviceInfo = `${navigator.userAgent.slice(0, 100)}`;

      const p256dhKey = subscription.getKey('p256dh');
      const authKey = subscription.getKey('auth');
      
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: p256dhKey ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(p256dhKey)))) : '',
            auth: authKey ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(authKey)))) : ''
          },
          deviceInfo
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        permission: 'granted'
      }));

      return true;
    } catch (error: any) {
      console.error('Error subscribing:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
      return false;
    }
  }, [checkSupport]);

  const unsubscribe = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        
        await subscription.unsubscribe();
      }

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        isLoading: false
      }));

      return true;
    } catch (error: any) {
      console.error('Error unsubscribing:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
      return false;
    }
  }, []);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    checkSubscription
  };
}

export default usePushNotifications;
