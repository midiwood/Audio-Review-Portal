import { getSessionUser, isLabelAccount } from "@/lib/auth";
import { saveOptionalAvatar, removeAvatarFile } from "@/lib/avatar-server";
import { findUserById, updateLabelBranding } from "@/lib/data";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError("Unauthorized", 401);
  if (!isLabelAccount(session)) return jsonError("Only label accounts can edit branding", 403);

  const form = await request.formData();
  const labelName = String(form.get("labelName") ?? "");
  const clearLogo = String(form.get("clearLogo") ?? "") === "1";

  const current = findUserById(session.userId);
  if (!current) return jsonError("Not found", 404);

  let labelLogoFilename: string | null | undefined = undefined;
  try {
    const uploaded = await saveOptionalAvatar(form.get("logo"));
    if (uploaded) {
      removeAvatarFile(current.labelLogoFilename);
      labelLogoFilename = uploaded;
    } else if (clearLogo) {
      removeAvatarFile(current.labelLogoFilename);
      labelLogoFilename = null;
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid logo image");
  }

  const user = updateLabelBranding(session.userId, {
    labelName,
    ...(labelLogoFilename !== undefined ? { labelLogoFilename } : {}),
  });
  if (!user) return jsonError("Not found", 404);
  return Response.json({ user });
}
