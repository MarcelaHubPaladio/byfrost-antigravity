import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ProductLockStatus = "checking" | "acquired" | "locked";
export type ProductLockInfo = { userId: string; userName: string; trackedAt: number };

/**
 * Hook to get a map of all currently edited products in the tenant.
 */
export function useProductPresence(tenantId: string | null) {
  const [locks, setLocks] = useState<Record<string, ProductLockInfo>>({});

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase.channel(`product_presence:${tenantId}`);

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const newLocks: Record<string, ProductLockInfo> = {};

        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((p) => {
            if (p.product_id && p.user_id && p.user_name) {
              const existing = newLocks[p.product_id];
              // If multiple people somehow tracked, earliest wins
              if (!existing || existing.trackedAt > p.tracked_at) {
                newLocks[p.product_id] = {
                  userId: p.user_id,
                  userName: p.user_name,
                  trackedAt: p.tracked_at || 0,
                };
              }
            }
          });
        });

        setLocks(newLocks);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  return locks;
}

/**
 * Hook to attempt locking a specific product.
 * Returns the lock status and the user who currently holds the lock (if any).
 */
export function useAcquireProductLock(
  tenantId: string | null,
  productId: string | null,
  user: { id: string; display_name?: string; email?: string } | null
) {
  const [status, setStatus] = useState<ProductLockStatus>("checking");
  const [lockedBy, setLockedBy] = useState<{ userId: string; userName: string } | null>(null);

  useEffect(() => {
    if (!tenantId || !productId || !user) {
      setStatus("checking");
      return;
    }

    const channel = supabase.channel(`product_presence:${tenantId}`);
    let isSubscribed = false;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        let existingLock: any = null;

        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((p) => {
            if (p.product_id === productId && p.user_id !== user.id) {
              if (!existingLock || existingLock.tracked_at > p.tracked_at) {
                existingLock = p;
              }
            }
          });
        });

        if (existingLock) {
          setLockedBy({ userId: existingLock.user_id, userName: existingLock.user_name });
          setStatus("locked");
        } else {
          setLockedBy(null);
          setStatus("acquired");
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          isSubscribed = true;
          await channel.track({
            product_id: productId,
            user_id: user.id,
            user_name: user.display_name || user.email || "Usuário",
            tracked_at: Date.now(),
          });
        }
      });

    return () => {
      if (isSubscribed) {
        channel.untrack().then(() => supabase.removeChannel(channel));
      } else {
        supabase.removeChannel(channel);
      }
    };
  }, [tenantId, productId, user?.id]); // depend only on user id, not full object reference

  return { status, lockedBy };
}
