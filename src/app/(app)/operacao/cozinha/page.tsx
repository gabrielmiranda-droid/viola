import { Panel } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { ChefHat } from "lucide-react";

export default async function CozinhaPage() {
  await requireRole(["admin", "caixa"]);
  return (
    <Panel>
      <SectionHeader eyebrow="Operacao" title="Cozinha" description="Visualizacao de pedidos para a cozinha." />
      <EmptyState icon={<ChefHat className="h-5 w-5" />} title="Em breve" description="Esta tela esta sendo desenvolvida." />
    </Panel>
  );
}
