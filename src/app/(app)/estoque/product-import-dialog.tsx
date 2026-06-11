"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardPaste, Upload, X, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  parseProductImport,
  productImportKey,
  type ImportedProduct,
} from "@/lib/product-import";
import { money } from "@/lib/format";
import type { Product } from "@/lib/types";
import { importProductsAction } from "./actions";

type ImportResult = {
  identified: number;
  imported: number;
  existing: number;
  repeated: number;
  archived: number;
  failed: number;
  errors: string[];
};

type PreviewStatus = "new" | "existing" | "repeated";

export function ProductImportDialog({ products }: { products: Product[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [open, pending]);

  const parsed = useMemo(() => parseProductImport(text), [text]);
  const existingKeys = useMemo(
    () => new Set(products.map((product) => productImportKey(product))),
    [products],
  );
  const preview = useMemo(() => {
    const seen = new Set<string>();
    return parsed.products.map((product) => {
      const key = productImportKey(product);
      let status: PreviewStatus = "new";
      if (existingKeys.has(key)) status = "existing";
      else if (seen.has(key)) status = "repeated";
      seen.add(key);
      return { ...product, status };
    });
  }, [existingKeys, parsed.products]);
  const existingCount = preview.filter((product) => product.status === "existing").length;
  const repeatedCount = preview.filter((product) => product.status === "repeated").length;
  const importableCount = preview.filter((product) => product.status === "new").length;
  const replacementCount = preview.length - repeatedCount;

  function closeDialog() {
    if (pending) return;
    setOpen(false);
  }

  function importProducts() {
    setResult(null);
    startTransition(async () => {
      const response = await importProductsAction(
        parsed.products.map(({ name, category, sale_price }) => ({
          name,
          category,
          sale_price,
        })),
        replaceExisting,
      );

      setResult(response.data ?? {
        identified: parsed.products.length,
        imported: 0,
        existing: existingCount,
        repeated: repeatedCount,
        archived: 0,
        failed: replaceExisting ? replacementCount : importableCount,
        errors: response.message ? [response.message] : [],
      });
      showToast({
        title: response.ok ? "Produtos importados" : "Importacao nao concluida",
        message: response.message,
        tone: response.ok ? "success" : "danger",
      });

      if ((response.data?.imported ?? 0) > 0 || replaceExisting && response.ok) {
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button ref={triggerRef} variant="secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Importar Produtos
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-import-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-line p-4">
              <div>
                <h2 id="product-import-title" className="text-lg font-black">
                  Importar Produtos
                </h2>
                <p className="text-sm text-muted">
                  Aceita Produto | preco ou produto e preco em linhas separadas.
                </p>
              </div>
              <Button
                ref={closeRef}
                variant="ghost"
                size="sm"
                onClick={closeDialog}
                aria-label="Fechar importacao"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <ClipboardPaste className="h-4 w-4 text-accent" />
                  <h3 className="font-bold">Lista para importar</h3>
                </div>
                <Textarea
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setResult(null);
                  }}
                  className="min-h-80 resize-y font-mono text-sm"
                  placeholder={"\u{1F354} Hamburgueres\nX Burguer | 20\nX Salada | 22,50"}
                  disabled={pending}
                />
                <p className="mt-2 text-xs text-muted">
                  Tambem aceita dois valores como R$15 / R$23 para criar P(H) e P(MF).
                </p>

                <div className="mt-4 space-y-3 rounded-lg border border-line bg-panel-strong p-3">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={replaceExisting}
                      onChange={(event) => {
                        setReplaceExisting(event.target.checked);
                        setReplaceConfirmed(false);
                        setResult(null);
                      }}
                      disabled={pending}
                    />
                    <span>
                      <strong className="block text-white">Substituir o cardapio atual</strong>
                      Arquiva os produtos que nao estiverem na lista nova e remove suas categorias do caixa.
                    </span>
                  </label>

                  {replaceExisting ? (
                    <label className="flex items-start gap-3 rounded-md border border-amber-400/25 bg-amber-400/8 p-3 text-sm text-amber-100">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={replaceConfirmed}
                        onChange={(event) => setReplaceConfirmed(event.target.checked)}
                        disabled={pending}
                      />
                      <span>
                        <AlertTriangle className="mr-1 inline h-4 w-4" />
                        Confirmo que esta lista sera o cardapio completo deste trailer.
                      </span>
                    </label>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">Previa</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{preview.length} identificado(s)</Badge>
                    <Badge variant="success">{importableCount} novo(s)</Badge>
                    {existingCount ? (
                      <Badge variant="info">{existingCount} ja cadastrado(s)</Badge>
                    ) : null}
                    {repeatedCount ? (
                      <Badge variant="warning">{repeatedCount} repetido(s)</Badge>
                    ) : null}
                  </div>
                </div>

                {parsed.errors.length ? (
                  <div className="mb-3 rounded-lg border border-red-400/25 bg-red-400/8 p-3 text-sm text-red-200">
                    {parsed.errors.map((error) => <p key={error}>{error}</p>)}
                  </div>
                ) : null}

                <div className="max-h-96 overflow-auto rounded-lg border border-line">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="sticky top-0 bg-panel-strong text-xs text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Produto</th>
                        <th className="px-3 py-2 font-semibold">Categoria</th>
                        <th className="px-3 py-2 font-semibold">Preco</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {preview.length ? preview.map((product, index) => (
                        <PreviewRow
                          key={`${productImportKey(product)}-${index}`}
                          product={product}
                          replaceExisting={replaceExisting}
                        />
                      )) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-10 text-center text-muted">
                            Cole a lista para gerar a previa.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {result ? (
                  <div className="mt-3 rounded-lg border border-line bg-panel-strong p-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{result.identified} identificado(s)</Badge>
                      <Badge variant="success">{result.imported} importado(s)</Badge>
                      <Badge variant="info">{result.existing} ja cadastrado(s)</Badge>
                      <Badge variant="warning">{result.repeated} repetido(s)</Badge>
                      {result.archived ? (
                        <Badge variant="neutral">{result.archived} arquivado(s)</Badge>
                      ) : null}
                      {result.failed ? (
                        <Badge variant="danger">{result.failed} com falha</Badge>
                      ) : null}
                    </div>
                    {result.errors.length ? (
                      <div className="mt-2 text-sm text-red-200">
                        {result.errors.map((error) => <p key={error}>{error}</p>)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
              <p className="text-sm text-muted">
                {replaceExisting
                  ? "Itens iguais sao reaproveitados e recebem o preco informado na lista."
                  : "Os produtos entram ativos e ja com o preco de venda informado."}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={closeDialog} disabled={pending}>
                  Fechar
                </Button>
                <Button
                  variant="success"
                  onClick={importProducts}
                  disabled={
                    pending
                    || parsed.errors.length > 0
                    || (replaceExisting
                      ? !replacementCount || !replaceConfirmed
                      : !importableCount)
                  }
                >
                  {pending
                    ? "Importando..."
                    : replaceExisting
                      ? `Substituir por ${replacementCount} produto(s)`
                      : `Importar ${importableCount} produto(s)`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PreviewRow({
  product,
  replaceExisting,
}: {
  product: ImportedProduct & { status: PreviewStatus };
  replaceExisting: boolean;
}) {
  return (
    <tr className={product.status === "new" ? undefined : "text-muted"}>
      <td className="px-3 py-2 font-medium">{product.name}</td>
      <td className="px-3 py-2">{product.category}</td>
      <td className="whitespace-nowrap px-3 py-2">{money(product.sale_price)}</td>
      <td className="px-3 py-2">
        {product.status === "existing" ? (
          <span className="inline-flex items-center gap-1 text-blue-200">
            <CheckCircle2 className="h-4 w-4" />
            {replaceExisting ? "Preco sera atualizado" : "Ja cadastrado"}
          </span>
        ) : product.status === "repeated" ? (
          <span className="inline-flex items-center gap-1 text-amber-200">
            <XCircle className="h-4 w-4" />
            Repetido na lista
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            Novo
          </span>
        )}
      </td>
    </tr>
  );
}
