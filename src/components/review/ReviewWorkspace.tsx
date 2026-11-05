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
import { StatusBadge, StatusDropdown, STUDIO_STATUSES, OWNER_STATUSES } from "@/components/StatusBadge";
import { NotificationBell } from "@/components/NotificationBell";
import { TrackDropZone, type DroppedUploadItem } from "@/components/TrackDropZone";
import { TrackDownloadControls } from "@/components/TrackDownloadControls";
import { TrackEditMenu } from "@/components/TrackEditMenu";
import { VersionPills } from "@/components/VersionPills";
import { audioUrl } from "@/lib/audio-format";
import { formatTime } from "@/lib/format";
import { attachPlaybackFile } from "@/lib/ffmpeg-swarm";
import { spacesEnabled, uploadDeliveriesToSpaces, uploadVersionToSpaces } from "@/lib/upload-client";
import type { ComposerDto, DeliveryKind, ProjectDto, TrackDto, VersionStatus, WorkspaceMode } from "@/lib/types";

type StatusFilter = "all" | VersionStatus;
type TrackSortKey = "title" | "version" | "status" | "length";

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review_requested", label: "In review" },
  { id: "changes_requested", label: "Needs changes" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const STATUS_SORT_ORDER: Record<VersionStatus, number> = {
  approved: 0,
  review_requested: 1,
  changes_requested: 2,
  in_progress: 3,
  rejected: 4,
};

const TRACK_COLS =
  "min-w-[42rem] grid-cols-[minmax(11rem,2fr)_minmax(7rem,1.15fr)_7.75rem_4.25rem_minmax(7.5rem,1fr)]";
const TRACK_ROW = `grid ${TRACK_COLS} items-center gap-x-5 px-3 sm:gap-x-6 sm:px-4`;

type Props = {
  mode: WorkspaceMode;
  project: ProjectDto;
  shareToken?: string;
  ownerName?: string;
  userId?: string;
  /** Superadmin can manage any track, not only studio-owned ones. */
  isSuperadmin?: boolean;
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
  isSuperadmin = false,
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  /** Track ids captured when a status filter is clicked — not re-evaluated on status changes. */
  const [statusFilterIds, setStatusFilterIds] = useState<string[] | null>(null);
  const [trackSort, setTrackSort] = useState<{ key: TrackSortKey; dir: "asc" | "desc" }>({
    key: "title",
    dir: "asc",
  });
  const [inviteable, setInviteable] = useState<ComposerDto[]>([]);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [deliveriesOpenId, setDeliveriesOpenId] = useState<string | null>(null);
  const [mobileSheet, setMobileSheet] = useState<null | "comments">(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const peopleRef = useRef<HTMLDivElement>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
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
    if (isSuperadmin) return true;
    const ownerId = item.composerId ?? project.ownerId;
    if (ownerId === userId) return true;
    // Label staff (and the label account) admin studio-owned tracks as the owner.
    return isAdmin && ownerId === project.ownerId;
  }

  function trackBadgeStatus(item: TrackDto): VersionStatus | null {
    if (item.versions.some((row) => row.status === "approved")) return "approved";
    return item.versions.at(-1)?.status ?? null;
  }

  function defaultVersionIdForTrack(list: { id: string; status: VersionStatus }[]) {
    return list.find((row) => row.status === "approved")?.id ?? list.at(-1)?.id ?? "";
  }

  function trackDuration(item: TrackDto) {
    const preferred =
      item.versions.find((row) => row.status === "approved") ?? item.versions.at(-1);
    return preferred?.durationSeconds ?? null;
  }

  const personTracks = useMemo(
    () => (isAdmin ? tracksForPerson(project.tracks, composerFilter) : project.tracks),
    [isAdmin, project.tracks, composerFilter, project.ownerId],
  );
  const visibleTracks = useMemo(() => {
    if (!statusFilterIds) return personTracks;
    const allowed = new Set(statusFilterIds);
    return personTracks.filter((item) => allowed.has(item.id));
  }, [personTracks, statusFilterIds]);

  const sortedTracks = useMemo(() => {
    const list = [...visibleTracks];
    const dir = trackSort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (trackSort.key === "title") {
        cmp = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
      } else if (trackSort.key === "version") {
        cmp = (a.versions.at(-1)?.versionNumber ?? 0) - (b.versions.at(-1)?.versionNumber ?? 0);
      } else if (trackSort.key === "status") {
        const sa = trackBadgeStatus(a);
        const sb = trackBadgeStatus(b);
        cmp = (sa ? STATUS_SORT_ORDER[sa] : 9) - (sb ? STATUS_SORT_ORDER[sb] : 9);
      } else {
        cmp = (trackDuration(a) ?? -1) - (trackDuration(b) ?? -1);
      }
      if (cmp === 0) {
        cmp = a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
      }
      return cmp * dir;
    });
    return list;
  }, [visibleTracks, trackSort]);

  function toggleTrackSort(key: TrackSortKey) {
    setTrackSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "title" ? "asc" : "desc" },
    );
  }

  function applyStatusFilter(next: StatusFilter) {
    setStatusFilter(next);
    if (next === "all") {
      setStatusFilterIds(null);
      return;
    }
    setStatusFilterIds(
      personTracks.filter((item) => trackBadgeStatus(item) === next).map((item) => item.id),
    );
  }

  function selectComposerFilter(next: string | null) {
    setComposerFilter(next);
    if (statusFilter === "all") {
      setStatusFilterIds(null);
      return;
    }
    const list = isAdmin ? tracksForPerson(project.tracks, next) : project.tracks;
    setStatusFilterIds(list.filter((item) => trackBadgeStatus(item) === statusFilter).map((item) => item.id));
  }
  const visibleArchivedTracks = isAdmin
    ? tracksForPerson(project.archivedTracks ?? [], composerFilter)
    : (project.archivedTracks ?? []);
  const ownedArchivedTracks = visibleArchivedTracks.filter((item) => ownsTrack(item));
  const track = visibleTracks.find((t) => t.id === trackId) ?? visibleTracks[0];
  const versions = track?.versions ?? [];

  const isOwnTrack = ownsTrack(track);
  const approvedVersion = track?.versions.find((row) => row.status === "approved");
  const isApproved = Boolean(approvedVersion);
  const canAddVersion = isOwnTrack && !isApproved;
  const canAddTracks = isComposer || (isAdmin && (composerFilter === null || composerFilter === project.ownerId));
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
  const visibleComposers = project.composers.slice(0, PEOPLE_AVATAR_LIMIT);
  const overflowComposerCount = Math.max(0, project.composers.length - visibleComposers.length);
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
    if (!peopleOpen) return;
    function onDoc(e: MouseEvent) {
      if (!peopleRef.current?.contains(e.target as Node)) {
        setPeopleOpen(false);
        setPeopleQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [peopleOpen]);

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
  const canComment = (isAdmin || isReviewer || isOwnTrack) && Boolean(version);
  const canSetStatus = Boolean((isAdmin || isOwnTrack) && version);
  const statusOptions = isAdmin ? STUDIO_STATUSES : OWNER_STATUSES;
  const { clips } = useTrackPlayback(track?.id, versions, shareToken, versionId);
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
      setSeekTo(0);
      setSeekNonce(Date.now());
      setKeepPlaying(false);
    }
    setTrackId(id);
    if (!options?.keepSheet) setMobileSheet(null);
    clearCommentAlert(id);
  }

  function clearCommentAlert(id: string) {
    if (isReviewer || !userId) return;
    const pending = project.tracks.some((item) => item.id === id && item.hasNewComment);
    if (!pending) return;
    setProject((current) => ({
      ...current,
      tracks: current.tracks.map((item) => (item.id === id ? { ...item, hasNewComment: false } : item)),
    }));
    void fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: id }),
    });
  }

  function playTrackFromList(id: string) {
    if (id === trackId && keepPlaying) {
      setKeepPlaying(false);
      return;
    }
    if (id !== trackId) {
      setPlayhead(0);
      setSeekTo(0);
      setSeekNonce(Date.now());
    }
    setTrackId(id);
    setKeepPlaying(true);
    clearCommentAlert(id);
  }

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
    }

    function onKey(e: KeyboardEvent) {
      if (!window.matchMedia("(min-width: 880px)").matches) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (peopleOpen || projectMenuOpen) return;
      if (document.querySelector('[role="listbox"], [role="dialog"]')) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const delta = e.key === "ArrowUp" ? -1 : 1;
        if (sortedTracks.length === 0) return;
        const idx = sortedTracks.findIndex((item) => item.id === trackId);
        const nextIdx = idx < 0 ? (delta > 0 ? 0 : sortedTracks.length - 1) : idx + delta;
        if (nextIdx < 0 || nextIdx >= sortedTracks.length) return;
        const next = sortedTracks[nextIdx];
        if (keepPlaying) playTrackFromList(next.id);
        else selectTrack(next.id, { keepSheet: true });
        return;
      }

      if (e.key === "c" || e.key === "C") {
        if (!canComment) return;
        e.preventDefault();
        commentTextareaRef.current?.focus();
        return;
      }

      const digit = /^Digit([1-9])$/.exec(e.code) ?? /^Numpad([1-9])$/.exec(e.code);
      if (digit) {
        const n = Number(digit[1]);
        const match = versions.find((row) => row.versionNumber === n);
        if (!match) return;
        e.preventDefault();
        setVersionId(match.id);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    peopleOpen,
    projectMenuOpen,
    sortedTracks,
    trackId,
    keepPlaying,
    versions,
    canComment,
  ]);

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

  async function uploadDeliveries(kind: DeliveryKind, files: File[], forTrackId?: string) {
    const targetId = forTrackId ?? track?.id;
    if (!targetId || isReviewer) return;
    const target = project.tracks.find((item) => item.id === targetId);
    if (!target || !ownsTrack(target)) return;
    setBusy(true);
    setError("");
    try {
      if (await spacesEnabled()) {
        await uploadDeliveriesToSpaces({
          trackId: targetId,
          kind,
          files,
          onStatus: setBusyLabel,
        });
        await reload();
        return;
      }
      const data = new FormData();
      data.set("trackId", targetId);
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
    if (!version || !canSetStatus) return;
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
      if (composerFilter === composer.id) selectComposerFilter(null);
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

  async function addReference(url: string, title: string, forTrackId?: string) {
    const targetId = forTrackId ?? track?.id;
    if (!targetId) return;
    const target = project.tracks.find((item) => item.id === targetId);
    if (!ownsTrack(target)) return;
    const res = await fetch("/api/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: targetId, url, title }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not add reference");
      return;
    }
    await reload();
  }

  async function removeReference(id: string, forTrackId?: string) {
    const targetId = forTrackId ?? track?.id;
    const target = project.tracks.find((item) => item.id === targetId);
    if (!ownsTrack(target)) return;
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
            <h2 className="type-title">Your name</h2>
            <p className="type-meta">Comments are attributed to this name. No account needed.</p>
            <input
              name="name"
              autoFocus
              placeholder="Name"
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brass"
            />
            <button type="submit" className="type-ui w-full rounded-md bg-brass py-2 text-bg">
              Continue
            </button>
          </form>
        </div>
      )}

      <header className="shrink-0 border-b border-line bg-[#15120e] px-4 py-2.5 sm:px-5">
        <div className="relative flex items-center gap-2 sm:gap-3">
          {embedded && (
            <button
              type="button"
              onClick={openAppNav}
              className="type-ui shrink-0 rounded-md border border-line px-2.5 py-1.5 text-mute hover:text-ink min-[880px]:hidden"
              aria-label="Open menu"
            >
              Menu
            </button>
          )}
          <div className="min-w-0 flex-1">
            {!embedded && <p className="type-brand">Audio Review</p>}
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
                className="type-title w-full max-w-md truncate bg-transparent outline-none focus:border-b focus:border-brass"
                aria-label="Project title"
              />
            ) : (
              <h1 className="type-title truncate">{project.name}</h1>
            )}
          </div>

          {isAdmin && (
            <div
              ref={peopleRef}
              className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5"
              data-no-activate
            >
              {project.composers.length > 0 && (
                <button
                  type="button"
                  onClick={() => selectComposerFilter(null)}
                  title="All"
                  aria-label="Show all tracks"
                  aria-pressed={composerFilter === null}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full type-ui ring-2 transition ${
                    composerFilter === null
                      ? "bg-brass text-bg ring-brass"
                      : "bg-surface-2 text-mute ring-transparent hover:ring-line"
                  }`}
                >
                  All
                  {project.tracks.some((item) => item.unread) && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brass ring-2 ring-bg" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  selectComposerFilter(project.ownerId);
                  const next = tracksForPerson(project.tracks, project.ownerId)[0];
                  if (next) selectTrack(next.id, { keepSheet: true });
                }}
                title={`${project.owner.name} (Studio)`}
                aria-label={`Filter by Studio — ${project.owner.name}`}
                aria-pressed={
                  composerFilter === project.ownerId ||
                  (project.composers.length === 0 && composerFilter === null)
                }
                className={`relative h-8 w-8 rounded-full ring-2 transition ${
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
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brass ring-2 ring-bg" />
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
                        selectComposerFilter(composer.id);
                        const next = tracksForPerson(project.tracks, composer.id)[0];
                        if (next) selectTrack(next.id, { keepSheet: true });
                      }}
                      title={composer.name}
                      aria-label={`Filter by ${composer.name}`}
                      aria-pressed={composerFilter === composer.id}
                      className={`relative h-8 w-8 rounded-full ring-2 transition ${
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
                          className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-bg ${
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
                        className="absolute -top-1 -right-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface text-xs leading-none text-mute ring-1 ring-line hover:text-rose-300 disabled:opacity-40"
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
                  className="flex h-8 min-w-8 items-center justify-center rounded-full bg-surface-2 px-1.5 type-ui text-mute ring-2 ring-transparent hover:ring-line"
                >
                  +{overflowComposerCount}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPeopleOpen((open) => {
                    if (open) setPeopleQuery("");
                    return !open;
                  });
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm leading-none ${
                  peopleOpen ? "bg-brass-dim text-brass" : "text-mute hover:bg-surface-2 hover:text-ink"
                }`}
                aria-label={peopleOpen ? "Close invite panel" : "Invite composers"}
                aria-expanded={peopleOpen}
                title={peopleOpen ? "Done" : "Invite"}
              >
                {peopleOpen ? "×" : "+"}
              </button>
              {peopleOpen && (
                <div className="absolute top-full left-1/2 z-40 mt-2 w-72 -translate-x-1/2 space-y-2 rounded-lg border border-line bg-surface p-3 shadow-xl">
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
                                  selectComposerFilter(composer.id);
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
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs">
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
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs">
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
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center justify-end gap-2 sm:gap-3">
          {isAdmin && (
            <button
              type="button"
              onClick={() => void copy("share")}
              className="type-ui hidden shrink-0 rounded-md border border-line px-2.5 py-1.5 text-mute hover:border-brass hover:text-ink sm:inline-flex"
              title="Copy client review link"
            >
              {copied === "share" ? "Review link copied" : "Copy review link"}
            </button>
          )}
          {embedded && !isReviewer && (
            <div className="shrink-0 min-[880px]:hidden">
              <NotificationBell align="right" />
            </div>
          )}
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

      <div className="relative flex min-h-0 flex-1 flex-col min-[880px]:grid min-[880px]:grid-cols-[minmax(0,1fr)_300px]">
        <section
          className={`min-h-0 flex-col border-line bg-bg pb-[72px] min-[880px]:flex min-[880px]:border-r min-[880px]:pb-0 ${
            mobileSheet === "comments" ? "hidden" : "flex"
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">
            {!isAdmin && project.notes && <p className="text-sm text-mute">{project.notes}</p>}

            <section className="space-y-2">
              {showDropZone ? (
                <TrackDropZone
                  variant="toolbar"
                  disabled={busy}
                  versionTargets={versionTargets}
                  defaultVersionTrackId={canAddVersion ? track?.id : undefined}
                  onUpload={uploadDroppedItems}
                  leading={
                    <h2 className="type-section shrink-0">Tracks</h2>
                  }
                >
                  <div className="flex flex-wrap items-center gap-1">
                    {STATUS_FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => applyStatusFilter(item.id)}
                        className={`type-ui rounded-full px-2 py-0.5 ${
                          statusFilter === item.id
                            ? "bg-brass text-bg"
                            : "bg-surface-2 text-mute hover:text-ink"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                    {filterPerson && (
                      <span className="ml-1 flex min-w-0 items-center gap-1.5 text-xs text-mute" title={filterPerson.label}>
                        <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full">
                          {filterPerson.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={filterPerson.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-surface-2 text-xs text-ink">
                              {filterPerson.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="truncate">{filterPerson.label}</span>
                      </span>
                    )}
                  </div>
                </TrackDropZone>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 className="type-section shrink-0">Tracks</h2>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    {STATUS_FILTERS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => applyStatusFilter(item.id)}
                        className={`type-ui rounded-full px-2 py-0.5 ${
                          statusFilter === item.id
                            ? "bg-brass text-bg"
                            : "bg-surface-2 text-mute hover:text-ink"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                    {filterPerson && (
                      <span className="ml-1 flex min-w-0 items-center gap-1.5 text-xs text-mute" title={filterPerson.label}>
                        <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full">
                          {filterPerson.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={filterPerson.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-surface-2 text-xs text-ink">
                              {filterPerson.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="truncate">{filterPerson.label}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="overflow-x-auto rounded-md border border-line">
                <div
                  className={`${TRACK_ROW} border-b border-line bg-surface-2/50 py-2`}
                  role="row"
                >
                  {(
                    [
                      { key: "title", label: "Track", justify: "" },
                      { key: "version", label: "Version", justify: "justify-center" },
                      { key: "status", label: "Status", justify: "" },
                      { key: "length", label: "Length", justify: "justify-end" },
                    ] as const
                  ).map((col) => {
                    const active = trackSort.key === col.key;
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => toggleTrackSort(col.key)}
                        className={`type-section inline-flex w-full items-center gap-1.5 hover:text-ink ${col.justify} ${
                          active ? "text-brass" : ""
                        }`}
                        aria-sort={active ? (trackSort.dir === "asc" ? "ascending" : "descending") : "none"}
                      >
                        {col.label}
                        <span className={`type-mono ${active ? "opacity-100" : "opacity-35"}`} aria-hidden>
                          {active ? (trackSort.dir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    );
                  })}
                  <span className="type-section w-full text-right">
                    Files
                  </span>
                </div>

                {sortedTracks.length === 0 && (
                  <p className="px-4 py-3 text-sm text-mute">No tracks match these filters.</p>
                )}
                <ul>
                {sortedTracks.map((item) => {
                  const badge = trackBadgeStatus(item);
                  const person = personForTrack(item);
                  const selected = item.id === track?.id;
                  const playing = selected && keepPlaying;
                  const duration = trackDuration(item);
                  const displayVersion =
                    item.versions.find((row) => row.status === "approved") ?? item.versions.at(-1);
                  const itemIsOwn = ownsTrack(item);
                  const itemVersion = selected && track?.id === item.id ? version : displayVersion;
                  const itemCanSetStatus = Boolean(selected && itemVersion && (isAdmin || itemIsOwn));
                  const itemApproved = item.versions.some((row) => row.status === "approved");
                  const itemRejected = badge === "rejected";
                  const canUploadDeliveries = itemIsOwn && !isReviewer && itemApproved;
                  const hasDeliveries = (item.deliveries?.length ?? 0) > 0;
                  const showDeliveriesButton = canUploadDeliveries || hasDeliveries;
                  const deliveriesOpen = deliveriesOpenId === item.id;
                  const downloadVersion = itemVersion;
                  return (
                    <li
                      key={item.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("a, button, input, textarea, select, [data-no-activate]")) return;
                        if (displayVersion) playTrackFromList(item.id);
                        else selectTrack(item.id, { keepSheet: true });
                      }}
                      className={`group relative cursor-pointer border-b border-line/50 last:border-b-0 transition ${
                        itemRejected ? "opacity-45 grayscale" : ""
                      } ${
                        selected
                          ? "border-l-[3px] border-l-brass bg-brass-dim/40 shadow-[inset_0_0_0_1px_rgba(212,160,84,0.35)]"
                          : "border-l-[3px] border-l-transparent hover:bg-surface-2/50"
                      }`}
                    >
                      <div className={`${TRACK_ROW} h-[52px]`}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => playTrackFromList(item.id)}
                            disabled={!displayVersion}
                            title={person.name}
                            className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-md transition disabled:opacity-30 ${
                              playing ? "ring-2 ring-brass ring-offset-1 ring-offset-bg" : ""
                            }`}
                            aria-label={
                              playing
                                ? `Pause ${item.title} (${person.name})`
                                : `Play ${item.title} (${person.name})`
                            }
                          >
                            {person.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center bg-surface-2 type-ui text-ink">
                                {person.name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span
                              className={`absolute inset-0 flex items-center justify-center bg-black/50 transition ${
                                playing
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                              }`}
                              aria-hidden
                            >
                              {playing ? (
                                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-brass drop-shadow" aria-hidden>
                                  <path d="M6 4h5v16H6V4Zm7 0h5v16h-5V4Z" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6 fill-brass drop-shadow" aria-hidden>
                                  <path d="M7 3.5v17l14-8.5L7 3.5Z" />
                                </svg>
                              )}
                            </span>
                            {item.hasNewComment && !playing && (
                              <span
                                className="absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full bg-brass ring-2 ring-bg group-hover:opacity-0"
                                title="New comment"
                                aria-label="New comment"
                              />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (displayVersion) playTrackFromList(item.id);
                              else selectTrack(item.id, { keepSheet: true });
                            }}
                            className="min-w-0 truncate text-left text-sm"
                          >
                            <span className={selected ? "font-medium text-brass" : "text-ink"}>{item.title}</span>
                            {showingAllComposers && (
                              <span className="text-mute"> · {person.name}</span>
                            )}
                            {isAdmin && item.unread && <span className="text-brass"> · new</span>}
                          </button>
                        </div>

                        <VersionPills
                          versions={item.versions}
                          selectedId={selected ? itemVersion?.id : undefined}
                          focusId={itemVersion?.id}
                          onSelect={(id) => {
                            selectTrack(item.id, { keepSheet: true });
                            setVersionId(id);
                          }}
                        />

                        <div className="flex min-w-0 items-center">
                          {itemCanSetStatus && itemVersion ? (
                            <StatusDropdown
                              compact
                              status={itemVersion.status}
                              disabled={busy}
                              options={statusOptions}
                              onChange={(status) => void setStatus(status)}
                            />
                          ) : (isComposer || isAdmin) && badge ? (
                            <StatusBadge status={badge} compact />
                          ) : null}
                        </div>

                        <span className="type-mono text-right text-mute">
                          {duration != null ? formatTime(duration) : "—"}
                        </span>

                        <div className="flex min-w-0 items-center justify-end gap-1.5">
                          <TrackDownloadControls
                            deliveries={item.deliveries ?? []}
                            previewHref={
                              downloadVersion
                                ? audioUrl(downloadVersion.id, shareToken, "preview")
                                : undefined
                            }
                            previewFilename={
                              downloadVersion
                                ? downloadVersion.originalFilename.replace(/\.[^.]+$/, "") + ".mp3"
                                : undefined
                            }
                            showDeliveries={showDeliveriesButton}
                            deliveriesOpen={deliveriesOpen}
                            onToggleDeliveries={() => {
                              setDeliveriesOpenId((current) => (current === item.id ? null : item.id));
                              if (!selected) selectTrack(item.id, { keepSheet: true });
                            }}
                          />

                          {itemIsOwn && (
                            <TrackEditMenu
                              title={item.title}
                              versions={item.versions.map((row) => ({
                                id: row.id,
                                versionNumber: row.versionNumber,
                              }))}
                              canDelete
                              onRename={(title) => saveTrackTitle(item.id, item.title, title)}
                              onDelete={() => void trashTrack(item.id, item.title)}
                              onDeleteVersion={(id) => void trashVersion(item, id)}
                            />
                          )}
                        </div>
                      </div>

                      {deliveriesOpen && (
                        <div className="border-t border-line/40 px-2 py-2" data-no-activate>
                          <DeliveryPanel
                            compact
                            trackId={item.id}
                            deliveries={item.deliveries ?? []}
                            canUpload={canUploadDeliveries}
                            canDownloadZip={!isReviewer}
                            busy={busy}
                            onUpload={(kind, files) => uploadDeliveries(kind, files, item.id)}
                            onDelete={trashDelivery}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
                </ul>
              </div>
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
            {!version && !showDropZone && visibleTracks.length === 0 && (
              <p className="text-sm text-mute">No audio yet.</p>
            )}
          </div>

          {version && track && (
            <div className="relative z-10 shrink-0 border-t border-line bg-surface">
              <div className="grid h-[72px] grid-cols-[auto_minmax(5rem,10rem)_minmax(0,1fr)_auto] items-center gap-2.5 px-3">
                <button
                  type="button"
                  onClick={() => playTrackFromList(track.id)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    keepPlaying ? "bg-brass text-bg ring-2 ring-brass/50" : "bg-brass text-bg hover:brightness-110"
                  }`}
                  aria-label={keepPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                >
                  {keepPlaying ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                      <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-3.5 w-3.5 fill-current" aria-hidden>
                      <path d="M8 5.14v13.72L19 12 8 5.14Z" />
                    </svg>
                  )}
                </button>
                <p className="min-w-0 truncate text-sm">
                  <span className="font-medium text-brass">{track.title}</span>
                  <span className="text-mute"> · v{version.versionNumber}</span>
                </p>
                <div className="min-h-0 min-w-0 self-stretch py-2">
                  <WaveformPlayer
                    inline
                    live
                    clips={playerClips}
                    activeId={version.id}
                    onTime={setPlayhead}
                    seekTo={seekTo}
                    seekNonce={seekNonce}
                    startAt={playhead}
                    autoplay={keepPlaying}
                    onPlaying={(isPlaying) => {
                      setKeepPlaying(isPlaying);
                      if (isPlaying) markVersionHeard(version.id);
                    }}
                    onDuration={(d) => {
                      if (!version.durationSeconds) void persistDuration(d);
                    }}
                    onJumpToComment={(seconds) => {
                      setSeekTo(seconds);
                      setSeekNonce(Date.now());
                    }}
                  />
                </div>
                <span className="type-mono shrink-0 text-mute">
                  {formatTime(playhead)}
                  {version.durationSeconds != null ? ` / ${formatTime(version.durationSeconds)}` : ""}
                </span>
              </div>
            </div>
          )}
        </section>

        <aside
          className={`min-h-0 flex-col border-line bg-bg min-[880px]:flex min-[880px]:overflow-hidden ${
            mobileSheet === "comments" ? "fixed inset-0 z-30 flex" : "hidden"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 min-[880px]:hidden">
            <p className="type-section">Comments</p>
            <button
              type="button"
              onClick={() => setMobileSheet(null)}
              className="rounded-md px-2 py-1 text-sm text-mute hover:text-ink"
            >
              Done
            </button>
          </div>
          {version && canSeeComments ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {track && ((track.references?.length ?? 0) > 0 || isOwnTrack) && (
                <div className="shrink-0 border-b border-line px-4 pt-3 pb-3 min-[880px]:pt-4">
                  <ReferenceList
                    references={track.references ?? []}
                    canEdit={isOwnTrack}
                    onAdd={isOwnTrack ? (url, title) => addReference(url, title, track.id) : undefined}
                    onRemove={isOwnTrack ? (id) => removeReference(id, track.id) : undefined}
                  />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 min-[880px]:pt-3">
                <CommentPanel
                  comments={version.comments}
                  currentTime={playhead}
                  authorName={reviewerName}
                  currentUserId={userId}
                  submitting={busy}
                  canReply={canComment}
                  canResolve={isOwnTrack || isAdmin}
                  showResolved={isAdmin || isOwnTrack}
                  defaultShowChecked={isAdmin && !isOwnTrack}
                  onSubmit={addComment}
                  onEdit={editComment}
                  onDelete={deleteComment}
                  onResolve={isOwnTrack || isAdmin ? resolveComment : undefined}
                  onJump={(seconds) => {
                    setSeekTo(seconds);
                    setSeekNonce(Date.now());
                    setMobileSheet(null);
                  }}
                />
              </div>
              {canComment && (
                <div className="shrink-0 border-t border-line bg-surface/40 px-3 py-2">
                  <AddCommentFooter
                    currentTime={playhead}
                    authorName={reviewerName}
                    onAuthorName={isReviewer ? setReviewerName : undefined}
                    submitting={busy}
                    textareaRef={commentTextareaRef}
                    onSubmit={(body) => addComment(body)}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="px-4 py-6 text-sm text-mute">Select a track to see comments.</p>
          )}
        </aside>

        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface min-[880px]:hidden">
          <button
            type="button"
            onClick={() => setMobileSheet(null)}
            className={`flex-1 py-3 text-sm ${mobileSheet !== "comments" ? "text-brass" : "text-mute"}`}
          >
            Tracks
          </button>
          <button
            type="button"
            onClick={() => setMobileSheet("comments")}
            className={`flex-1 py-3 text-sm ${mobileSheet === "comments" ? "text-brass" : "text-mute"}`}
          >
            Comments
          </button>
        </nav>
      </div>
    </div>
  );
}
