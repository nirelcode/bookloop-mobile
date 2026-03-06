import { create } from 'zustand';

interface LocationState {
  coords: { latitude: number; longitude: number } | null;
  permission: 'granted' | 'denied' | 'undetermined';
  setCoords:     (c: { latitude: number; longitude: number } | null) => void;
  setPermission: (p: 'granted' | 'denied' | 'undetermined') => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  coords:     null,
  permission: 'undetermined',
  setCoords:     (coords)     => set({ coords }),
  setPermission: (permission) => set({ permission }),
}));
