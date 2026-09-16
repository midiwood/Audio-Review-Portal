import { and, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { isPlaybackReady } from "@/lib/playback";
import {
  comments,
  notifications,
  projectMembers,
  projects,
  references,
  trackDeliveries,
  tracks,
  users,
  versions,
} from "@/lib/db/schema";
import type {
  CommentDto,
  ComposerDto,
  DeliveryDto,
  DeliveryKind,
  NotificationDto,
  NotificationType,
  ProjectDto,
  ProjectListItem,
  ReferenceDto,
  TrackDto,
  UserRole,
  VersionDto,
  VersionStatus,
} from "@/lib/types";

export type AccessKind = "admin" | "composer";

export type ProjectAccess = {
  kind: AccessKind;
  project: typeof projects.$inferSelect;
};

export function findUserByEmail(email: string) {
  return getDb().select().from(users).where(eq(users.email, email.trim().toLowerCase())).get();
}

export function findUserById(id: string) {
  return getDb().select().from(users).where(eq(users.id, id)).get();
}

function avatarUrlFor(user: { id: string; avatarFilename: string | null }) {
  return user.avatarFilename ? `/api/avatars/${user.id}?v=${encodeURIComponent(user.avatarFilename)}` : null;
}

export function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role?: UserRole;
  avatarFilename?: string | null;
}) {
  const id = nanoid();
  getDb()
    .insert(users)
    .values({
      id,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      role: input.role ?? "composer",
      avatarFilename: input.avatarFilename ?? null,
      createdAt: Date.now(),
    })
    .run();
  return findUserById(id)!;
}

export function updateUser(
  id: string,
  patch: {
    name?: string;
    email?: string;
    passwordHash?: string;
    avatarFilename?: string | null;
  },
) {
  const updates: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.email !== undefined) updates.email = patch.email.trim().toLowerCase();
  if (patch.passwordHash !== undefined) updates.passwordHash = patch.passwordHash;
  if (patch.avatarFilename !== undefined) updates.avatarFilename = patch.avatarFilename;
  if (Object.keys(updates).length) {
    getDb().update(users).set(updates).where(eq(users.id, id)).run();
  }
  return findUserById(id)!;
}

export function toProfileDto(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name || user.email.split("@")[0],
    email: user.email,
    role: (user.role === "admin" ? "admin" : "composer") as UserRole,
    avatarUrl: avatarUrlFor(user),
  };
}

export function listProjectMemberIds(projectId: string): Set<string> {
  const rows = getDb()
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
    .all();
  return new Set(rows.map((row) => row.userId));
}

/** Studio-owned tracks, plus tracks whose composer is currently on the project. */
export function isTrackSharedWithStudio(
  track: { composerId: string | null },
  project: { id: string; ownerId: string },
  memberIds = listProjectMemberIds(project.id),
) {
  if (!track.composerId || track.composerId === project.ownerId) return true;
  return memberIds.has(track.composerId);
}

export function getProjectAccess(projectId: string, userId: string): ProjectAccess | null {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project || project.deletedAt != null) return null;
  if (project.ownerId === userId) return { kind: "admin", project };
  const member = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .get();
  if (member) return { kind: "composer", project };
  const ownedTrack = db
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(eq(tracks.projectId, projectId), eq(tracks.composerId, userId)))
    .get();
  if (ownedTrack) return { kind: "composer", project };
  return null;
}

export function getProjectByInviteToken(token: string) {
  const project = getDb().select().from(projects).where(eq(projects.inviteToken, token)).get() ?? null;
  if (!project || project.deletedAt != null) return null;
  return project;
}

export function addProjectMember(projectId: string, userId: string) {
  const db = getDb();
  const existing = db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .get();
  if (existing) return existing;
  const id = nanoid();
  db.insert(projectMembers)
    .values({ id, projectId, userId, createdAt: Date.now() })
    .run();
  return db.select().from(projectMembers).where(eq(projectMembers.id, id)).get()!;
}

export function removeProjectMember(projectId: string, userId: string) {
  getDb()
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .run();
}

export function listComposers(projectId: string): ComposerDto[] {
  const db = getDb();
  const rows = db
    .select({ user: users })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .all();
  return rows.map((row) => ({
    id: row.user.id,
    name: row.user.name || row.user.email.split("@")[0],
    email: row.user.email,
    avatarUrl: avatarUrlFor(row.user),
  }));
}

