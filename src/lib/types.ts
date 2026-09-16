export const VERSION_STATUSES = [
  "in_progress",
  "review_requested",
  "changes_requested",
  "approved",
] as const;

export type VersionStatus = (typeof VERSION_STATUSES)[number];
export type UserRole = "admin" | "composer";
export type WorkspaceMode = "admin" | "composer" | "reviewer";

export type CommentDto = {
  id: string;
  versionId: string;
  parentId: string | null;
  authorUserId: string | null;
  authorName: string;
  body: string;
  timestampSeconds: number;
  resolved: boolean;
  createdAt: number;
  replies: CommentDto[];
};

export type VersionDto = {
  id: string;
  trackId: string;
  versionNumber: number;
  status: VersionStatus;
  originalFilename: string;
  mimeType: string;
  playbackReady: boolean;
  durationSeconds: number | null;
  unread: boolean;
  createdAt: number;
  comments: CommentDto[];
};

export type ReferenceDto = {
  id: string;
  trackId: string;
  title: string;
  url: string;
  createdAt: number;
};

export type ComposerDto = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type DeliveryKind = "final" | "stem";

export type DeliveryDto = {
  id: string;
  trackId: string;
  kind: DeliveryKind;
  originalFilename: string;
  mimeType: string;
  createdAt: number;
};

export type TrackDto = {
  id: string;
  projectId: string;
  title: string;
  composerId: string | null;
  composerName: string;
  unread: boolean;
  createdAt: number;
  versions: VersionDto[];
  references: ReferenceDto[];
  deliveries: DeliveryDto[];
};

export type ProjectDto = {
  id: string;
  name: string;
  notes: string;
  ownerId: string;
  shareToken: string;
  inviteToken?: string;
  createdAt: number;
  tracks: TrackDto[];
  archivedTracks: TrackDto[];
  composers: ComposerDto[];
};

export type ProjectListItem = {
  id: string;
  name: string;
  createdAt: number;
  trackCount: number;
  unreadCount: number;
};

export type NotificationType = "comment" | "version" | "track" | "status";

export type NotificationDto = {
  id: string;
  type: NotificationType;
  projectId: string;
  trackId: string | null;
  versionId: string | null;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  href: string;
};
