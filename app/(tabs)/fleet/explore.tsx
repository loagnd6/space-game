import { useEffect } from 'react';
import { supabase } from '@/src/services/supabase';
import { useExplorationStore } from '@/src/stores/useExplorationStore';
import { StarMapScreen } from '@/src/ui/exploration';

export default function ExploreRoute() {
  const initMap = useExplorationStore(s => s.initMap);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uuid = data.session?.user.id;
      if (uuid) initMap(uuid);
    });
  }, [initMap]);

  return <StarMapScreen />;
}