function toComposerDto(user: typeof users.$inferSelect): ComposerDto {
  return {
    id: user.id,
    name: user.name || user.email.split("@")[0],
    email: user.email,
    avatarUrl: avatarUrlFor(user),
  };
}

export function listInviteableComposers(projectId: string): ComposerDto[] {
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return [];
  const members = db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
    .all()
    .map((row) => row.userId);
  const exclude = [project.ownerId, ...members];
  const rows = db
    .select()
    .from(users)
    .where(and(eq(users.role, "composer"), notInArray(users.id, exclude)))
    .all();
  return rows.map(toComposerDto);
}

export function findComposerById(userId: string) {
  const user = findUserById(userId);
  if (!user || user.role !== "composer") return null;
  return user;
}

function mapComment(row: typeof comments.$inferSelect): CommentDto {
  return {
    id: row.id,
    versionId: row.versionId,
    parentId: row.parentId ?? null,
    authorUserId: row.authorUserId ?? null,
    authorName: row.authorName,
    body: row.body,
    timestampSeconds: row.timestampSeconds,
    resolved: Boolean(row.resolved),
    createdAt: row.createdAt,
    replies: [],
  };
}

export function isCommentAuthor(
  comment: { authorUserId: string | null; authorName: string },
  identity: { userId?: string | null; authorName?: string | null },
) {
  if (comment.authorUserId) {
    return Boolean(identity.userId && comment.authorUserId === identity.userId);
  }
  const name = identity.authorName?.trim().toLowerCase();
  return Boolean(name && name === comment.authorName.trim().toLowerCase());
}

function nestComments(rows: CommentDto[]): CommentDto[] {
  const byId = new Map(rows.map((comment) => [comment.id, { ...comment, replies: [] as CommentDto[] }]));
  const roots: CommentDto[] = [];
  for (const comment of byId.values()) {
    if (comment.parentId && byId.has(comment.parentId)) {
      byId.get(comment.parentId)!.replies.push(comment);
    } else {
      roots.push(comment);
    }
  }
  for (const comment of byId.values()) {
    comment.replies.sort((a, b) => a.createdAt - b.createdAt);
  }
  roots.sort((a, b) => a.timestampSeconds - b.timestampSeconds || a.createdAt - b.createdAt);
  return roots;
}

function assembleProject(
  project: typeof projects.$inferSelect,
  trackRows: (typeof tracks.$inferSelect)[],
  versionRows: (typeof versions.$inferSelect)[],
  commentRows: (typeof comments.$inferSelect)[],
  referenceRows: (typeof references.$inferSelect)[],
  deliveryRows: (typeof trackDeliveries.$inferSelect)[],
  userRows: (typeof users.$inferSelect)[],
  options: { includeComments: boolean; includeInvite: boolean; includeComposers: boolean },
): ProjectDto {
  const usersById = new Map(userRows.map((user) => [user.id, user]));
  const commentsByVersion = new Map<string, CommentDto[]>();
  if (options.includeComments) {
    for (const comment of commentRows) {
      const list = commentsByVersion.get(comment.versionId) ?? [];
      list.push(mapComment(comment));
      commentsByVersion.set(comment.versionId, list);
    }
    for (const [versionId, list] of commentsByVersion) {
      commentsByVersion.set(versionId, nestComments(list));
    }
  }

  const versionsByTrack = new Map<string, VersionDto[]>();
  for (const version of versionRows) {
    const list = versionsByTrack.get(version.trackId) ?? [];
    list.push({
      id: version.id,
      trackId: version.trackId,
      versionNumber: version.versionNumber,
      status: version.status as VersionStatus,
      originalFilename: version.originalFilename,
      mimeType: version.mimeType,
      playbackReady: isPlaybackReady(version.storedFilename, version.originalFilename, version.mimeType),
      durationSeconds: version.durationSeconds,
      unread: Boolean(version.unreadForAdmin),
      createdAt: version.createdAt,
      comments: commentsByVersion.get(version.id) ?? [],
    });
    versionsByTrack.set(version.trackId, list);
  }
  for (const list of versionsByTrack.values()) {
    list.sort((a, b) => a.versionNumber - b.versionNumber);
  }

  const referencesByTrack = new Map<string, ReferenceDto[]>();
  for (const ref of referenceRows) {
    const list = referencesByTrack.get(ref.trackId) ?? [];
    list.push({
      id: ref.id,
      trackId: ref.trackId,
      title: ref.title,
      url: ref.url,
      createdAt: ref.createdAt,
    });
    referencesByTrack.set(ref.trackId, list);
  }

  const deliveriesByTrack = new Map<string, DeliveryDto[]>();
  for (const row of deliveryRows) {
    const list = deliveriesByTrack.get(row.trackId) ?? [];
    list.push({
      id: row.id,
      trackId: row.trackId,
      kind: row.kind === "final" ? "final" : "stem",
      originalFilename: row.originalFilename,
      mimeType: row.mimeType,
      createdAt: row.createdAt,
    });
    deliveriesByTrack.set(row.trackId, list);
  }

  const trackDtos: TrackDto[] = trackRows
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((track) => {
      const composer = track.composerId ? usersById.get(track.composerId) : undefined;
      const trackVersions = versionsByTrack.get(track.id) ?? [];
      return {
        id: track.id,
        projectId: track.projectId,
        title: track.title,
        composerId: track.composerId,
        composerName: composer?.name || composer?.email.split("@")[0] || "Studio",
        unread: trackVersions.some((version) => version.unread),
        createdAt: track.createdAt,
        versions: trackVersions,
        references: (referencesByTrack.get(track.id) ?? []).sort((a, b) => a.createdAt - b.createdAt),
        deliveries: (deliveriesByTrack.get(track.id) ?? []).sort((a, b) => a.createdAt - b.createdAt),
      };
    });

  return {
    id: project.id,
    name: project.name,
    notes: project.notes,
    ownerId: project.ownerId,
    shareToken: project.shareToken,
    inviteToken: options.includeInvite ? project.inviteToken : undefined,
    createdAt: project.createdAt,
    tracks: trackDtos,
    archivedTracks: [],
    composers: options.includeComposers ? listComposers(project.id) : [],
  };
}

