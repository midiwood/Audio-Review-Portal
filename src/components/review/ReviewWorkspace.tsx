"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DeliveryPanel } from "@/components/DeliveryPanel";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { NotificationBell, WORKSPACE_REFRESH_EVENT } from "@/components/NotificationBell";
import { CommentPanel } from "@/components/comments/CommentPanel";
import { WaveformPlayer } from "@/components/player/WaveformPlayer";
import { useTrackPlayback } from "@/components/player/useTrackPlayback";
import { ReferenceList } from "@/components/references/ReferenceList";
import { StatusBadge, StatusDropdown } from "@/components/StatusBadge";
import { TrackDropZone, type DroppedUploadItem } from "@/components/TrackDropZone";
import { TrackEditMenu } from "@/components/TrackEditMenu";
import { audioUrl } from "@/lib/audio-format";
import { attachPlaybackFile } from "@/lib/ffmpeg-swarm";
import { spacesEnabled, uploadDeliveriesToSpaces, uploadVersionToSpaces } from "@/lib/upload-client";
import type { ComposerDto, DeliveryKind, ProjectDto, TrackDto, VersionStatus, WorkspaceMode } from "@/lib/types";

type Props = {
  mode: WorkspaceMode;
  project: ProjectDto;
  shareToken?: string;
  ownerName?: string;
  userId?: string;
  avatarUrl?: string | null;
  initialTrackId?: string;
};

function AccountSidebarFooter({
  name,
  avatarUrl,
  isAdmin,
}: {
  name?: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}) {
  const initial = (name ?? "P").slice(0, 1).toUpperCase();
  return (
    <nav className="mt-auto shrink-0 space-y-1 border-t border-line px-3 py-3">
      {isAdmin && (
        <a href="/storage" className="block rounded-md px-2 py-1.5 text-sm text-mute hover:bg-surface-2 hover:text-ink">
          Storage
        </a>
      )}
      <a href="/profile" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-mute hover:bg-surface-2 hover:text-ink">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs text-ink">
            {initial}
          </span>
        )}
        Profile
      </a>
    </nav>
  );
}

