"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { updateProfile } from "@/data/profile";
import type { CurrentAppUser } from "@/modules/auth";
import { AvatarCropSheet } from "./AvatarCropSheet";
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
  const [username, setUsername] = useState(initialProfile.username ?? initialProfile.displayName);
  const [firstName, setFirstName] = useState(initialProfile.firstName ?? "");
  const [lastName, setLastName] = useState(initialProfile.lastName ?? "");
  const [location, setLocation] = useState(initialProfile.location ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirty =
    username.trim() !== (initialProfile.username ?? initialProfile.displayName) ||
    firstName.trim() !== (initialProfile.firstName ?? "") ||
    lastName.trim() !== (initialProfile.lastName ?? "") ||
    location.trim() !== (initialProfile.location ?? "") ||
    Boolean(avatar) ||
    removeAvatar;
  const previewProfile = useMemo(
    () => ({
      displayName: username.trim() || initialProfile.displayName,
      avatarUrl: previewUrl ?? (removeAvatar ? null : initialProfile.avatarUrl),
    }),
    [username, initialProfile.avatarUrl, initialProfile.displayName, previewUrl, removeAvatar],
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
    setCropSource(file);
  }

  function removePhoto() {
    setAvatar(null);
    setRemoveAvatar(Boolean(initialProfile.avatarUrl));
    resetFileInput();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setErrorMessage("Use 3–30 lowercase letters, numbers, or underscores for your username.");
      return;
    }

    setPending(true);
    setErrorMessage(null);
    try {
      await updateProfile({ username: normalizedUsername, firstName, lastName, location, avatar, removeAvatar });
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
          <span>Username</span>
          <input
            value={username}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          />
        </label>
        <label>
          <span>First name <small>(optional)</small></span>
          <input value={firstName} maxLength={80} autoComplete="given-name" onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label>
          <span>Last name <small>(optional)</small></span>
          <input value={lastName} maxLength={80} autoComplete="family-name" onChange={(event) => setLastName(event.target.value)} />
        </label>
        <label>
          <span>Location <small>(optional)</small></span>
          <input value={location} maxLength={120} autoComplete="address-level2" onChange={(event) => setLocation(event.target.value)} />
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

      {cropSource && (
        <AvatarCropSheet
          file={cropSource}
          onCancel={() => {
            setCropSource(null);
            resetFileInput();
          }}
          onUsePhoto={(croppedAvatar) => {
            setAvatar(croppedAvatar);
            setRemoveAvatar(false);
            setCropSource(null);
            resetFileInput();
          }}
        />
      )}
    </form>
  );
}
