"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalFallbackAccessibility } from "@/components/shared/useModalFallbackAccessibility";
import { updateProfile } from "@/data/profile";
import { prepareImageForClientDecode } from "@/features/media/prepare-image-for-decode";
import type { CurrentAppUser } from "@/modules/auth";
import { ProfileAvatar } from "./ProfileAvatar";
import styles from "./ProfileEdit.module.css";

const AvatarCropSheet = lazy(
  () => import("./AvatarCropSheet").then((module) => ({ default: module.AvatarCropSheet })),
);

const acceptedAvatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 5 * 1024 * 1024;

type ProfileEditFormProps = {
  initialProfile: CurrentAppUser;
  onDirtyChange: (dirty: boolean) => void;
  onSavePendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
};

export function ProfileEditForm({
  initialProfile,
  onDirtyChange,
  onSavePendingChange,
  onCancel,
  onSaved,
}: ProfileEditFormProps) {
  const [username, setUsername] = useState(initialProfile.username ?? initialProfile.displayName);
  const [firstName, setFirstName] = useState(initialProfile.firstName ?? "");
  const [lastName, setLastName] = useState(initialProfile.lastName ?? "");
  const [location, setLocation] = useState(initialProfile.location ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);
  const savePendingRef = useRef(false);
  const avatarPreparationAbortRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const cropSourceUrlRef = useRef<string | null>(null);
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const preparation = avatarPreparationAbortRef.current;
      avatarPreparationAbortRef.current = null;
      preparation?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (cropSourceUrlRef.current) URL.revokeObjectURL(cropSourceUrlRef.current);
    };
  }, []);

  async function chooseAvatar(file: File | undefined) {
    if (savePendingRef.current || !file) return;
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

    avatarPreparationAbortRef.current?.abort();
    const controller = new AbortController();
    avatarPreparationAbortRef.current = controller;
    setErrorMessage(null);
    try {
      const preparedFile = await prepareImageForClientDecode(file, {
        label: "Profile photo",
        maxDecodeEdge: 4_096,
        signal: controller.signal,
      });
      if (
        !controller.signal.aborted
        && !savePendingRef.current
        && avatarPreparationAbortRef.current === controller
      ) {
        replaceCropSourceUrl(preparedFile);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setErrorMessage(error instanceof Error ? error.message : "Profile photo could not be prepared.");
        resetFileInput();
      }
    } finally {
      if (avatarPreparationAbortRef.current === controller) avatarPreparationAbortRef.current = null;
    }
  }

  function removePhoto() {
    if (savePendingRef.current) return;
    avatarPreparationAbortRef.current?.abort();
    avatarPreparationAbortRef.current = null;
    setAvatar(null);
    replacePreviewUrl(null);
    setRemoveAvatar(Boolean(initialProfile.avatarUrl));
    resetFileInput();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savePendingRef.current) return;
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setErrorMessage("Use 3–30 lowercase letters, numbers, or underscores for your username.");
      return;
    }

    setPending(true);
    savePendingRef.current = true;
    avatarPreparationAbortRef.current?.abort();
    avatarPreparationAbortRef.current = null;
    onSavePendingChange(true);
    setErrorMessage(null);
    try {
      await updateProfile({ username: normalizedUsername, firstName, lastName, location, avatar, removeAvatar });
      if (!mountedRef.current) return;
      savePendingRef.current = false;
      setPending(false);
      onSavePendingChange(false);
      onDirtyChange(false);
      onSaved();
    } catch (error) {
      if (!mountedRef.current) return;
      savePendingRef.current = false;
      setPending(false);
      onSavePendingChange(false);
      setErrorMessage(error instanceof Error ? error.message : "Profile could not be saved. Try again.");
    }
  }

  function resetFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function replacePreviewUrl(file: File | null) {
    const previousUrl = previewUrlRef.current;
    const nextUrl = file ? URL.createObjectURL(file) : null;
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
  }

  function replaceCropSourceUrl(file: File | null) {
    const previousUrl = cropSourceUrlRef.current;
    const nextUrl = file ? URL.createObjectURL(file) : null;
    cropSourceUrlRef.current = nextUrl;
    setCropSourceUrl(nextUrl);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
  }

  function cancelCrop() {
    if (savePendingRef.current) return;
    replaceCropSourceUrl(null);
    resetFileInput();
    fileInputRef.current?.focus();
  }

  return (
    <form className={styles.form} aria-busy={pending} onSubmit={(event) => void submit(event)}>
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
              disabled={pending}
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void chooseAvatar(event.target.files?.[0])}
            />
          </label>
          {(initialProfile.avatarUrl || avatar) && (
            <button type="button" disabled={pending} onClick={removePhoto}>Remove</button>
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
            disabled={pending}
            onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          />
        </label>
        <label>
          <span>First name <small>(optional)</small></span>
          <input value={firstName} maxLength={80} autoComplete="given-name" disabled={pending} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label>
          <span>Last name <small>(optional)</small></span>
          <input value={lastName} maxLength={80} autoComplete="family-name" disabled={pending} onChange={(event) => setLastName(event.target.value)} />
        </label>
        <label>
          <span>Location <small>(optional)</small></span>
          <input value={location} maxLength={120} autoComplete="address-level2" disabled={pending} onChange={(event) => setLocation(event.target.value)} />
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

      {cropSourceUrl && (
        <Suspense fallback={<AvatarCropSheetLoading disabled={pending} onCancel={cancelCrop} />}>
          <AvatarCropSheet
            key={cropSourceUrl}
            imageUrl={cropSourceUrl}
            disabled={pending}
            onCancel={cancelCrop}
            onUsePhoto={(croppedAvatar) => {
              if (savePendingRef.current) return;
              setAvatar(croppedAvatar);
              replacePreviewUrl(croppedAvatar);
              setRemoveAvatar(false);
              replaceCropSourceUrl(null);
              resetFileInput();
            }}
          />
        </Suspense>
      )}
    </form>
  );
}

function AvatarCropSheetLoading({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const handleKeyDown = useModalFallbackAccessibility({
    backdropRef,
    dialogRef,
    initialFocusRef: cancelButtonRef,
    onEscape: () => {
      if (!disabled) onCancel();
    },
  });

  return createPortal(
    <>
      <div ref={backdropRef} className={styles.cropBackdrop} aria-hidden="true" />
      <div
        ref={dialogRef}
        className={`${styles.cropSheet} ${styles.cropLoading}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-loading-title"
        aria-describedby="avatar-crop-loading-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.cropHeader}>
          <div>
            <p className="eyebrow">Profile Photo</p>
            <h2 id="avatar-crop-loading-title">Preparing editor</h2>
          </div>
          <p id="avatar-crop-loading-description" role="status" aria-live="polite">
            Loading photo editor…
          </p>
        </header>
        <div className={styles.cropActions}>
          <button ref={cancelButtonRef} type="button" disabled={disabled} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
