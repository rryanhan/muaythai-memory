"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlassMinus } from "@phosphor-icons/react/MagnifyingGlassMinus";
import { MagnifyingGlassPlus } from "@phosphor-icons/react/MagnifyingGlassPlus";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Drawer } from "vaul";
import { useDrawerFocus } from "@/features/media/use-drawer-focus";
import { createCroppedAvatar } from "./create-cropped-avatar";
import styles from "./ProfileEdit.module.css";

type AvatarCropSheetProps = {
  imageUrl: string;
  disabled?: boolean;
  onCancel: () => void;
  onUsePhoto: (file: File) => void;
};

export function AvatarCropSheet({ imageUrl, disabled = false, onCancel, onUsePhoto }: AvatarCropSheetProps) {
  const contentRef = useDrawerFocus(true);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [imageDecoded, setImageDecoded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabledRef = useRef(disabled);
  const mountedRef = useRef(false);
  const controlsDisabled = disabled || pending;

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function confirmCrop() {
    if (!imageUrl || !cropPixels || controlsDisabled) return;
    const confirmedCrop = { ...cropPixels };
    setPending(true);
    setError(null);
    try {
      const croppedAvatar = await createCroppedAvatar(imageUrl, confirmedCrop);
      if (!mountedRef.current) return;
      if (disabledRef.current) {
        setPending(false);
        return;
      }
      onUsePhoto(croppedAvatar);
    } catch (caught) {
      if (!mountedRef.current) return;
      setPending(false);
      if (disabledRef.current) return;
      setError(caught instanceof Error ? caught.message : "Profile photo could not be prepared.");
    }
  }

  return (
    <Drawer.Root
      open
      direction="bottom"
      dismissible={!controlsDisabled}
      autoFocus={false}
      onOpenChange={(open) => {
        if (!open && !controlsDisabled) onCancel();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={styles.cropBackdrop} />
        <Drawer.Content
          ref={contentRef}
          className={styles.cropSheet}
          aria-describedby="avatar-crop-description"
        >
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

          <div className={styles.cropStage} data-exporting={controlsDisabled}>
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
              onCropChange={(nextCrop) => {
                if (!controlsDisabled) setCrop(nextCrop);
              }}
              onZoomChange={(nextZoom) => {
                if (!controlsDisabled) setZoom(nextZoom);
              }}
              onCropComplete={(_area, pixels) => {
                if (!controlsDisabled) setCropPixels(pixels);
              }}
              onMediaLoaded={() => {
                if (!disabledRef.current) setImageDecoded(true);
              }}
              mediaProps={{
                onError: () => {
                  if (disabledRef.current) return;
                  setImageDecoded(false);
                  setCropPixels(null);
                  setError("Profile photo could not be decoded. Choose another image.");
                },
              }}
              onTouchRequest={() => !controlsDisabled}
              onWheelRequest={() => !controlsDisabled}
              cropperProps={controlsDisabled
                ? {
                    tabIndex: -1,
                    "aria-disabled": true,
                    onKeyDown: (event) => event.preventDefault(),
                    onKeyUp: (event) => event.preventDefault(),
                  }
                : {}}
            />
          </div>

          <div className={styles.zoomControl}>
            <MagnifyingGlassMinus size={19} aria-hidden="true" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={controlsDisabled}
              aria-label="Profile photo zoom"
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <MagnifyingGlassPlus size={19} aria-hidden="true" />
          </div>

          {error && <p className={styles.cropError} role="alert">{error}</p>}

          <div className={styles.cropActions}>
            <button type="button" disabled={controlsDisabled} data-drawer-initial-focus onClick={onCancel}>Cancel</button>
            <button
              type="button"
              disabled={controlsDisabled || !cropPixels || !imageDecoded || Boolean(error)}
              onClick={() => void confirmCrop()}
            >
              {pending ? "Preparing..." : "Use Photo"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