function filterProjectTracks(
  trackRows: (typeof tracks.$inferSelect)[],
  project: typeof projects.$inferSelect,
  composerId?: string,
) {
  if (composerId) {
    return trackRows.filter((track) => track.composerId === composerId);
  }
  const memberIds = listProjectMemberIds(project.id);
  return trackRows.filter((track) => isTrackSharedWithStudio(track, project, memberIds));
}

function loadProjectTrackRows(
  project: typeof projects.$inferSelect,
  options: { composerId?: string; archived: boolean },
) {
  const db = getDb();
  const deletedFilter = options.archived ? isNotNull(tracks.deletedAt) : isNull(tracks.deletedAt);
  const trackRows = db
    .select()
    .from(tracks)
    .where(and(eq(tracks.projectId, project.id), deletedFilter))
    .all();
  return filterProjectTracks(trackRows, project, options.composerId);
}

function loadTrackBundle(
  trackRows: (typeof tracks.$inferSelect)[],
  includeComments: boolean,
) {
  const db = getDb();
  const trackIds = trackRows.map((t) => t.id);
  const versionRows =
    trackIds.length === 0
      ? []
      : db.select().from(versions).where(inArray(versions.trackId, trackIds)).all();
  const versionIds = versionRows.map((v) => v.id);
  const commentRows =
    !includeComments || versionIds.length === 0
      ? []
      : db.select().from(comments).where(inArray(comments.versionId, versionIds)).all();
  const referenceRows =
    trackIds.length === 0
      ? []
      : db.select().from(references).where(inArray(references.trackId, trackIds)).all();
  const deliveryRows =
    trackIds.length === 0
      ? []
      : db.select().from(trackDeliveries).where(inArray(trackDeliveries.trackId, trackIds)).all();
  const composerIds = [...new Set(trackRows.map((t) => t.composerId).filter(Boolean))] as string[];
  const userRows =
    composerIds.length === 0 ? [] : db.select().from(users).where(inArray(users.id, composerIds)).all();
  return { trackRows, versionRows, commentRows, referenceRows, deliveryRows, userRows };
}

function loadProjectDetail(
  project: typeof projects.$inferSelect,
  options: {
    composerId?: string;
    includeComments: boolean;
    includeInvite: boolean;
    includeComposers?: boolean;
    includeArchived?: boolean;
  },
): ProjectDto {
  const activeRows = loadProjectTrackRows(project, { composerId: options.composerId, archived: false });
  const activeBundle = loadTrackBundle(activeRows, options.includeComments);
  const projectDto = assembleProject(
    project,
    activeBundle.trackRows,
    activeBundle.versionRows,
    activeBundle.commentRows,
    activeBundle.referenceRows,
    activeBundle.deliveryRows,
    activeBundle.userRows,
    {
      includeComments: options.includeComments,
      includeInvite: options.includeInvite,
      includeComposers: Boolean(options.includeComposers),
    },
  );

  if (!options.includeArchived) return projectDto;

  const archivedRows = loadProjectTrackRows(project, { composerId: options.composerId, archived: true });
  const archivedBundle = loadTrackBundle(archivedRows, false);
  const archivedDto = assembleProject(
    project,
    archivedBundle.trackRows,
    archivedBundle.versionRows,
    archivedBundle.commentRows,
    archivedBundle.referenceRows,
    archivedBundle.deliveryRows,
    archivedBundle.userRows,
    {
      includeComments: false,
      includeInvite: false,
      includeComposers: false,
    },
  );
  return { ...projectDto, archivedTracks: archivedDto.tracks };
}

