"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOpenAppShellNav } from "@/components/AppShellNav";
import { DeliveryPanel } from "@/components/DeliveryPanel";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { WORKSPACE_REFRESH_EVENT } from "@/components/NotificationBell";
import { AddCommentFooter, CommentPanel } from "@/components/comments/CommentPanel";
import { WaveformPlayer } from "@/components/player/WaveformPlayer";
import { useTrackPlayback } from "@/components/player/useTrackPlayback";
import { ReferenceList } from "@/components/references/ReferenceList";
import { StatusBadge, StatusDropdown, STUDIO_STATUSES } from "@/components/StatusBadge";
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
  initialTrackId?: string;
  /** When true, fills the app shell main pane instead of the full viewport. */
  embedded?: boolean;
};

export function ReviewWorkspace({
  mode,
  project: initial,
  shareToken,
  ownerName,
  userId,
  initialTrackId,
  embedded = false,
}: Props) {
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
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<null | "tracks" | "comments">(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const openAppNav = useOpenAppShellNav();

  const isAdmin = mode === "admin";
  const isComposer = mode === "composer";
  const isReviewer = mode === "reviewer";
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
    if (item.versions.some((row) => row.status === "approved")) return "approved";
    return item.versions.at(-1)?.status ?? null;
  }

  function defaultVersionIdForTrack(list: { id: string; status: VersionStatus }[]) {
    return list.find((row) => row.status === "approved")?.id ?? list.at(-1)?.id ?? "";
  }

  const isOwnTrack = ownsTrack(track);
  const approvedVersion = track?.versions.find((row) => row.status === "approved");
  const isApproved = Boolean(approvedVersion);
  const canEditTitle = isOwnTrack;
  const canAddVersion = isOwnTrack && !isApproved;
  const canEditReference = isOwnTrack;
  const canUploadDeliveries = isOwnTrack && !isReviewer;
  const canAddTracks = isComposer || (isAdmin && composerFilter === project.ownerId);
  const showingAllComposers = isAdmin && composerFilter === null;
  const filterPerson = useMemo(() => {
    if (!isAdmin || composerFilter == null) return null;
    if (composerFilter === project.ownerId) {
      return { ...project.owner, label: "Studio" as const };
    }
    const composer = project.composers.find((item) => item.id === composerFilter);
    return composer ? { ...composer, label: composer.name } : null;
  }, [isAdmin, composerFilter, project.owner, project.composers]);

  const PEOPLE_AVATAR_LIMIT = 6;
  const peopleQueryNorm = peopleQuery.trim().toLowerCase();
  const rankedComposers = useMemo(() => {
    return [...project.composers].sort((a, b) => {
      const score = (c: ComposerDto) => {
        let n = 0;
        if (c.id === composerFilter) n += 100;
        if (tracksForPerson(project.tracks, c.id).some((item) => item.unread)) n += 10;
        if (tracksForPerson(project.tracks, c.id).some((item) => item.versions.at(-1)?.status === "changes_requested")) n += 5;
        return n;
      };
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });
  }, [project.composers, project.tracks, composerFilter]);
  const visibleComposers = rankedComposers.slice(0, PEOPLE_AVATAR_LIMIT);
  const overflowComposerCount = Math.max(0, rankedComposers.length - visibleComposers.length);
  const filteredInviteable = useMemo(() => {
    if (!peopleQueryNorm) return inviteable;
    return inviteable.filter(
      (c) => c.name.toLowerCase().includes(peopleQueryNorm) || c.email.toLowerCase().includes(peopleQueryNorm),
    );
  }, [inviteable, peopleQueryNorm]);
  const filteredProjectComposers = useMemo(() => {
    if (!peopleQueryNorm) return project.composers;
    return project.composers.filter(
      (c) => c.name.toLowerCase().includes(peopleQueryNorm) || c.email.toLowerCase().includes(peopleQueryNorm),
    );
  }, [project.composers, peopleQueryNorm]);
  const showPeopleList = overflowComposerCount > 0 || inviteable.length > 0;
  const showPeopleSearch = project.composers.length + inviteable.length > 6;

  function personForTrack(item: TrackDto) {
    const id = item.composerId ?? project.ownerId;
    if (id === project.ownerId) return project.owner;
    return (
      project.composers.find((row) => row.id === id) ?? {
        id,
        name: item.composerName,
        email: "",
        avatarUrl: null as string | null,
      }
    );
  }

  const versionTargets = useMemo(
    () =>
      visibleTracks
        .filter((t) => ownsTrack(t) && !t.versions.some((row) => row.status === "approved"))
        .map((t) => ({ id: t.id, title: t.title })),
    [visibleTracks, isComposer, isAdmin, isReviewer, userId, composerIds],
  );
  const showDropZone = canAddTracks || versionTargets.length > 0;

  useEffect(() => {
    if (!projectMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!projectMenuRef.current?.contains(e.target as Node)) setProjectMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [projectMenuOpen]);

  useEffect(() => {
    function onResize() {
      if (window.matchMedia("(min-width: 880px)").matches) setMobileSheet(null);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      return defaultVersionIdForTrack(track.versions);
    });
  }, [track]);

  const version =
    versions.find((v) => v.id === versionId) ??
    versions.find((v) => v.status === "approved") ??
    versions.at(-1);
  const canComment = (isAdmin || isReviewer) && Boolean(version && version.status !== "in_progress");
  const canPublish = Boolean(isOwnTrack && version && version.status === "in_progress");
  const canApproveVersion = Boolean(
    isAdmin && version && version.status !== "in_progress" && version.status !== "approved",
  );
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

  function selectTrack(id: string, options?: { keepSheet?: boolean }) {
    if (id !== trackId) {
      setPlayhead(0);
      setKeepPlaying(false);
    }
    setTrackId(id);
    if (!options?.keepSheet) setMobileSheet(null);
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
    if (status === "approved") {
      const latest = versions.at(-1);
      if (latest && latest.id !== version.id) {
        const ok = confirm(
          `v${latest.versionNumber} is newer. Approve v${version.versionNumber} as the delivery mix anyway?`,
        );
        if (!ok) return;
      }
    }
    const res = await fetch(`/api/versions/${version.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await reload();
  }

  async function approveAndRequestStems() {
    if (!canApproveVersion || !version) return;
    await setStatus("approved");
  }

  async function publishCurrentVersion() {
    if (!version || !canPublish) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/versions/${version.id}/publish`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not publish");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish");
    } finally {
      setBusy(false);
    }
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
      setInviteable(json.composers ?? []);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add composer");
    } finally {
      setBusy(false);
    }
  }

  async function removeComposer(composer: ComposerDto) {
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
    <div
      className={
        embedded
          ? "flex h-full min-h-0 flex-col bg-bg"
          : "flex min-h-dvh flex-col bg-bg min-[880px]:h-dvh"
      }
    >
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
        <div className="flex items-center gap-2 sm:gap-3">
          {embedded && (
            <button
              type="button"
              onClick={openAppNav}
              className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-sm text-mute hover:text-ink min-[880px]:hidden"
              aria-label="Open menu"
            >
              Menu
            </button>
          )}
          <div className="min-w-0 flex-1">
            {!embedded && <p className="text-xs tracking-[0.2em] text-brass uppercase">Audio Review</p>}
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
                className="w-full max-w-md truncate bg-transparent text-base font-medium outline-none focus:border-b focus:border-brass sm:text-lg"
                aria-label="Project title"
              />
            ) : (
              <h1 className="truncate text-base font-medium sm:text-lg">{project.name}</h1>
            )}
          </div>
          {isAdmin && (
            <div className="relative shrink-0" ref={projectMenuRef}>
              <button
                type="button"
                aria-label="Project menu"
                onClick={() => setProjectMenuOpen((open) => !open)}
                className="rounded-md p-2 text-mute hover:bg-surface-2 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>
              {projectMenuOpen && (
                <div className="absolute top-full right-0 z-30 mt-1 min-w-[11rem] rounded-lg border border-line bg-surface py-1 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      void copy("share");
                      setProjectMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    {copied === "share" ? "Review link copied" : "Copy review link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotesOpen((open) => !open);
                      setProjectMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    {notesOpen ? "Hide notes" : "Notes"}
                  </button>
                  <div className="my-1 border-t border-line" />
                  <DeleteProjectButton projectId={project.id} projectName={project.name} variant="button" />
                </div>
              )}
            </div>
          )}
        </div>
        {isAdmin && notesOpen && (
          <textarea
            key={`notes-${project.id}`}
            defaultValue={project.notes}
            rows={3}
            placeholder="Project notes…"
            onBlur={(e) => {
              if (e.target.value !== project.notes) void saveNotes(e.target.value);
            }}
            className="mt-3 w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brass"
          />
        )}
      </header>

      {error && (
        <p className="border-b border-rose-900 bg-rose-950/40 px-4 py-2 text-sm text-rose-200">{error}</p>
      )}
      {busyLabel && (
        <p className="border-b border-line bg-surface px-4 py-2 text-sm text-mute">{busyLabel}</p>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col min-[880px]:grid min-[880px]:grid-cols-[280px_minmax(0,1fr)_280px]">
        <aside
          className={`min-h-0 flex-col border-line bg-bg min-[880px]:flex min-[880px]:border-r ${
            mobileSheet === "tracks"
              ? "fixed inset-0 z-30 flex pt-0"
              : "hidden"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 min-[880px]:hidden">
            <p className="text-sm font-medium">Tracks</p>
            <button
              type="button"
              onClick={() => setMobileSheet(null)}
              className="rounded-md px-2 py-1 text-sm text-mute hover:text-ink"
            >
              Done
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {!isAdmin && project.notes && <p className="text-sm text-mute">{project.notes}</p>}

            {isAdmin && (
              <section className="space-y-2">
                <div className="flex items-center gap-1">
                  <p className="min-w-0 flex-1 text-xs font-medium tracking-wide text-mute uppercase">People</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPeopleOpen((open) => {
                        if (open) setPeopleQuery("");
                        return !open;
                      });
                    }}
                    className={`rounded-md px-1.5 py-0.5 text-sm leading-none ${
                      peopleOpen ? "bg-brass-dim text-brass" : "text-mute hover:bg-surface-2 hover:text-ink"
                    }`}
                    aria-label={peopleOpen ? "Close invite panel" : "Invite composers"}
                    aria-expanded={peopleOpen}
                    title={peopleOpen ? "Done" : "Invite"}
                  >
                    {peopleOpen ? "×" : "+"}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {project.composers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setComposerFilter(null)}
                      title="All"
                      aria-label="Show all tracks"
                      aria-pressed={composerFilter === null}
                      className={`relative flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-medium ring-2 transition ${
                        composerFilter === null
                          ? "bg-brass text-bg ring-brass"
                          : "bg-surface-2 text-mute ring-transparent hover:ring-line"
                      }`}
                    >
                      All
                      {project.tracks.some((item) => item.unread) && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brass ring-2 ring-bg" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setComposerFilter(project.ownerId);
                      const next = tracksForPerson(project.tracks, project.ownerId)[0];
                      if (next) selectTrack(next.id, { keepSheet: true });
                    }}
                    title={`${project.owner.name} (Studio)`}
                    aria-label={`Filter by Studio — ${project.owner.name}`}
                    aria-pressed={
                      composerFilter === project.ownerId ||
                      (project.composers.length === 0 && composerFilter === null)
                    }
                    className={`relative h-9 w-9 rounded-full ring-2 transition ${
                      composerFilter === project.ownerId ||
                      (project.composers.length === 0 && composerFilter === null)
                        ? "ring-brass"
                        : "ring-transparent hover:ring-line"
                    }`}
                  >
                    <span className="block h-full w-full overflow-hidden rounded-full">
                      {project.owner.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={project.owner.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-surface-2 text-xs text-ink">
                          {project.owner.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    {tracksForPerson(project.tracks, project.ownerId).some((item) => item.unread) && (
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brass ring-2 ring-bg" />
                    )}
                  </button>
                  {visibleComposers.map((composer) => {
                    const hasUnread = tracksForPerson(project.tracks, composer.id).some((item) => item.unread);
                    const hasChanges = tracksForPerson(project.tracks, composer.id).some(
                      (item) => item.versions.at(-1)?.status === "changes_requested",
                    );
                    return (
                      <span key={composer.id} className="relative inline-flex">
                        <button
                          type="button"
                          onClick={() => {
                            setComposerFilter(composer.id);
                            const next = tracksForPerson(project.tracks, composer.id)[0];
                            if (next) selectTrack(next.id, { keepSheet: true });
                          }}
                          title={composer.name}
                          aria-label={`Filter by ${composer.name}`}
                          aria-pressed={composerFilter === composer.id}
                          className={`relative h-9 w-9 rounded-full ring-2 transition ${
                            composerFilter === composer.id ? "ring-brass" : "ring-transparent hover:ring-line"
                          }`}
                        >
                          <span className="block h-full w-full overflow-hidden rounded-full">
                            {composer.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={composer.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center bg-surface-2 text-xs text-ink">
                                {composer.name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </span>
                          {(hasUnread || hasChanges) && (
                            <span
                              className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg ${
                                hasChanges && !hasUnread ? "bg-rose-400" : "bg-brass"
                              }`}
                              title={hasUnread ? "New version" : "Changes requested"}
                            />
                          )}
                        </button>
                        {peopleOpen && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeComposer(composer)}
                            className="absolute -top-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-surface text-[10px] leading-none text-mute ring-1 ring-line hover:text-rose-300 disabled:opacity-40"
                            aria-label={`Remove ${composer.name}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    );
                  })}
                  {overflowComposerCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPeopleOpen(true)}
                      title={`${overflowComposerCount} more`}
                      aria-label={`Show ${overflowComposerCount} more people`}
                      className="flex h-9 min-w-9 items-center justify-center rounded-full bg-surface-2 px-2 text-[11px] font-medium text-mute ring-2 ring-transparent hover:ring-line"
                    >
                      +{overflowComposerCount}
                    </button>
                  )}
                </div>
                {peopleOpen && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => void copy("invite")}
                      className="w-full rounded-md border border-line bg-bg px-3 py-2 text-left text-sm hover:border-brass"
                    >
                      {copied === "invite" ? "Invite link copied" : "Copy invite link"}
                    </button>
                    <p className="text-xs text-mute">Anyone with the link can join and upload.</p>
                    {showPeopleList && (
                      <>
                        {showPeopleSearch && (
                          <input
                            value={peopleQuery}
                            onChange={(e) => setPeopleQuery(e.target.value)}
                            placeholder="Find people…"
                            className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-brass"
                          />
                        )}
                        <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                          {overflowComposerCount > 0 &&
                            filteredProjectComposers.map((composer) => (
                              <li key={composer.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setComposerFilter(composer.id);
                                    const next = tracksForPerson(project.tracks, composer.id)[0];
                                    if (next) selectTrack(next.id, { keepSheet: true });
                                    setPeopleOpen(false);
                                    setPeopleQuery("");
                                  }}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                  {composer.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={composer.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                                  ) : (
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[10px]">
                                      {composer.name.slice(0, 1).toUpperCase()}
                                    </span>
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-sm">{composer.name}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void removeComposer(composer)}
                                  className="shrink-0 px-1 text-xs text-mute hover:text-rose-300 disabled:opacity-40"
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          {filteredInviteable.map((composer) => (
                            <li key={`add-${composer.id}`}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void addExistingComposer(composer.id)}
                                className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-surface-2 disabled:opacity-40"
                              >
                                {composer.avatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={composer.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                                ) : (
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[10px]">
                                    {composer.name.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-sm">{composer.name}</span>
                                <span className="shrink-0 text-xs text-brass">Add</span>
                              </button>
                            </li>
                          ))}
                          {peopleQueryNorm &&
                            (overflowComposerCount === 0 || filteredProjectComposers.length === 0) &&
                            filteredInviteable.length === 0 && (
                              <li className="px-1 py-2 text-xs text-mute">No matches</li>
                            )}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className={`space-y-2 ${isAdmin ? "border-t border-line pt-5" : ""}`}>
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 flex-1 text-xs font-medium tracking-wide text-mute uppercase">Tracks</h2>
                {filterPerson && (
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-mute" title={filterPerson.label}>
                    <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full">
                      {filterPerson.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={filterPerson.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-surface-2 text-[10px] text-ink">
                          {filterPerson.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="truncate">{filterPerson.label}</span>
                  </span>
                )}
              </div>
              <ul className="space-y-0.5">
                {visibleTracks.map((item) => {
                  const badge = trackBadgeStatus(item);
                  const person = personForTrack(item);
                  const selected = item.id === track?.id;
                  return (
                    <li
                      key={item.id}
                      className={`flex items-center gap-0.5 rounded-md ${
                        selected ? "bg-brass-dim text-brass" : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectTrack(item.id)}
                        className="min-w-0 flex-1 px-2.5 py-2 text-left text-sm"
                      >
                        <span className="flex items-center gap-2">
                          {isAdmin && showingAllComposers && (
                            <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full" title={person.name}>
                              {person.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center bg-surface-2 text-[10px] text-ink">
                                  {person.name.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate" title={item.title}>
                            {item.title}
                          </span>
                          {isAdmin && item.unread && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-brass" title="New version" />
                          )}
                        </span>
                        <span className={`mt-0.5 flex items-center gap-2 text-xs text-mute ${isAdmin && showingAllComposers ? "pl-8" : ""}`}>
                          <span className="min-w-0 flex-1 truncate">v{item.versions.length}</span>
                          {(isComposer || (isAdmin && badge !== "in_progress")) && badge && (
                            <StatusBadge status={badge} compact />
                          )}
                        </span>
                      </button>
                      {ownsTrack(item) && (
                        <div className="shrink-0 pr-1">
                          <TrackEditMenu
                            title={item.title}
                            versions={item.versions.map((row) => ({ id: row.id, versionNumber: row.versionNumber }))}
                            canDelete
                            onRename={(title) => saveTrackTitle(item.id, item.title, title)}
                            onDelete={() => void trashTrack(item.id, item.title)}
                            onDeleteVersion={(id) => void trashVersion(item, id)}
                          />
                        </div>
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
              <details className="group border-t border-line pt-3">
                <summary className="cursor-pointer list-none text-xs text-mute hover:text-ink [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-mute/70 transition-transform group-open:rotate-90">▸</span>
                    Trash ({visibleArchivedTracks.length})
                  </span>
                </summary>
                <div className="mt-2 space-y-2">
                  {ownedArchivedTracks.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void emptyTrash()}
                        disabled={busy}
                        className="text-xs text-rose-300/90 hover:text-rose-200 disabled:opacity-50"
                      >
                        Empty trash
                      </button>
                    </div>
                  )}
                  <ul className="space-y-1">
                    {visibleArchivedTracks.map((item) => (
                      <li key={item.id} className="flex items-center gap-0.5">
                        <div className="min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-sm text-mute">
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
                </div>
              </details>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col pb-14 min-[880px]:border-b-0 min-[880px]:pb-0">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {!version && !showDropZone && <p className="text-sm text-mute">No audio yet.</p>}
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
                  <div className="hidden flex-wrap items-center gap-2 min-[880px]:flex">
                    {versions.map((item) => {
                      const selected = item.id === version.id;
                      const approved = item.status === "approved";
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setVersionId(item.id)}
                          className={`rounded-full px-3 py-1 text-xs ${
                            approved
                              ? selected
                                ? "bg-emerald-600 text-white"
                                : "border border-emerald-700/60 bg-emerald-950/60 text-emerald-300 hover:border-emerald-500"
                              : selected
                                ? "bg-brass text-bg"
                                : "border border-line text-mute hover:text-ink"
                          }`}
                        >
                          v{item.versionNumber}
                          {item.status === "in_progress" ? " · Draft" : ""}
                          {isAdmin && item.unread ? " · new" : ""}
                        </button>
                      );
                    })}
                  </div>
                  {versions.length > 0 && (
                    <label className="min-[880px]:hidden">
                      <span className="sr-only">Version</span>
                      <select
                        value={version.id}
                        onChange={(e) => setVersionId(e.target.value)}
                        className="rounded-md border border-line bg-bg px-2 py-1.5 text-xs text-ink outline-none focus:border-brass"
                      >
                        {versions.map((item) => (
                          <option key={item.id} value={item.id}>
                            v{item.versionNumber}
                            {item.status === "in_progress" ? " · Draft" : ""}
                            {isAdmin && item.unread ? " · new" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <a
                      href={audioUrl(version.id, shareToken, "download")}
                      download={version.originalFilename}
                      className="inline-flex items-center justify-center rounded-md border border-line p-1.5 text-mute hover:border-brass hover:text-ink"
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
                        options={STUDIO_STATUSES}
                        onChange={(status) => void setStatus(status)}
                      />
                    ) : version.status !== "in_progress" ? (
                      <StatusBadge status={version.status} />
                    ) : null}
                  </div>
                </div>

                {canPublish && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brass/50 bg-brass-dim/50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">Draft — not visible to the studio yet</p>
                      <p className="text-xs text-mute">Audition this version, then publish when you are ready for review.</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void publishCurrentVersion()}
                      className="shrink-0 rounded-md bg-brass px-5 py-2.5 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-40"
                    >
                      Publish for review
                    </button>
                  </div>
                )}

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

                {canApproveVersion && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brass/50 bg-brass-dim/50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        Approve this version & request stems
                      </p>
                      <p className="text-xs text-mute">
                        Locks v{version.versionNumber} as the delivery mix so the composer can upload finals and stems.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approveAndRequestStems()}
                      className="shrink-0 rounded-md bg-brass px-5 py-2.5 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-40"
                    >
                      Approve v{version.versionNumber} & request stems
                    </button>
                  </div>
                )}

                {isApproved && !isReviewer && (
                  <>
                    {isComposer && isOwnTrack && approvedVersion && (
                      <p className="text-sm text-mute">
                        Studio approved v{approvedVersion.versionNumber} — upload finals & stems.
                      </p>
                    )}
                    <DeliveryPanel
                      trackId={track.id}
                      deliveries={track.deliveries ?? []}
                      canUpload={canUploadDeliveries}
                      canDownloadZip={isAdmin}
                      busy={busy}
                      onUpload={uploadDeliveries}
                      onDelete={trashDelivery}
                    />
                  </>
                )}
              </>
            )}
          </div>
          {track && (canEditReference || (track.references?.length ?? 0) > 0) && (
            <div className="shrink-0 border-t border-line bg-bg px-4 py-3 sm:px-5">
              <ReferenceList
                references={track.references ?? []}
                canEdit={canEditReference}
                onAdd={canEditReference ? addReference : undefined}
                onRemove={canEditReference ? removeReference : undefined}
              />
            </div>
          )}
          {canComment && version && (
            <footer className="shrink-0 border-t border-line bg-surface/50 px-4 py-3 sm:px-5 sm:py-4">
              <AddCommentFooter
                currentTime={playhead}
                authorName={reviewerName}
                onAuthorName={isReviewer ? setReviewerName : undefined}
                submitting={busy}
                onSubmit={(body) => addComment(body)}
              />
            </footer>
          )}
        </section>

        <aside
          className={`min-h-0 flex-col gap-4 border-line bg-bg p-4 min-[880px]:flex min-[880px]:overflow-hidden min-[880px]:border-l ${
            mobileSheet === "comments" ? "fixed inset-0 z-30 flex" : "hidden"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line pb-3 min-[880px]:hidden">
            <p className="text-sm font-medium">Comments</p>
            <button
              type="button"
              onClick={() => setMobileSheet(null)}
              className="rounded-md px-2 py-1 text-sm text-mute hover:text-ink"
            >
              Done
            </button>
          </div>
          {version && canSeeComments && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {canPublish ? (
                <p className="mb-3 text-sm text-mute">Publish this draft to open studio review and comments.</p>
              ) : null}
              <CommentPanel
                comments={version.comments}
                currentTime={playhead}
                authorName={reviewerName}
                currentUserId={userId}
                submitting={busy}
                canReply={(canComment || isComposer) && version.status !== "in_progress"}
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
                  setMobileSheet(null);
                }}
              />
            </div>
          )}
        </aside>

        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface min-[880px]:hidden">
          <button
            type="button"
            onClick={() => setMobileSheet((current) => (current === "tracks" ? null : "tracks"))}
            className={`flex-1 py-3 text-sm ${mobileSheet === "tracks" ? "text-brass" : "text-mute"}`}
          >
            Tracks
          </button>
          <button
            type="button"
            onClick={() => setMobileSheet(null)}
            className={`flex-1 py-3 text-sm ${mobileSheet === null ? "text-brass" : "text-mute"}`}
          >
            Player
          </button>
          <button
            type="button"
            onClick={() => setMobileSheet((current) => (current === "comments" ? null : "comments"))}
            className={`flex-1 py-3 text-sm ${mobileSheet === "comments" ? "text-brass" : "text-mute"}`}
          >
            Comments
          </button>
        </nav>
      </div>
    </div>
  );
}
