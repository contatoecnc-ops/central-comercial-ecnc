"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CATALOG_BUCKET, checkCatalogImage } from "@/lib/catalog-files";
import { fileExt } from "@/lib/manual-files";

/** Envia a foto direto do navegador ao bucket público "catalogo" ({machine_id}/{uuid}.{ext}) e devolve a URL pública. */
export function CatalogImageUpload({
  machineId,
  onUploaded,
}: {
  machineId: string;
  onUploaded: (url: string, fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(file: File) {
    const check = checkCatalogImage(file);
    if ("error" in check) return void toast.error(check.error);

    setBusy(true);
    const supabase = createClient();
    const path = `${machineId}/${crypto.randomUUID()}.${fileExt(file.name)}`;
    const { error } = await supabase.storage.from(CATALOG_BUCKET).upload(path, file, {
      contentType: check.mime,
      upsert: false,
    });
    setBusy(false);
    if (error) return void toast.error("Não foi possível enviar a imagem.");
    onUploaded(supabase.storage.from(CATALOG_BUCKET).getPublicUrl(path).data.publicUrl, file.name);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onPick(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" disabled={busy} onClick={() => inputRef.current?.click()}>
        <ImagePlus size={14} /> {busy ? "Enviando..." : "Enviar imagem"}
      </Button>
    </>
  );
}
