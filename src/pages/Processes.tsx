import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { ProcessRepositoryPanel } from "@/components/processes/ProcessRepositoryPanel";

export default function Processes() {
  return (
    <RequireAuth>
      <AppShell>
        <ProcessRepositoryPanel />
      </AppShell>
    </RequireAuth>
  );
}
