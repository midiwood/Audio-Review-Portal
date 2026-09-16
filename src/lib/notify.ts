import {
  createNotification,
  findUserById,
  getUsersForEmails,
} from "@/lib/data";
import { STATUS_LABELS } from "@/lib/status";
import type { NotificationType, VersionStatus } from "@/lib/types";

type NotifyPayload = {
  userIds: string[];
  type: NotificationType;
  projectId: string;
  trackId?: string | null;
  versionId?: string | null;
  title: string;
  body?: string;
};

function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

async function sendEmails(payload: NotifyPayload) {
  if (!emailConfigured()) return;
  const recipients = getUsersForEmails(payload.userIds);
  if (recipients.length === 0) return;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY!.trim());
    const from = process.env.EMAIL_FROM!.trim();
    const href = `${appUrl()}/projects/${payload.projectId}${
      payload.trackId ? `?track=${encodeURIComponent(payload.trackId)}` : ""
    }`;
    const text = [payload.body, "", `Open: ${href}`].filter(Boolean).join("\n");

    await Promise.all(
      recipients.map(async (user) => {
        try {
          await resend.emails.send({
            from,
            to: user.email,
            subject: payload.title,
            text,
          });
        } catch (err) {
          console.error("[notify] email failed", user.email, err);
        }
      }),
    );
  } catch (err) {
    console.error("[notify] email dispatch failed", err);
  }
}

export async function notifyUsers(payload: NotifyPayload) {
  const unique = [...new Set(payload.userIds.filter(Boolean))];
  if (unique.length === 0) return;

  for (const userId of unique) {
    createNotification({
      userId,
      type: payload.type,
      projectId: payload.projectId,
      trackId: payload.trackId,
      versionId: payload.versionId,
      title: payload.title,
      body: payload.body,
    });
  }

  await sendEmails({ ...payload, userIds: unique });
}

/** Composer uploaded a new track or version → notify project owner. */
export async function notifyUpload(input: {
  projectId: string;
  projectName: string;
  ownerId: string;
  actorUserId: string;
  trackId: string;
  trackTitle: string;
  versionId: string;
  versionNumber: number;
  isNewTrack: boolean;
}) {
  if (input.actorUserId === input.ownerId) return;
  const actor = findUserById(input.actorUserId);
  const actorName = actor?.name || actor?.email || "Composer";
  const isFirst = input.isNewTrack || input.versionNumber <= 1;
  await notifyUsers({
    userIds: [input.ownerId],
    type: isFirst ? "track" : "version",
    projectId: input.projectId,
    trackId: input.trackId,
    versionId: input.versionId,
    title: isFirst
      ? `${actorName} published “${input.trackTitle}”`
      : `${actorName} published v${input.versionNumber} of “${input.trackTitle}”`,
    body: `${input.projectName} · ready for review`,
  });
}

/** Comment or reply → notify composer + admin (not the author). */
export async function notifyComment(input: {
  projectId: string;
  projectName: string;
  ownerId: string;
  trackId: string;
  trackTitle: string;
  composerId: string | null;
  versionId: string;
  authorUserId: string | null;
  authorName: string;
  body: string;
  isReply: boolean;
}) {
  const recipients = new Set<string>();
  if (input.composerId) recipients.add(input.composerId);
  recipients.add(input.ownerId);
  if (input.authorUserId) recipients.delete(input.authorUserId);

  const snippet = input.body.length > 120 ? `${input.body.slice(0, 117)}…` : input.body;
  await notifyUsers({
    userIds: [...recipients],
    type: "comment",
    projectId: input.projectId,
    trackId: input.trackId,
    versionId: input.versionId,
    title: input.isReply
      ? `${input.authorName} replied on “${input.trackTitle}”`
      : `${input.authorName} commented on “${input.trackTitle}”`,
    body: `${input.projectName} · ${snippet}`,
  });
}

/** Status approved / changes_requested → notify track composer. */
export async function notifyStatusChange(input: {
  projectId: string;
  projectName: string;
  trackId: string;
  trackTitle: string;
  composerId: string | null;
  versionId: string;
  status: VersionStatus;
  actorUserId: string;
}) {
  if (input.status !== "approved" && input.status !== "changes_requested") return;
  const composerId = input.composerId;
  if (!composerId || composerId === input.actorUserId) return;

  await notifyUsers({
    userIds: [composerId],
    type: "status",
    projectId: input.projectId,
    trackId: input.trackId,
    versionId: input.versionId,
    title: `“${input.trackTitle}” is ${STATUS_LABELS[input.status].toLowerCase()}`,
    body: input.projectName,
  });
}
