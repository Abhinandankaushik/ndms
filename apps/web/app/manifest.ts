import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NDMS',
    short_name: 'NDMS',
    description: 'Report an emergency, find a shelter and follow official alerts, with or without a connection.',
    // Installed from a phone, NDMS is the citizen app; the other portals are reached by signing in.
    start_url: '/citizen',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#b91c1c',
    categories: ['utilities', 'government'],
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Send an SOS', short_name: 'SOS', url: '/citizen' },
      { name: 'Report an incident', short_name: 'Report', url: '/citizen/report' },
      { name: 'Find a shelter', short_name: 'Shelters', url: '/citizen/shelters' },
    ],
  };
}