export function ReviewWorkspace({ mode, project: initial, shareToken, ownerName, userId, avatarUrl, initialTrackId }: Props) {
  const [project, setProject] = useState(initial);
  const [trackId, setTrackId] = useState(
    initialTrackId && initial.tracks.some((t) => t.id === initialTrackId)
      ? initialTrackId
      : initial.tracks[0]?.id ?? "",
  );
  const [versionId, setVersionId] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [seekNonce, setSeekNonce] = useState(0);
  const [reviewerName, setReviewerName] = useState(mode === "reviewer" ? "" : ownerName ?? "Studio");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"share" | "invite" | "">("");
  const [composerFilter, setComposerFilter] = useState<string | null>(null);
  const [inviteable, setInviteable] = useState<ComposerDto[]>([]);
  const [editingComposers, setEditingComposers] = useState(false);
  const [addingComposer, setAddingComposer] = useState(false);
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const versionFileRef = useRef<HTMLInputElement>(null);

  const isAdmin = mode === "admin";
  const isComposer = mode === "composer";
  const isReviewer = mode === "reviewer";
  const canComment = isAdmin || isReviewer;
  const canSeeComments = isAdmin || isComposer || isReviewer;
  const composerIds = useMemo(() => new Set(project.composers.map((item) => item.id)), [project.composers]);

  const tracksForPerson = (list: TrackDto[], personId: string | null) => {
    if (!personId) return list;
    if (personId === project.ownerId) {
      return list.filter((item) => !item.composerId || item.composerId === project.ownerId);
    }
    return list.filter((item) => item.composerId === personId);
  };

  function ownsTrack(item: { composerId: string | null } | undefined) {
    if (!item || isReviewer || !userId) return false;
    const ownerId = item.composerId ?? project.ownerId;
    return ownerId === userId;
  }

  const visibleTracks = isAdmin ? tracksForPerson(project.tracks, composerFilter) : project.tracks;
  const visibleArchivedTracks = isAdmin
    ? tracksForPerson(project.archivedTracks ?? [], composerFilter)
    : (project.archivedTracks ?? []);
  const ownedArchivedTracks = visibleArchivedTracks.filter((item) => ownsTrack(item));
  const track = visibleTracks.find((t) => t.id === trackId) ?? visibleTracks[0];
  const versions = track?.versions ?? [];

  function trackBadgeStatus(item: TrackDto): VersionStatus | null {
    const latest = item.versions.at(-1);
    if (!latest) return null;
    const hasComment = latest.comments.length > 0;
    if (!hasComment && latest.status === "in_progress") {
      const composerOwned = Boolean(item.composerId && composerIds.has(item.composerId));
      if (composerOwned || isComposer) return "review_requested";
    }
    return latest.status;
  }

  const isOwnTrack = ownsTrack(track);
  const isApproved = track?.versions.at(-1)?.status === "approved";
  const canEditTitle = isOwnTrack;
  const canAddVersion = isOwnTrack && !isApproved;
  const canEditReference = isOwnTrack;
  const canUploadDeliveries = isOwnTrack && !isReviewer;
  const canAddTracks = isComposer || (isAdmin && composerFilter === project.ownerId);
  const showingAllComposers = isAdmin && composerFilter === null;
  const versionTargets = useMemo(
    () =>
      visibleTracks
        .filter((t) => ownsTrack(t) && t.versions.at(-1)?.status !== "approved")
        .map((t) => ({ id: t.id, title: t.title })),
    [visibleTracks, isComposer, isAdmin, isReviewer, userId, composerIds],
  );
  const showDropZone = canAddTracks || versionTargets.length > 0;

  useEffect(() => {
    setProject(initial);
  }, [initial]);

  useEffect(() => {
    if (!isAdmin) return;
    void fetch(`/api/projects/${project.id}/members`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) setInviteable(data.composers ?? []);
      })
      .catch(() => setInviteable([]));
  }, [isAdmin, project.id, project.composers]);

  useEffect(() => {
    if (!isReviewer) return;
    const saved = localStorage.getItem("arp-reviewer-name");
    if (saved) setReviewerName(saved);
  }, [isReviewer]);

  useEffect(() => {
    if (isReviewer && reviewerName.trim()) {
      localStorage.setItem("arp-reviewer-name", reviewerName.trim());
    }
  }, [isReviewer, reviewerName]);

  useEffect(() => {
    if (!track) {
      setVersionId("");
      return;
    }
    setVersionId((current) => {
      if (current && track.versions.some((v) => v.id === current)) return current;
      return track.versions.at(-1)?.id ?? "";
    });
  }, [track]);

  const version = versions.find((v) => v.id === versionId) ?? versions.at(-1);
  const { clips, converting } = useTrackPlayback(track?.id, versions, shareToken, versionId);
  const playerClips = useMemo(
    () =>
      clips.map((clip) => ({
        ...clip,
        comments: canSeeComments
          ? (versions.find((item) => item.id === clip.id)?.comments ?? []).filter((comment) => !comment.resolved)
          : [],
      })),
    [clips, versions, canSeeComments],
  );

  function selectTrack(id: string) {
    if (id !== trackId) {
      setPlayhead(0);
      setKeepPlaying(false);
    }
    setTrackId(id);
  }

  function markVersionHeard(heardId: string) {
    if (!isAdmin) return;
    const pending = project.tracks.some((item) => item.versions.some((row) => row.id === heardId && row.unread));
    if (!pending) return;
    setProject((current) => ({
      ...current,
      tracks: current.tracks.map((item) => {
        if (!item.versions.some((row) => row.id === heardId && row.unread)) return item;
        const nextVersions = item.versions.map((row) => (row.id === heardId ? { ...row, unread: false } : row));
        return { ...item, versions: nextVersions, unread: nextVersions.some((row) => row.unread) };
      }),
    }));
    void fetch(`/api/versions/${heardId}/seen`, { method: "POST" });
  }

  async function reload() {
    const url = isReviewer ? `/api/r/${shareToken}` : `/api/projects/${project.id}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to reload");
    setProject(data.project);
  }

  useEffect(() => {
    if (isReviewer) return;
    const projectId = project.id;
    function onWorkspaceRefresh(event: Event) {
      const detail = (event as CustomEvent<{ notifications?: { projectId: string }[] }>).detail;
      const arrived = detail?.notifications ?? [];
      if (arrived.length > 0 && !arrived.some((item) => item.projectId === projectId)) return;
      const url = `/api/projects/${projectId}`;
      void fetch(url)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) return;
          setProject(data.project);
        })
        .catch(() => undefined);
    }
    window.addEventListener(WORKSPACE_REFRESH_EVENT, onWorkspaceRefresh);
    return () => window.removeEventListener(WORKSPACE_REFRESH_EVENT, onWorkspaceRefresh);
  }, [project.id, isReviewer]);

  async function copy(kind: "share" | "invite") {
    const path = kind === "share" ? `/r/${project.shareToken}` : `/join/${project.inviteToken}`;
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(kind);
    setTimeout(() => setCopied(""), 1500);
  }

  async function uploadVersionToTrack(targetTrackId: string, file: File) {
    if (await spacesEnabled()) {
      const json = await uploadVersionToSpaces({
        file,
        projectId: project.id,
        trackId: targetTrackId,
        onStatus: setBusyLabel,
      });
      return { trackId: json.trackId, versionId: json.version.id };
    }
    const data = new FormData();
    data.set("projectId", project.id);
    data.set("trackId", targetTrackId);
    setBusyLabel(`Converting ${file.name} to MP3…`);
    await attachPlaybackFile(data, file, (ratio) => {
      setBusyLabel(`Converting ${file.name} to MP3… ${Math.round(ratio * 100)}%`);
    });
    setBusyLabel("Uploading version…");
    const res = await fetch("/api/upload", { method: "POST", body: data });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Upload failed");
    return { trackId: targetTrackId, versionId: json.version.id as string };
  }

  async function uploadDroppedItems(items: DroppedUploadItem[]) {
    if (items.length === 0) return;
    setBusy(true);
    setError("");
    let lastTrackId = trackId;
    let lastVersionId = versionId;
    const versionTargetIds = new Set(versionTargets.map((t) => t.id));
    try {
      for (const item of items) {
        if (item.kind === "version") {
          if (!versionTargetIds.has(item.trackId)) throw new Error("That track cannot accept a new version");
          const out = await uploadVersionToTrack(item.trackId, item.file);
          lastTrackId = out.trackId;
          lastVersionId = out.versionId;
          continue;
        }
        if (!canAddTracks) throw new Error("Cannot add new tracks here");
        if (await spacesEnabled()) {
          const json = await uploadVersionToSpaces({
            file: item.file,
            projectId: project.id,
            title: item.title,
            onStatus: setBusyLabel,
          });
          lastTrackId = json.trackId;
          lastVersionId = json.version.id;
          continue;
        }
        const data = new FormData();
        data.set("projectId", project.id);
        data.set("title", item.title);
        setBusyLabel(`Converting ${item.title} to MP3…`);
        await attachPlaybackFile(data, item.file, (ratio) => {
          setBusyLabel(`Converting ${item.title} to MP3… ${Math.round(ratio * 100)}%`);
        });
        setBusyLabel(`Uploading ${item.title}…`);
        const res = await fetch("/api/upload", { method: "POST", body: data });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        lastTrackId = json.trackId;
        lastVersionId = json.version.id;
      }
      await reload();
      setPlayhead(0);
      setKeepPlaying(false);
      setTrackId(lastTrackId);
      setVersionId(lastVersionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      await reload();
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function saveTrackTitle(id: string, currentTitle: string, title: string) {
    const next = title.trim();
    if (!next || next === currentTitle) return;
    const res = await fetch(`/api/tracks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not rename track");
      return;
    }
    await reload();
  }

  async function addVersion(file: File) {
    if (!track || !canAddVersion) return;
    setBusy(true);
    setError("");
    try {
      const out = await uploadVersionToTrack(track.id, file);
      await reload();
      setVersionId(out.versionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function uploadDeliveries(kind: DeliveryKind, files: File[]) {
    if (!track || !canUploadDeliveries) return;
    setBusy(true);
    setError("");
    try {
      if (await spacesEnabled()) {
        await uploadDeliveriesToSpaces({
          trackId: track.id,
          kind,
          files,
          onStatus: setBusyLabel,
        });
        await reload();
        return;
      }
      const data = new FormData();
      data.set("trackId", track.id);
      data.set("kind", kind);
      for (const file of files) data.append("file", file);
      setBusyLabel(`Uploading ${kind === "final" ? "finals" : "stems"}…`);
      const res = await fetch("/api/deliveries", { method: "POST", body: data });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function trashDelivery(id: string) {
    if (!confirm("Remove this file?")) return;
    const res = await fetch(`/api/deliveries/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not remove file");
      return;
    }
    await reload();
  }

  async function setStatus(status: VersionStatus) {
    if (!version || !isAdmin) return;
    const res = await fetch(`/api/versions/${version.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await reload();
  }

  async function saveNotes(notes: string) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    await reload();
  }

  async function saveProjectName(currentName: string, name: string) {
    const next = name.trim();
    if (!next || next === currentName) return;
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not rename project");
      return;
    }
    await reload();
  }

  async function addComment(body: string, parentId?: string) {
    if (!version) return;
    if (!parentId && !canComment) return;
    if (parentId && !canComment && !isComposer) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/versions/${version.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: reviewerName.trim(),
          body,
          timestampSeconds: playhead,
          parentId,
          token: shareToken,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not comment");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not comment");
    } finally {
      setBusy(false);
    }
  }

  async function resolveComment(id: string, resolved: boolean) {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved, token: shareToken }),
    });
    if (res.ok) await reload();
  }

  async function editComment(id: string, body: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          authorName: reviewerName.trim(),
          token: shareToken,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not edit comment");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not edit comment");
    } finally {
      setBusy(false);
    }
  }

  async function deleteComment(id: string) {
    if (!confirm("Delete this comment?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: reviewerName.trim(),
          token: shareToken,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not delete comment");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete comment");
    } finally {
      setBusy(false);
    }
  }

  async function addExistingComposer(userId: string) {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add composer");
      setAddingComposer(false);
      setInviteable(json.composers ?? []);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add composer");
    } finally {
      setBusy(false);
    }
  }

  async function removeComposer(composer: ComposerDto) {
    if (!confirm(`Remove ${composer.name} from this project? Their tracks stay with them and will no longer show here.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: composer.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not remove composer");
      if (composerFilter === composer.id) setComposerFilter(null);
      setInviteable(json.composers ?? []);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove composer");
    } finally {
      setBusy(false);
    }
  }

  async function trashTrack(id: string, title: string) {
    if (!confirm(`Move “${title}” to trash?`)) return;
    const res = await fetch(`/api/tracks/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not move track to trash");
      return;
    }
    if (trackId === id) setTrackId("");
    await reload();
  }

  async function restoreTrack(id: string) {
    const res = await fetch(`/api/tracks/${id}/restore`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not restore track");
      return;
    }
    await reload();
  }

  async function purgeTrack(id: string, title: string) {
    if (!confirm(`Permanently delete “${title}”? This cannot be undone.`)) return;
    const res = await fetch(`/api/tracks/${id}/purge`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not delete track");
      return;
    }
    await reload();
  }

  async function emptyTrash() {
    const count = ownedArchivedTracks.length;
    if (!count) return;
    if (!confirm(`Permanently delete ${count} track${count === 1 ? "" : "s"} from trash? This cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/projects/${project.id}/trash`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not empty trash");
      return;
    }
    await reload();
  }

  async function trashVersion(trackItem: TrackDto, id: string) {
    const item = trackItem.versions.find((row) => row.id === id);
    if (!item) return;
    if (trackItem.versions.length < 2) {
      setError("Delete the track to remove the last version");
      return;
    }
    if (!confirm(`Delete v${item.versionNumber} of “${trackItem.title}”?`)) return;
    const res = await fetch(`/api/versions/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not delete version");
      return;
    }
    await reload();
  }

  async function addReference(url: string, title: string) {
    if (!track || !canEditReference) return;
    const res = await fetch("/api/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: track.id, url, title }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not add reference");
      return;
    }
    await reload();
  }

  async function removeReference(id: string) {
    if (!canEditReference) return;
    await fetch(`/api/references/${id}`, { method: "DELETE" });
    await reload();
  }

  async function persistDuration(seconds: number) {
    if (!version) return;
    await fetch(`/api/versions/${version.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationSeconds: seconds, token: shareToken }),
    });
  }

  const needsName = isReviewer && !reviewerName.trim();

  return (
    <div className="flex min-h-dvh flex-col bg-bg min-[880px]:h-dvh">
      {needsName && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <form
            className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              if (name) setReviewerName(name);
            }}
          >
            <h2 className="text-lg font-medium">Your name</h2>
            <p className="text-sm text-mute">Comments are attributed to this name. No account needed.</p>
            <input
              name="name"
              autoFocus
              placeholder="Name"
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brass"
            />
            <button type="submit" className="w-full rounded-md bg-brass py-2 text-sm font-medium text-bg">
              Continue
            </button>
          </form>
        </div>
      )}

      <header className="shrink-0 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.2em] text-brass uppercase">Audio Review</p>
            {isAdmin ? (
              <input
                key={project.name}
                defaultValue={project.name}
                onBlur={(e) => void saveProjectName(project.name, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="bg-transparent text-lg font-medium outline-none focus:border-b focus:border-brass"
                aria-label="Project title"
              />
            ) : (
              <h1 className="text-lg font-medium">{project.name}</h1>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isReviewer && <NotificationBell />}
            {!isReviewer && (
              <a href="/projects" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-brass">
                All projects
              </a>
            )}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => void copy("invite")}
                  className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-brass"
                >
                  {copied === "invite" ? "Copied" : "Invite"}
                </button>
                <button
                  type="button"
                  onClick={() => void copy("share")}
                  className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-brass"
                >
                  {copied === "share" ? "Copied" : "Share"}
                </button>
                <DeleteProjectButton projectId={project.id} projectName={project.name} />
              </>
            )}
          </div>
        </div>
      </header>

      {error && (
        <p className="border-b border-rose-900 bg-rose-950/40 px-4 py-2 text-sm text-rose-200">{error}</p>
      )}
      {busyLabel && (
        <p className="border-b border-line bg-surface px-4 py-2 text-sm text-mute">{busyLabel}</p>
      )}

      <div
        className={`grid min-h-0 flex-1 ${
          isAdmin
            ? "min-[880px]:grid-cols-[188px_268px_minmax(0,1fr)_300px]"
            : "min-[880px]:grid-cols-[336px_minmax(0,1fr)_300px]"
        }`}
      >
        {isAdmin && (
          <aside className="flex min-h-0 flex-col border-b border-line min-[880px]:border-r min-[880px]:border-b-0">
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
            <section className="space-y-2">
              <div className="flex items-center gap-1">
                <h2 className="min-w-0 flex-1 text-sm font-medium tracking-wide text-mute uppercase">Composers</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingComposers((open) => {
                      if (open) setAddingComposer(false);
                      return !open;
                    });
                  }}
                  className={`rounded-md p-1 ${
                    editingComposers ? "bg-brass-dim text-brass" : "text-mute hover:bg-surface-2 hover:text-ink"
                  }`}
                  aria-label={editingComposers ? "Done editing composers" : "Edit composers"}
                  aria-pressed={editingComposers}
                  title={editingComposers ? "Done" : "Edit"}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
                  </svg>
                </button>
              </div>
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={() => setComposerFilter(null)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      composerFilter === null ? "bg-brass-dim text-brass" : "text-ink hover:bg-surface-2"
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[10px]">All</span>
                    <span className="min-w-0 flex-1 truncate">All</span>
                    {project.tracks.some(
                      (item) =>
                        item.versions.at(-1)?.status === "changes_requested" &&
                        item.composerId &&
                        composerIds.has(item.composerId),
                    ) && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" title="Changes requested" />
                    )}
                    {project.tracks.some((item) => item.unread) && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-brass" title="New version" />
                    )}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setComposerFilter(project.ownerId);
                      const next = tracksForPerson(project.tracks, project.ownerId)[0];
                      if (next) selectTrack(next.id);
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      composerFilter === project.ownerId ? "bg-brass-dim text-brass" : "text-ink hover:bg-surface-2"
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs">S</span>
                    <span className="min-w-0 flex-1 truncate">Studio</span>
                    {tracksForPerson(project.tracks, project.ownerId).some((item) => item.unread) && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-brass" title="New version" />
                    )}
                  </button>
                </li>
                {project.composers.map((composer) => (
                  <li key={composer.id} className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setComposerFilter(composer.id);
                        const next = tracksForPerson(project.tracks, composer.id)[0];
                        if (next) selectTrack(next.id);
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        composerFilter === composer.id ? "bg-brass-dim text-brass" : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      {composer.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={composer.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs">
                          {composer.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{composer.name}</span>
                      {tracksForPerson(project.tracks, composer.id).some((item) => item.versions.at(-1)?.status === "changes_requested") && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" title="Changes requested" />
                      )}
                      {tracksForPerson(project.tracks, composer.id).some((item) => item.unread) && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-brass" title="New version" />
                      )}
                    </button>
                    {editingComposers && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeComposer(composer)}
                        className="shrink-0 rounded-md px-1.5 py-1 text-sm leading-none text-mute hover:text-rose-300 disabled:opacity-40"
                        aria-label={`Remove ${composer.name}`}
                        title="Remove from project"
                      >
                        −
                      </button>
                    )}
                  </li>
                ))}
                {editingComposers && (
                  <li className="space-y-1">
                    {addingComposer ? (
                      <ul className="overflow-hidden rounded-md border border-line bg-bg">
                        {inviteable.length === 0 ? (
                          <li className="px-2 py-1.5 text-xs text-mute">None left</li>
                        ) : (
                          inviteable.map((composer) => (
                            <li key={composer.id}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void addExistingComposer(composer.id)}
                                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-40"
                              >
                                {composer.avatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={composer.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                                ) : (
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[10px]">
                                    {composer.name.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                                <span className="min-w-0 flex-1 truncate">{composer.name}</span>
                              </button>
                            </li>
                          ))
                        )}
                        <li>
                          <button
                            type="button"
                            onClick={() => setAddingComposer(false)}
                            className="w-full border-t border-line px-2 py-1 text-xs text-mute hover:text-ink"
                          >
                            Cancel
                          </button>
                        </li>
                      </ul>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || inviteable.length === 0}
                        onClick={() => setAddingComposer(true)}
                        className="flex w-full items-center justify-center rounded-md px-2 py-1.5 text-mute hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                        aria-label="Add composer"
                        title={inviteable.length ? "Add composer" : "No composers left to add"}
                      >
                        <span className="text-base leading-none">+</span>
                      </button>
                    )}
                  </li>
                )}
              </ul>
            </section>

            <form
              className="space-y-2"
              onBlur={(e) => {
                const notes = (e.currentTarget.elements.namedItem("notes") as HTMLTextAreaElement)?.value;
                if (notes !== project.notes) void saveNotes(notes ?? "");
              }}
            >
              <label className="text-sm font-medium tracking-wide text-mute uppercase">Notes</label>
              <textarea
                name="notes"
                defaultValue={project.notes}
                rows={3}
                placeholder="Notes…"
                className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
              />
            </form>
            </div>
            <AccountSidebarFooter name={ownerName} avatarUrl={avatarUrl} isAdmin />
          </aside>
        )}

        <aside className="flex min-h-0 flex-col border-b border-line min-[880px]:border-r min-[880px]:border-b-0">
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          {!isAdmin && project.notes && <p className="text-sm text-mute">{project.notes}</p>}

          <section className="space-y-2">
            <h2 className="text-sm font-medium tracking-wide text-mute uppercase">Tracks</h2>
            <ul className="space-y-1">
              {visibleTracks.map((item) => {
                const badge = trackBadgeStatus(item);
                return (
                  <li key={item.id} className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => selectTrack(item.id)}
                      className={`min-w-0 flex-1 rounded-md px-3 py-2 text-left text-sm ${
                        item.id === track?.id ? "bg-brass-dim text-brass" : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate" title={item.title}>
                          {item.title}
                        </span>
                        {isAdmin && item.unread && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-brass" title="New version" />
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-mute">
                        <span className="min-w-0 flex-1 truncate">
                          {showingAllComposers ? `${item.composerName} · ` : ""}
                          v{item.versions.length}
                        </span>
                        {(isAdmin || isComposer) && badge && <StatusBadge status={badge} compact />}
                      </span>
                    </button>
                    {ownsTrack(item) && (
                      <TrackEditMenu
                        title={item.title}
                        versions={item.versions.map((row) => ({ id: row.id, versionNumber: row.versionNumber }))}
                        canDelete
                        onRename={(title) => saveTrackTitle(item.id, item.title, title)}
                        onDelete={() => void trashTrack(item.id, item.title)}
                        onDeleteVersion={(id) => void trashVersion(item, id)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {showDropZone && (
              <TrackDropZone
                disabled={busy}
                versionTargets={versionTargets}
                defaultVersionTrackId={canAddVersion ? track?.id : undefined}
                onUpload={uploadDroppedItems}
              />
            )}
          </section>

          {!isReviewer && visibleArchivedTracks.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium tracking-wide text-mute uppercase">Trash</h2>
                {ownedArchivedTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void emptyTrash()}
                    disabled={busy}
                    className="rounded-md px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                  >
                    Empty trash
                  </button>
                )}
              </div>
              <ul className="space-y-1">
                {visibleArchivedTracks.map((item) => (
                  <li key={item.id} className="flex items-center gap-0.5">
                    <div className="min-w-0 flex-1 rounded-md px-3 py-2 text-sm text-mute">
                      <span className="block truncate" title={item.title}>
                        {item.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs">
                        {showingAllComposers ? `${item.composerName} · ` : ""}
                        v{item.versions.length}
                      </span>
                    </div>
                    {ownsTrack(item) && (
                      <>
                        <button
                          type="button"
                          aria-label={`Restore ${item.title}`}
                          onClick={() => void restoreTrack(item.id)}
                          className="shrink-0 rounded-md p-1.5 text-mute hover:bg-surface-2 hover:text-brass"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                            <path d="M12.5 8c-2.65 0-5.05 1.04-6.86 2.74L3 8v9h9l-3.62-3.62c1.27-.99 2.87-1.58 4.62-1.58 3.86 0 7 3.14 7 7h2c0-5.52-4.48-10-10-10z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Permanently delete ${item.title}`}
                          onClick={() => void purgeTrack(item.id, item.title)}
                          className="shrink-0 rounded-md p-1.5 text-mute hover:bg-rose-950/40 hover:text-rose-300"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                          </svg>
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          </div>
          {isComposer && <AccountSidebarFooter name={ownerName} avatarUrl={avatarUrl} />}
        </aside>

        <section className="min-w-0 space-y-5 overflow-y-auto p-5">
          {!version && <p className="text-sm text-mute">{showDropZone ? "Drop audio to start." : "No audio yet."}</p>}
          {version && track && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {canEditTitle ? (
                  <input
                    key={track.id}
                    defaultValue={track.title}
                    onBlur={(e) => void saveTrackTitle(track.id, track.title, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="mr-2 max-w-xs min-w-[8rem] bg-transparent text-lg font-medium outline-none focus:border-b focus:border-brass"
                    aria-label="Track title"
                  />
                ) : (
                  <h2 className="mr-2 text-lg font-medium">{track.title}</h2>
                )}
                {versions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVersionId(item.id)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      item.id === version.id ? "bg-brass text-bg" : "border border-line text-mute hover:text-ink"
                    }`}
                  >
                    v{item.versionNumber}
                    {isAdmin && item.unread ? " · new" : ""}
                  </button>
                ))}
                {canAddVersion && (
                  <>
                    <input
                      ref={versionFileRef}
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      aria-label="New version audio file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void addVersion(file);
                      }}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => versionFileRef.current?.click()}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-line text-mute hover:border-brass hover:text-ink disabled:opacity-40"
                      aria-label="Add version"
                      title="Add version"
                    >
                      +
                    </button>
                  </>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <a
                    href={audioUrl(version.id, shareToken, "download")}
                    download={version.originalFilename}
                    className="inline-flex items-center justify-center rounded-md bg-brass p-1.5 text-bg hover:brightness-110"
                    aria-label={version.status === "approved" ? "Download approved" : "Download"}
                    title={version.status === "approved" ? "Download approved" : "Download"}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                      <path d="M12 3v10.2L8.4 9.6 7 11l5 5 5-5-1.4-1.4-3.6 3.6V3h-2Zm-7 16v2h14v-2H5Z" />
                    </svg>
                  </a>
                  {isAdmin ? (
                    <StatusDropdown
                      status={version.status}
                      disabled={busy}
                      onChange={(status) => void setStatus(status)}
                    />
                  ) : (
                    <StatusBadge status={version.status} />
                  )}
                </div>
              </div>

              <p className="text-xs text-mute">
                {version.originalFilename}
                {isAdmin ? ` · ${track.composerName}` : ""}
                {converting ? " · Preparing versions for instant compare" : ""}
              </p>

              <WaveformPlayer
                clips={playerClips}
                activeId={version.id}
                onTime={setPlayhead}
                seekTo={seekTo}
                seekNonce={seekNonce}
                startAt={playhead}
                autoplay={keepPlaying}
                onPlaying={(playing) => {
                  setKeepPlaying(playing);
                  if (playing) markVersionHeard(version.id);
                }}
                onDuration={(d) => {
                  if (!version.durationSeconds) void persistDuration(d);
                }}
              />

              {isApproved && !isReviewer && (
                <DeliveryPanel
                  trackId={track.id}
                  deliveries={track.deliveries ?? []}
                  canUpload={canUploadDeliveries}
                  canDownloadZip={isAdmin}
                  busy={busy}
                  onUpload={uploadDeliveries}
                  onDelete={trashDelivery}
                />
              )}
            </>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-5 border-t border-line p-4 min-[880px]:overflow-hidden min-[880px]:border-t-0 min-[880px]:border-l">
          {track && (
            <div className="shrink-0">
              <ReferenceList
                references={track.references ?? []}
                canEdit={canEditReference}
                onAdd={canEditReference ? addReference : undefined}
                onRemove={canEditReference ? removeReference : undefined}
              />
            </div>
          )}
          {version && !isAdmin && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium tracking-wide text-mute uppercase">Review</p>
              <StatusBadge status={version.status} />
            </div>
          )}
          {version && canSeeComments && (
            <div className="min-h-[280px] flex-1 min-[880px]:min-h-0">
              <CommentPanel
                comments={version.comments}
                currentTime={playhead}
                authorName={reviewerName}
                currentUserId={userId}
                onAuthorName={isReviewer ? setReviewerName : undefined}
                submitting={busy}
                canAdd={canComment}
                canReply={canComment || isComposer}
                canResolve={isOwnTrack}
                showResolved={isAdmin || isOwnTrack}
                defaultShowChecked={isAdmin && !isOwnTrack}
                onSubmit={addComment}
                onEdit={editComment}
                onDelete={deleteComment}
                onResolve={isOwnTrack ? resolveComment : undefined}
                onJump={(seconds) => {
                  setSeekTo(seconds);
                  setSeekNonce(Date.now());
                }}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
