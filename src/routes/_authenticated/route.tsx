import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const AUTH_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const result = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    if (!result || result.error || !result.data.user) {
      throw redirect({ to: "/auth" });
    }
    return { user: result.data.user };
  },
  component: () => <Outlet />,
});
