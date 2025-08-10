/**
 * WebSocket connection status channels
 */
export enum WSChannels {
  CONNECTION_STATUS = 'ws:connection-status',
}

/**
 * Unity project synchronization channels
 */
export const UNITY_CURRENT_PROJECT = 'unity:current-project' as const;
export const UNITY_GET_CURRENT_PROJECT = 'unity:get-current-project' as const;
