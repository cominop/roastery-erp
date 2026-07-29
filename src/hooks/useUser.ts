/**
 * useUser — lightweight user identity hook
 *
 * Stores the current user ID and provides user switching.
 * The user ID is sent as X-User-Id header on API calls so the
 * server can look up roles and apply role-based visibility filtering.
 *
 * Users:
 *   ID 1 → admin (sees all nodes)
 *   ID 2 → data-entry (limited visibility)
 *   ID 3 → read-only (limited visibility)
 */

import { useState, useCallback, useMemo } from "react";

const STORAGE_KEY = "roastery-current-user-id";

export interface UserInfo {
  userId: number;
  label: string;
}

const AVAILABLE_USERS: UserInfo[] = [
  { userId: 1, label: "Admin (full access)" },
  { userId: 2, label: "Data Entry (limited nav)" },
  { userId: 3, label: "Read Only (limited nav)" },
];

function loadUserId(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const id = parseInt(stored, 10);
      if (AVAILABLE_USERS.some((u) => u.userId === id)) return id;
    }
  } catch {
    // localStorage unavailable — fall through to default
  }
  return 1; // default: admin
}

export function useUser() {
  const [userId, setUserIdState] = useState<number>(loadUserId);

  const setUserId = useCallback((id: number) => {
    setUserIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {
      // ignore
    }
  }, []);

  const currentUser = useMemo(
    () => AVAILABLE_USERS.find((u) => u.userId === userId) ?? AVAILABLE_USERS[0],
    [userId]
  );

  // Headers object for fetch calls
  const headers = useMemo(
    () => ({
      "X-User-Id": String(userId),
      "X-Company-Id": "1",
    }),
    [userId]
  );

  return {
    userId,
    setUserId,
    currentUser,
    availableUsers: AVAILABLE_USERS,
    headers,
  };
}