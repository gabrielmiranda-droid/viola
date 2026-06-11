"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel>
      <Card className="mx-auto max-w-xl text-center">
        <h1 className="text-xl font-black">Nao foi possivel carregar os dados</h1>
        <p className="mt-2 text-sm text-muted">
          O sistema evitou mostrar valores incompletos. Tente novamente em alguns segundos.
        </p>
        <Button className="mt-4" onClick={reset}>
          Tentar novamente
        </Button>
      </Card>
    </Panel>
  );
}
