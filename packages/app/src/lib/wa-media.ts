/** Resolves a WhatsApp media id to its bytes via the two-step Graph API media flow. */
export async function downloadWhatsAppMedia(
  accessToken: string,
  mediaId: string
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!fileRes.ok) return null;
  return { bytes: await fileRes.arrayBuffer(), mimeType: meta.mime_type ?? "application/octet-stream" };
}
