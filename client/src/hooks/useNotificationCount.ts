import { useState, useEffect } from 'react';

export function useNotificationCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = async () => {
    try {
      const response = await fetch('/api/notifications-caisse/unread-count');
      if (response.ok) {
        const data = await response.json();
        const nextCount = typeof data?.count === 'number' ? data.count : 0;
        setCount(nextCount);
      }
    } catch (error) {
      console.error('Erreur comptage notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();

    const interval = setInterval(fetchCount, 30000);

    return () => clearInterval(interval);
  }, []);

  return { count, loading, refresh: fetchCount };
}
