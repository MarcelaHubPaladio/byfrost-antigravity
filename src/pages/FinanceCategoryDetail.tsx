import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { FinancialCategoryDetailPanel } from "@/components/finance/FinancialCategoryDetailPanel";
import { useParams, useSearchParams } from "react-router-dom";

export default function FinanceCategoryDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const categoryName = searchParams.get("name") || undefined;

  if (!id) return null;

  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto w-full">
          <FinancialCategoryDetailPanel 
            categoryId={id} 
            startDate={startDate} 
            endDate={endDate} 
            categoryName={categoryName}
          />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
