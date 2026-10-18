import { compressImage } from "./compress-image";
import { BILL_ACCEPT, MAX_BILL_PDF_BYTES } from "./service-shared";

export { BILL_ACCEPT };
export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Client-side: shrink a photo on the phone (kept legible for paperwork) or pass a PDF through. Throws a readable message. */
export async function prepareDocFile(file: File): Promise<{ body: Blob; name: string }> {
  let body: Blob;
  let name: string;
  if (isPdf(file)) {
    if (file.size > MAX_BILL_PDF_BYTES) throw new Error(`${file.name}: PDFs can be up to ${MAX_BILL_PDF_BYTES / 1024 / 1024} MB`);
    body = file;
    name = "bill.pdf";
  } else {
    body = await compressImage(file, { maxSide: 2200, targetBytes: 500 * 1024 }); // receipts need more detail than car photos
    name = "bill.jpg";
  }
  return { body, name };
}

async function post(url: string, file: File): Promise<void> {
  const { body, name } = await prepareDocFile(file);
  const fd = new FormData();
  fd.set("file", body, name);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Upload failed");
}

export const uploadServiceBill = (recordId: string, file: File) => post(`/api/service-records/${recordId}/bills`, file);
export const uploadVehicleDoc = (documentId: string, file: File) => post(`/api/vehicle-documents/${documentId}/files`, file);