const studioVisibleTrack = sql`(
  ${tracks.composerId} is null
  or ${tracks.composerId} = ${projects.ownerId}
  or exists (
    select 1 from ${projectMembers}
    where ${projectMembers.projectId} = ${projects.id}
      and ${projectMembers.userId} = ${tracks.composerId}
  )
)`;

export function listProjectsForUser(userId: string, role: UserRole): ProjectListItem[] {
  const db = getDb();
  if (role === "admin") {
    const rows = db
      .select({
        id: projects.id,
        name: projects.name,
        createdAt: projects.createdAt,
        trackCount: sql<number>`count(distinct case when ${tracks.id} is not null and ${tracks.deletedAt} is null and ${studioVisibleTrack} then ${tracks.id} end)`.as(
          "track_count",
        ),
        unreadCount: sql<number>`count(distinct case when ${versions.unreadForAdmin} = 1 and ${tracks.deletedAt} is null and ${studioVisibleTrack} then ${tracks.id} end)`.as(
          "unread_count",
        ),
      })
      .from(projects)
      .leftJoin(tracks, eq(tracks.projectId, projects.id))
      .leftJoin(versions, eq(versions.trackId, tracks.id))
      .where(and(eq(projects.ownerId, userId), isNull(projects.deletedAt)))
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt))
      .all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      trackCount: Number(row.trackCount),
      unreadCount: Number(row.unreadCount),
    }));
  }

  const rows = db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      trackCount: sql<number>`count(distinct case when ${tracks.composerId} = ${userId} and ${tracks.deletedAt} is null then ${tracks.id} end)`.as(
        "track_count",
      ),
    })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
    )
    .leftJoin(
      tracks,
      and(eq(tracks.projectId, projects.id), eq(tracks.composerId, userId), isNull(tracks.deletedAt)),
    )
    .where(
      and(
        isNull(projects.deletedAt),
        or(isNotNull(projectMembers.id), isNotNull(tracks.id)),
      ),
    )
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt))
    .all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    trackCount: Number(row.trackCount),
    unreadCount: 0,
  }));
}

export function listArchivedProjectsForOwner(ownerId: string): ProjectListItem[] {
  const rows = getDb()
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      deletedAt: projects.deletedAt,
      trackCount: sql<number>`count(distinct case when ${tracks.id} is not null and ${tracks.deletedAt} is null then ${tracks.id} end)`.as(
        "track_count",
      ),
    })
    .from(projects)
    .leftJoin(tracks, eq(tracks.projectId, projects.id))
    .where(and(eq(projects.ownerId, ownerId), isNotNull(projects.deletedAt)))
    .groupBy(projects.id)
    .orderBy(desc(projects.deletedAt))
    .all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    trackCount: Number(row.trackCount),
    unreadCount: 0,
  }));
}

export function createProject(ownerId: string, name: string) {
  const db = getDb();
  const id = nanoid();
  db.insert(projects)
    .values({
      id,
      ownerId,
      name: name.trim(),
      notes: "",
      shareToken: nanoid(21),
      inviteToken: nanoid(21),
      createdAt: Date.now(),
    })
    .run();
  return getProjectById(id, { kind: "admin", includeComments: true, includeInvite: true });
}

export function getProjectById(
  id: string,
  options: { kind: AccessKind; composerId?: string; includeComments: boolean; includeInvite: boolean },
): ProjectDto | null {
  const project = getDb().select().from(projects).where(eq(projects.id, id)).get();
  if (!project || project.deletedAt != null) return null;
  return loadProjectDetail(project, {
    composerId: options.kind === "composer" ? options.composerId : undefined,
    includeComments: options.includeComments,
    includeInvite: options.includeInvite,
    includeComposers: options.kind === "admin",
    includeArchived: true,
  });
}

