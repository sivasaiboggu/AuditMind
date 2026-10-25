import { useContractStore } from '../store/contractStore';

/** An old request must not become current again after logout/login as same ID. */
export function workspaceGuard() {
  const epoch = useContractStore.getState().workspaceEpoch;
  return () => useContractStore.getState().workspaceEpoch === epoch;
}
