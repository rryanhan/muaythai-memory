"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { updateProfile } from "@/data/profile";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileAvatar } from "./ProfileAvatar";
import styles from "./ProfileEdit.module.css";

const acceptedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 5 * 1024 * 1024;

type ProfileEditFormProps = {
  initialProfile: CurrentAppUser;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
};

export function ProfileEditForm({ initialProfile, onDirtyChange, onCancel, onSaved }: ProfileEditFormProps) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirty = displayName.trim() !== initialProfile.displayName || Boolean(avatar) || removeAvatar;
  const previewProfile = useMemo(
    () => ({
      displayName: displayName.trim() || initialProfile.displayName,
      avatarUrl: previewUrl ?? (removeAvatar ? null : initialProfile.avatarUrl),
    }),
    [displayName, initialProfile.avatarUrl, initialProfile.displayName, previewUrl, removeAvatar],
  );

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!avatar) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatar);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatar]);

  function chooseAvatar(file: File | undefined) {
    if (!file) return;
    if (!acceptedAvatarTypes.has(file.type)) {
      setErrorMessage("Use a JPEG, PNG, or WebP image.");
      resetFileInput();
      return;
    }
    if (file.size === 0 || file.size > maxAvatarBytes) {
      setErrorMessage(file.size === 0 ? "Choose a non-empty image." : "Profile photos must be 5 MB or smaller.");
      resetFileInput();
      return;
    }

    setErrorMessage(null);
    setAvatar(file);
    setRemoveAvatar(false);
  }

  function removePhoto() {
    setAvatar(null);
    setRemoveAvatar(Boolean(initialProfile.avatarUrl));
    resetFileInput();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      setErrorMessage("Enter a display name.");
      return;
    }
    if (normalizedName.length > 120) {
      setErrorMessage("Display name must be 120 characters or fewer.");
      return;
    }

    setPending(true);
    setErrorMessage(null);
    try {
      await updateProfile({ displayName: normalizedName, avatar, removeAvatar });
      onDirtyChange(false);
      onSaved();
    } catch (error) {
      setPending(false);
      setErrorMessage(error instanceof Error ? error.message : "Profile could not be saved. Try again.");
    }
  }

  function resetFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <section className={styles.photoSection} aria-labelledby="profile-photo-heading">
        <div>
          <p className="eyebrow" id="profile-photo-heading">Profile Photo</p>
          <ProfileAvatar profile={previewProfile} className={styles.avatar} imageClassName={styles.avatarImage} />
        </div>
        <div className={styles.photoActions}>
          <label className={styles.fileButton}>
            {initialProfile.avatarUrl || avatar ? "Replace photo" : "Choose photo"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => chooseAvatar(event.target.files?.[0])}
            />
          </label>
          {(initialProfile.avatarUrl || avatar) && (
            <button type="button" onClick={removePhoto}>Remove</button>
          )}
          <p>JPEG, PNG, or WebP. 5 MB maximum.</p>
        </div>
      </section>

      <section className={styles.fields}>
        <label>
          <span>Display name</span>
          <input
            value={displayName}
            maxLength={120}
            autoComplete="name"
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          <span>Email</span>
          <input value={initialProfile.email ?? ""} readOnly aria-readonly="true" />
        </label>
      </section>

      {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}

      <div className={styles.actions}>
        <button type="button" disabled={pending} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={pending || !dirty}>{pending ? "Saving..." : "Save profile"}</button>
      </div>
    </form>
  );
}
