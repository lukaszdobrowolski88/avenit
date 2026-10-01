import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Mapa grup — przez fn home-groups-map (współrzędne + leniwe geokodowanie serwerowe).
export interface HomeGroupMapPin {
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  campus_id: number | null;
}

export const useHomeGroupsMap = () =>
  useQuery({
    queryKey: ['home-groups', 'map'],
    queryFn: async (): Promise<HomeGroupMapPin[]> => {
      const { data, error } = await supabase.functions.invoke('home-groups-map', { body: {} });
      if (error) throw new Error(error.message || 'Nie udało się pobrać mapy grup.');
      return (((data as any)?.groups ?? []) as HomeGroupMapPin[]);
    },
    // Geokodowanie uzupełnia pinezki stopniowo — pozwól odświeżać po powrocie.
    staleTime: 60 * 1000,
  });