export function getProjectByShareToken(token: string): ProjectDto | null {
  const project = getDb().select().from(projects).where(eq(projects.shareToken, token)).get();
  if (!project || project.deletedAt != null) return null;
  const detail = loadProjectDetail(project, { includeComments: true, includeInvite: false, includeArchived: false });
  // Reviewers only see published versions (not drafts awaiting audition/publish).
  return {
    ...detail,
    tracks: detail.tracks
      .map((track) => ({
        ...track,
        versions: track.versions.filter((version) => version.status !== "in_progress"),
      }))
      .filter((track) => track.versions.length > 0),
  };
}

export function updateProject(id: string, patch: { name?: string; notes?: string }) {
  const updates: Partial<typeof projects.$inferInsert> = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (Object.keys(updates).length) {
    getDb().update(projects).set(updates).where(eq(projects.id, id)).run();
  }
  return getProjectById(id, { kind: "admin", includeComments: true, includeInvite: true });
}

export function createTrack(projectId: string, title: string, composerId: string) {
  const id = nanoid();
  getDb()
    .insert(tracks)
    .values({
      id,
      projectId,
      composerId,
      title: title.trim(),
      createdAt: Date.now(),
    })
    .run();
  return getDb().select().from(tracks).where(eq(tracks.id, id)).get()!;
}

export function getTrack(trackId: string) {
  return getDb().select().from(tracks).where(eq(tracks.id, trackId)).get();
}

export function getTrackAccess(trackId: string, options?: { includeArchived?: boolean }) {
  const access = getDb()
    .select({
      track: tracks,
      project: projects,
    })
    .from(tracks)
    .innerJoin(projects, eq(projects.id, tracks.projectId))
    .where(eq(tracks.id, trackId))
    .get();
  if (!access) return undefined;
  if (!options?.includeArchived && access.track.deletedAt != null) return undefined;
  return access;
}

export function getTrackOwnerId(track: { composerId: string | null }, project: { ownerId: string }) {
  return track.composerId ?? project.ownerId;
}

export function isTrackOwner(
  userId: string,
  track: { composerId: string | null },
  project: { ownerId: string },
) {
  return getTrackOwnerId(track, project) === userId;
}

/** Delete, restore, and permanently remove archived tracks. */
export function canOwnTrack(userId: string, trackId: string, options?: { includeArchived?: boolean }) {
  const access = getTrackAccess(trackId, options);
  if (!access) return null;
  if (!isTrackOwner(userId, access.track, access.project)) return null;
  return access;
}

/** Only the track owner (composer, or admin on studio-owned tracks). */
export function canWriteTrack(userId: string, trackId: string) {
  return canManageTrackMedia(userId, trackId);
}

/** Only the track's composer can add versions or Apple Music references. Admin may do so only on studio-owned tracks. */
export function canManageTrackMedia(
  userId: string,
  trackId: string,
  options?: { includeArchived?: boolean },
) {
  const access = getTrackAccess(trackId, options);
  if (!access) return null;
  if (!options?.includeArchived && access.track.deletedAt != null) return null;
  const mediaOwner = access.track.composerId ?? access.project.ownerId;
  if (mediaOwner !== userId) return null;
  if (access.project.ownerId === userId) return { ...access, kind: "admin" as const };
  const member = getProjectAccess(access.project.id, userId);
  if (member?.kind === "composer") return { ...access, kind: "composer" as const };
  return null;
}

export function isTrackApproved(trackId: string) {
  const rows = getDb()
    .select({ status: versions.status, versionNumber: versions.versionNumber })
    .from(versions)
    .where(eq(versions.trackId, trackId))
    .all();
  return rows.sort((a, b) => a.versionNumber - b.versionNumber).at(-1)?.status === "approved";
}

export function canAccessDeliveries(userId: string, trackId: string) {
  const access = getTrackAccess(trackId);
  if (!access) return null;
  const projectAccess = getProjectAccess(access.project.id, userId);
  if (!projectAccess) return null;
  if (projectAccess.kind === "admin") return { ...access, kind: "admin" as const };
  if (access.track.composerId === userId) return { ...access, kind: "composer" as const };
  return null;
}

export function updateTrackTitle(trackId: string, title: string) {
  getDb().update(tracks).set({ title: title.trim() }).where(eq(tracks.id, trackId)).run();
  return getTrack(trackId);
}

export function markTrackSeen(trackId: string) {
  getDb().update(versions).set({ unreadForAdmin: 0 }).where(eq(versions.trackId, trackId)).run();
}

