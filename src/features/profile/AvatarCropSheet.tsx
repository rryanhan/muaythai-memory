"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlassMinus } from "@phosphor-icons/react/MagnifyingGlassMinus";
import { MagnifyingGlassPlus } from "@phosphor-icons/react/MagnifyingGlassPlus";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Drawer } from "vaul";
import { createCroppedAvatar } from "./create-cropped-avatar";
import styles from "./ProfileEdit.module.css";

type AvatarCropSheetProps = {
  file: File;
  onCancel: () => void;
  onUsePhoto: (file: File) => void;
};

export function AvatarCropSheet({ file, onCancel, onUsePhoto }: AvatarCropSheetProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  async function confirmCrop() {
    if (!imageUrl || !cropPixels || pending) return;
    setPending(true);
    setError(null);
    try {
      onUsePhoto(await createCroppedAvatar(imageUrl, cropPixels));
    } catch (caught) {
      setPending(false);
      setError(caught instanceof Error ? caught.message : "Profile photo could not be prepared.");
    }
  }

  return (
    <Drawer.Root
      open
      direction="bottom"
      dismissible={!pending}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.cropBackdrop} />
        <Drawer.Content className={styles.cropSheet} aria-describedby="avatar-crop-description">
          <Drawer.Handle className="drawer-handle" />
          <header className={styles.cropHeader}>
            <div>
              <p className="eyebrow">Profile Photo</p>
              <Drawer.Title>Crop photo</Drawer.Title>
            </div>
            <Drawer.Description id="avatar-crop-description">
              Drag the image and use the zoom control to frame your profile photo.
            </Drawer.Description>
          </header>

          <div className={styles.cropStage}>
            {imageUrl && (
              <Cropper
                image={imageUrl}
                crop={crop}
                zoom={zoom}
                minZoom={1}
                maxZoom={3}
                zoomSpeed={0.16}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, pixels) => setCropPixels(pixels)}
              />
            )}
          </div>

          <div className={styles.zoomControl}>
            <MagnifyingGlassMinus size={19} aria-hidden="true" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              aria-label="Profile photo zoom"
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <MagnifyingGlassPlus size={19} aria-hidden="true" />
          </div>

          {error && <p className={styles.cropError} role="alert">{error}</p>}

          <div className={styles.cropActions}>
            <button type="button" disabled={pending} onClick={onCancel}>Cancel</button>
            <button type="button" disabled={pending || !cropPixels} onClick={() => void confirmCrop()}>
              {pending ? "Preparing..." : "Use Photo"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
