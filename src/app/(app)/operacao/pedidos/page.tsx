import { Panel } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { ClipboardList } from "lucide-react";

export default async function PedidosPage() {
  await requireRole(["admin", "caixa"]);
  return (
    <Panel>
      <SectionHeader eyebrow="Operacao" title="Pedidos" description="Acompanhamento de pedidos em aberto." />
      <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="Em breve" description="Esta tela esta sendo desenvolvida." />
    </Panel>
  );
}