export function markVersionSeen(versionId: string) {
  getDb().update(versions).set({ unreadForAdmin: 0 }).where(eq(versions.id, versionId)).run();
}

export function nextVersionNumber(trackId: string) {
  const row = getDb()
    .select({ max: sql<number>`max(${versions.versionNumber})`.as("max") })
    .from(versions)
    .where(eq(versions.trackId, trackId))
    .get();
  return (Number(row?.max) || 0) + 1;
}

export function createVersion(input: {
  trackId: string;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  status?: VersionStatus;
  unreadForAdmin?: boolean;
}) {
  const id = nanoid();
  getDb()
    .insert(versions)
    .values({
      id,
      trackId: input.trackId,
      versionNumber: nextVersionNumber(input.trackId),
      status: input.status ?? "in_progress",
      originalFilename: input.originalFilename,
      storedFilename: input.storedFilename,
      mimeType: input.mimeType,
      durationSeconds: null,
      unreadForAdmin: input.unreadForAdmin ? 1 : 0,
      createdAt: Date.now(),
    })
    .run();
  return getDb().select().from(versions).where(eq(versions.id, id)).get()!;
}

export function getVersion(versionId: string) {
  return getDb().select().from(versions).where(eq(versions.id, versionId)).get();
}

export function getVersionAccess(versionId: string, options?: { includeArchived?: boolean }) {
  const access = getDb()
    .select({
      version: versions,
      track: tracks,
      project: projects,
    })
    .from(versions)
    .innerJoin(tracks, eq(tracks.id, versions.trackId))
    .innerJoin(projects, eq(projects.id, tracks.projectId))
    .where(eq(versions.id, versionId))
    .get();
  if (!access) return undefined;
  if (!options?.includeArchived && access.track.deletedAt != null) return undefined;
  return access;
}

export function updateVersion(
  versionId: string,
  patch: { status?: VersionStatus; durationSeconds?: number; unreadForAdmin?: boolean },
) {
  const updates: Partial<typeof versions.$inferInsert> = {};
  if (patch.status) updates.status = patch.status;
  if (patch.durationSeconds !== undefined) updates.durationSeconds = patch.durationSeconds;
  if (patch.unreadForAdmin !== undefined) updates.unreadForAdmin = patch.unreadForAdmin ? 1 : 0;
  if (Object.keys(updates).length) {
    getDb().update(versions).set(updates).where(eq(versions.id, versionId)).run();
  }
  return getVersion(versionId);
}

/** Move a draft version into review (sets review_requested + unread for admin). */
export function publishVersion(versionId: string) {
  const version = getVersion(versionId);
  if (!version || version.status !== "in_progress") return null;
  getDb()
    .update(versions)
    .set({ status: "review_requested", unreadForAdmin: 1 })
    .where(eq(versions.id, versionId))
    .run();
  return getVersion(versionId)!;
}

export function createComment(input: {
  versionId: string;
  authorName: string;
  authorUserId?: string | null;
  body: string;
  timestampSeconds: number;
  parentId?: string | null;
}) {
  const id = nanoid();
  getDb()
    .insert(comments)
    .values({
      id,
      versionId: input.versionId,
      parentId: input.parentId ?? null,
      authorUserId: input.authorUserId ?? null,
      authorName: input.authorName.trim(),
      body: input.body.trim(),
      timestampSeconds: input.timestampSeconds,
      resolved: 0,
      createdAt: Date.now(),
    })
    .run();
  if (!input.parentId) {
    getDb().update(versions).set({ status: "changes_requested" }).where(eq(versions.id, input.versionId)).run();
  }
  return getDb().select().from(comments).where(eq(comments.id, id)).get()!;
}

export function getComment(id: string) {
  return getDb().select().from(comments).where(eq(comments.id, id)).get();
}

export function getCommentAccess(commentId: string) {
  return getDb()
    .select({
      comment: comments,
      version: versions,
      track: tracks,
      project: projects,
    })
    .from(comments)
    .innerJoin(versions, eq(versions.id, comments.versionId))
    .innerJoin(tracks, eq(tracks.id, versions.trackId))
    .innerJoin(projects, eq(projects.id, tracks.projectId))
    .where(eq(comments.id, commentId))
    .get();
}

export function updateCommentResolved(commentId: string, resolved: boolean) {
  getDb().update(comments).set({ resolved: resolved ? 1 : 0 }).where(eq(comments.id, commentId)).run();
  return getComment(commentId);
}

