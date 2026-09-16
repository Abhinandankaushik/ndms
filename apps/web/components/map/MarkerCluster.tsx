'use client';

import L from 'leaflet';
import 'leaflet.markercluster';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { LayerGroup, useMap } from 'react-leaflet';
import { clusterIcon } from './marker-icons';

// Chunked loading finishes an add on later timers, so a removal flushed in between would miss markers still
// queued and strand them on the map.
type SupportedClusterOptions = Omit<
  L.MarkerClusterGroupOptions,
  'chunkedLoading' | 'chunkDelay' | 'chunkInterval' | 'chunkProgress'
>;

export interface MarkerClusterProps extends SupportedClusterOptions {
  /** react-leaflet markers (Marker, IncidentMarker, ...), with their Popup and Tooltip children. */
  children?: ReactNode;
}

const DEFAULT_OPTIONS: L.MarkerClusterGroupOptions = {
  maxClusterRadius: 50,
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  iconCreateFunction: clusterIcon,
};

/** Clusters its child markers. Options are read once, when the cluster mounts. */
export function MarkerCluster({ children, ...options }: MarkerClusterProps) {
  const map = useMap();
  const [cluster] = useState(() => L.markerClusterGroup({ ...DEFAULT_OPTIONS, ...options }));
  const [batch] = useState(() => createClusterBatch(cluster));

  useEffect(() => {
    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [map, cluster]);

  // @react-leaflet/core, whose createLayerComponent would make the cluster itself the layer container, is not a
  // direct dependency, so react-leaflet's LayerGroup provides the container and its add/remove calls are
  // redirected here. Its ref is attached before children run the effects that add their markers.
  const redirectChildLayers = useCallback(
    (group: L.LayerGroup | null) => {
      if (!group) return;
      group.addLayer = (layer) => {
        batch.add(layer);
        return group;
      };
      group.removeLayer = (layer) => {
        if (typeof layer !== 'number') batch.remove(layer);
        return group;
      };
    },
    [batch],
  );

  return <LayerGroup ref={redirectChildLayers}>{children}</LayerGroup>;
}

interface ClusterBatch {
  add(layer: L.Layer): void;
  remove(layer: L.Layer): void;
}

// Markers mount and unmount one effect at a time. Adding them to a live cluster singly recalculates every
// cluster's bounds per marker, which stalls a 5,000-marker render; one bulk call per commit does not.
function createClusterBatch(cluster: L.MarkerClusterGroup): ClusterBatch {
  const pending = new Map<L.Layer, boolean>();
  let flushQueued = false;

  const flush = () => {
    flushQueued = false;
    const additions: L.Layer[] = [];
    const removals: L.Layer[] = [];
    for (const [layer, belongs] of pending) (belongs ? additions : removals).push(layer);
    pending.clear();
    if (removals.length > 0) cluster.removeLayers(removals);
    if (additions.length > 0) cluster.addLayers(additions);
  };

  const queue = (layer: L.Layer, belongs: boolean) => {
    pending.set(layer, belongs);
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(flush);
  };

  return {
    add: (layer) => queue(layer, true),
    remove: (layer) => queue(layer, false),
  };
}
