"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import type { CommentDto } from "@/lib/types";

type Props = {
  comments: CommentDto[];
  currentTime: number;
  authorName: string;
  currentUserId?: string;
  onAuthorName?: (name: string) => void;
  onSubmit: (body: string, parentId?: string) => Promise<void>;
  onEdit?: (id: string, body: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onResolve?: (id: string, resolved: boolean) => Promise<void>;
  onJump: (seconds: number) => void;
  submitting?: boolean;
  canAdd?: boolean;
  canReply?: boolean;
  canResolve?: boolean;
  showResolved?: boolean;
  defaultShowChecked?: boolean;
};

function isOwnComment(
  comment: CommentDto,
  currentUserId: string | undefined,
  authorName: string,
) {
  if (comment.authorUserId) {
    return Boolean(currentUserId && comment.authorUserId === currentUserId);
  }
  const name = authorName.trim().toLowerCase();
  return Boolean(name && name === comment.authorName.trim().toLowerCase());
}

function CommentComposer({
  placeholder,
  submitLabel,
  disabled,
  initialValue = "",
  onSend,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  disabled?: boolean;
  initialValue?: string;
  onSend: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  async function submit(raw?: string) {
    const body = (raw ?? value).trim();
    if (!body) return;
    await onSend(body);
    if (!initialValue) setValue("");
  }

  return (
    <div className="space-y-2">
      <textarea
        rows={2}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit(e.currentTarget.value);
          }
          if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
        className="w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brass"
      />
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-line py-2 text-sm text-mute hover:bg-surface-2"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={disabled || !value.trim() || value.trim() === initialValue.trim()}
          onClick={() => void submit()}
          className="flex-1 rounded-md bg-brass py-2 text-sm font-medium text-bg disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  nested,
  canReply,
  canResolve,
  currentUserId,
  authorName,
  showResolved,
  submitting,
  onJump,
  onReply,
  onEdit,
  onDelete,
  onResolve,
}: {
  comment: CommentDto;
  nested?: boolean;
  canReply?: boolean;
  canResolve?: boolean;
  currentUserId?: string;
  authorName: string;
  showResolved?: boolean;
  submitting?: boolean;
  onJump: (seconds: number) => void;
  onReply: (parentId: string, body: string) => Promise<void>;
  onEdit?: (id: string, body: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onResolve?: (id: string, resolved: boolean) => Promise<void>;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canManage = Boolean((onEdit || onDelete) && isOwnComment(comment, currentUserId, authorName));

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <li className={nested ? "ml-4" : ""}>
      <div
        className={`rounded-lg border px-3 py-2.5 ${
          comment.resolved ? "border-line bg-surface opacity-60" : "border-line bg-surface-2"
        }`}
      >
        <div className="mb-1 flex items-start gap-2">
          <button type="button" onClick={() => onJump(comment.timestampSeconds)} className="min-w-0 flex-1 text-left">
            <span className="font-mono text-xs text-brass">{formatTime(comment.timestampSeconds)}</span>
            <span className="ml-2 text-xs text-mute">{comment.authorName}</span>
          </button>
          {canManage && !editing && (
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                aria-label="Edit comment"
                onClick={() => {
                  setReplying(false);
                  setMenuOpen((open) => !open);
                }}
                className="rounded-md p-1 text-mute hover:bg-surface hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute top-full right-0 z-20 mt-1 w-28 overflow-hidden rounded-md border border-line bg-surface shadow-xl">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setEditing(true);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-surface-2"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void onDelete(comment.id);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-xs text-rose-300 hover:bg-rose-950/40"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {(canResolve || showResolved) && (
            <input
              type="checkbox"
              checked={comment.resolved}
              disabled={!canResolve}
              aria-label={
                canResolve
                  ? comment.resolved
                    ? "Checked comment"
                    : "Mark comment done"
                  : comment.resolved
                    ? "Done"
                    : "Not done"
              }
              onChange={(e) => {
                if (!canResolve || !onResolve) return;
                void onResolve(comment.id, e.target.checked);
              }}
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border-mute accent-[#8b877e] ${
                canResolve ? "cursor-pointer" : "cursor-default opacity-80"
              }`}
            />
          )}
        </div>
        {editing && onEdit ? (
          <CommentComposer
            placeholder="Edit comment"
            submitLabel="Save"
            disabled={submitting}
            initialValue={comment.body}
            onCancel={() => setEditing(false)}
            onSend={async (body) => {
              await onEdit(comment.id, body);
              setEditing(false);
            }}
          />
        ) : (
          <p className="text-sm leading-relaxed text-ink">{comment.body}</p>
        )}
        {!editing && canReply && !nested && (
          <button
            type="button"
            onClick={() => setReplying((open) => !open)}
            className="mt-2 text-xs text-brass hover:underline"
          >
            {replying ? "Cancel" : "Reply"}
          </button>
        )}
        {replying && (
          <div className="mt-2">
            <CommentComposer
              placeholder="Reply"
              submitLabel="Reply"
              disabled={submitting}
              onSend={async (body) => {
                await onReply(comment.id, body);
                setReplying(false);
              }}
            />
          </div>
        )}
      </div>
      {comment.replies.length > 0 && (
        <ul className="mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              nested
              canReply={false}
              canResolve={canResolve}
              currentUserId={currentUserId}
              authorName={authorName}
              showResolved={showResolved}
              submitting={submitting}
              onJump={onJump}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onResolve={onResolve}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CommentPanel({
  comments,
  currentTime,
  authorName,
  currentUserId,
  onAuthorName,
  onSubmit,
  onEdit,
  onDelete,
  onResolve,
  onJump,
  submitting,
  canAdd,
  canReply,
  canResolve,
  showResolved,
  defaultShowChecked = false,
}: Props) {
  const [showChecked, setShowChecked] = useState(defaultShowChecked);
  const hasChecked = comments.some(
    (comment) => comment.resolved || comment.replies.some((reply) => reply.resolved),
  );
  const visible = showChecked
    ? comments
    : comments
        .filter((comment) => !comment.resolved)
        .map((comment) => ({
          ...comment,
          replies: comment.replies.filter((reply) => !reply.resolved),
        }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide text-mute uppercase">Comments</h2>
        <span className="font-mono text-xs text-brass">{formatTime(currentTime)}</span>
      </div>
      {hasChecked && (
        <button
          type="button"
          onClick={() => setShowChecked((open) => !open)}
          className="mb-3 text-left text-xs text-brass hover:underline"
        >
          {showChecked ? "Hide checked" : "View all"}
        </button>
      )}

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {visible.length === 0 && (
          <li className="text-sm text-mute">
            {comments.length === 0 ? "No comments on this version yet." : "No open comments."}
          </li>
        )}
        {visible.map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            canReply={canReply}
            canResolve={canResolve}
            currentUserId={currentUserId}
            authorName={authorName}
            showResolved={showResolved}
            submitting={submitting}
            onJump={onJump}
            onReply={(parentId, body) => onSubmit(body, parentId)}
            onEdit={onEdit}
            onDelete={onDelete}
            onResolve={onResolve}
          />
        ))}
      </ul>

      {canAdd && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {onAuthorName && (
            <input
              value={authorName}
              onChange={(e) => onAuthorName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brass"
            />
          )}
          <CommentComposer
            placeholder={`Comment at ${formatTime(currentTime)}`}
            submitLabel="Add comment"
            disabled={submitting || !authorName.trim()}
            onSend={(body) => onSubmit(body)}
          />
        </div>
      )}
    </div>
  );
}