export function updateCommentBody(commentId: string, body: string) {
  getDb().update(comments).set({ body: body.trim() }).where(eq(comments.id, commentId)).run();
  return getComment(commentId);
}

export function deleteComment(commentId: string) {
  const row = getComment(commentId);
  if (!row) return null;
  getDb().delete(comments).where(or(eq(comments.id, commentId), eq(comments.parentId, commentId))).run();
  return row;
}

export function listStoredFilesForTrack(trackId: string) {
  const versionFiles = getDb()
    .select({ storedFilename: versions.storedFilename })
    .from(versions)
    .where(eq(versions.trackId, trackId))
    .all()
    .map((row) => row.storedFilename);
  const deliveryFiles = getDb()
    .select({ storedFilename: trackDeliveries.storedFilename })
    .from(trackDeliveries)
    .where(eq(trackDeliveries.trackId, trackId))
    .all()
    .map((row) => row.storedFilename);
  return [...versionFiles, ...deliveryFiles];
}

export function listStoredFilesForProject(projectId: string) {
  const versionFiles = getDb()
    .select({ storedFilename: versions.storedFilename })
    .from(versions)
    .innerJoin(tracks, eq(tracks.id, versions.trackId))
    .where(eq(tracks.projectId, projectId))
    .all()
    .map((row) => row.storedFilename);
  const deliveryFiles = getDb()
    .select({ storedFilename: trackDeliveries.storedFilename })
    .from(trackDeliveries)
    .innerJoin(tracks, eq(tracks.id, trackDeliveries.trackId))
    .where(eq(tracks.projectId, projectId))
    .all()
    .map((row) => row.storedFilename);
  return [...versionFiles, ...deliveryFiles];
}

export function archiveTrack(trackId: string) {
  const track = getTrack(trackId);
  if (!track || track.deletedAt != null) return null;
  getDb()
    .update(tracks)
    .set({ deletedAt: Date.now() })
    .where(eq(tracks.id, trackId))
    .run();
  return getTrack(trackId)!;
}

export function restoreTrack(trackId: string) {
  const track = getTrack(trackId);
  if (!track || track.deletedAt == null) return null;
  getDb().update(tracks).set({ deletedAt: null }).where(eq(tracks.id, trackId)).run();
  return getTrack(trackId)!;
}

export function purgeTrack(trackId: string) {
  const track = getTrack(trackId);
  if (!track || track.deletedAt == null) return null;
  const files = listStoredFilesForTrack(trackId);
  getDb().delete(tracks).where(eq(tracks.id, trackId)).run();
  return files;
}

export function purgeArchivedTracksForProject(projectId: string, userId: string) {
  const project = getDb().select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return { trackIds: [] as string[], files: [] as string[] };
  const archivedRows = loadProjectTrackRows(project, { archived: true }).filter((row) =>
    isTrackOwner(userId, row, project),
  );
  const trackIds = archivedRows.map((row) => row.id);
  const files: string[] = [];
  for (const trackId of trackIds) {
    const trackFiles = purgeTrack(trackId);
    if (trackFiles) files.push(...trackFiles);
  }
  return { trackIds, files };
}

export function listTrackIdsForProject(projectId: string) {
  return getDb()
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.projectId, projectId))
    .all()
    .map((row) => row.id);
}

export function countTrackVersions(trackId: string) {
  const row = getDb()
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(versions)
    .where(eq(versions.trackId, trackId))
    .get();
  return Number(row?.count ?? 0);
}

export function deleteVersion(versionId: string) {
  const row = getVersion(versionId);
  if (!row) return null;
  getDb().delete(versions).where(eq(versions.id, versionId)).run();
  return row.storedFilename;
}

export function archiveProject(projectId: string) {
  const project = getDb().select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project || project.deletedAt != null) return null;
  getDb()
    .update(projects)
    .set({ deletedAt: Date.now() })
    .where(eq(projects.id, projectId))
    .run();
  return getDb().select().from(projects).where(eq(projects.id, projectId)).get()!;
}

export function restoreProject(projectId: string) {
  const project = getDb().select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project || project.deletedAt == null) return null;
  getDb().update(projects).set({ deletedAt: null }).where(eq(projects.id, projectId)).run();
  return getDb().select().from(projects).where(eq(projects.id, projectId)).get()!;
}

export function purgeProject(projectId: string) {
  const project = getDb().select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project || project.deletedAt == null) return null;
  const files = listStoredFilesForProject(projectId);
  getDb().delete(projects).where(eq(projects.id, projectId)).run();
  return files;
}

export function purgeArchivedProjectsForOwner(ownerId: string) {
  const archived = listArchivedProjectsForOwner(ownerId);
  const trackIds: string[] = [];
  const files: string[] = [];
  for (const project of archived) {
    trackIds.push(...listTrackIdsForProject(project.id));
    const projectFiles = purgeProject(project.id);
    if (projectFiles) files.push(...projectFiles);
  }
  return { projectIds: archived.map((p) => p.id), trackIds, files };
}

export function createDelivery(input: {
  trackId: string;
  kind: DeliveryKind;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
}) {
  const id = nanoid();
  getDb()
    .insert(trackDeliveries)
    .values({
      id,
      trackId: input.trackId,
      kind: input.kind,
      originalFilename: input.originalFilename,
      storedFilename: input.storedFilename,
      mimeType: input.mimeType,
      createdAt: Date.now(),
    })
    .run();
  return getDb().select().from(trackDeliveries).where(eq(trackDeliveries.id, id)).get()!;
}

export function getDelivery(id: string) {
  return getDb().select().from(trackDeliveries).where(eq(trackDeliveries.id, id)).get();
}

export function listDeliveriesForTrack(trackId: string) {
  return getDb()
    .select()
    .from(trackDeliveries)
    .where(eq(trackDeliveries.trackId, trackId))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getDeliveryAccess(id: string) {
  return getDb()
    .select({
      delivery: trackDeliveries,
      track: tracks,
      project: projects,
    })
    .from(trackDeliveries)
    .innerJoin(tracks, eq(tracks.id, trackDeliveries.trackId))
    .innerJoin(projects, eq(projects.id, tracks.projectId))
    .where(eq(trackDeliveries.id, id))
    .get();
}

export function deleteDelivery(id: string) {
  const row = getDelivery(id);
  if (!row) return null;
  getDb().delete(trackDeliveries).where(eq(trackDeliveries.id, id)).run();
  return row.storedFilename;
}

export function createReference(trackId: string, url: string, title: string) {
  const id = nanoid();
  getDb()
    .insert(references)
    .values({
      id,
      trackId,
      title: title.trim(),
      url: url.trim(),
      createdAt: Date.now(),
    })
    .run();
  return getDb().select().from(references).where(eq(references.id, id)).get()!;
}

export function getReference(id: string) {
  return getDb().select().from(references).where(eq(references.id, id)).get();
}

export function deleteReference(id: string) {
  const row = getReference(id);
  if (!row) return null;
  getDb().delete(references).where(eq(references.id, id)).run();
  return row;
}

export function projectOwnedBy(projectId: string, ownerId: string) {
  return (
    getDb()
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
      .get() ?? null
  );
}

function notificationHref(projectId: string, trackId?: string | null) {
  const base = `/projects/${projectId}`;
  return trackId ? `${base}?track=${encodeURIComponent(trackId)}` : base;
}

function toNotificationDto(row: typeof notifications.$inferSelect): NotificationDto {
  return {
    id: row.id,
    type: row.type as NotificationType,
    projectId: row.projectId,
    trackId: row.trackId ?? null,
    versionId: row.versionId ?? null,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt ?? null,
    href: notificationHref(row.projectId, row.trackId),
  };
}

export function createNotification(input: {
  userId: string;
  type: NotificationType;
  projectId: string;
  trackId?: string | null;
  versionId?: string | null;
  title: string;
  body?: string;
}) {
  const id = nanoid();
  getDb()
    .insert(notifications)
    .values({
      id,
      userId: input.userId,
      type: input.type,
      projectId: input.projectId,
      trackId: input.trackId ?? null,
      versionId: input.versionId ?? null,
      title: input.title,
      body: input.body ?? "",
      createdAt: Date.now(),
      readAt: null,
    })
    .run();
  return toNotificationDto(getDb().select().from(notifications).where(eq(notifications.id, id)).get()!);
}

export function listNotificationsForUser(userId: string, limit = 30): NotificationDto[] {
  return getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .all()
    .map(toNotificationDto);
}

export function countUnreadNotifications(userId: string) {
  const row = getDb()
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .get();
  return Number(row?.count ?? 0);
}

export function markNotificationRead(userId: string, notificationId: string) {
  getDb()
    .delete(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .run();
}

export function markAllNotificationsRead(userId: string) {
  getDb().delete(notifications).where(eq(notifications.userId, userId)).run();
}

export function getUsersForEmails(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  return getDb().select().from(users).where(inArray(users.id, unique)).all();
}

