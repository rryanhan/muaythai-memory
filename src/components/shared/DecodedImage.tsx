"use client";

import {
  useCallback,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type SyntheticEvent,
} from "react";

type DecodedImageProps = Omit<ComponentPropsWithoutRef<"img">, "alt" | "src"> & {
  alt: string;
  src: string;
};

/**
 * Keeps an image in its loading state until the browser has decoded the full
 * bitmap. Consumers can preserve a stable placeholder underneath and reveal
 * the image through the `data-image-state` attribute.
 */
export function DecodedImage({
  alt,
  src,
  onError,
  onLoad,
  ...imageProps
}: DecodedImageProps) {
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const decodingSrcRef = useRef<string | null>(null);

  const decodeImage = useCallback((image: HTMLImageElement) => {
    const requestedSrc = src;
    if (decodingSrcRef.current === requestedSrc) return;
    decodingSrcRef.current = requestedSrc;

    const decoding = typeof image.decode === "function"
      ? image.decode().catch(() => undefined)
      : Promise.resolve();

    void decoding.then(() => {
      if (
        !image.isConnected ||
        decodingSrcRef.current !== requestedSrc
      ) {
        return;
      }
      setReadySrc(requestedSrc);
    });
  }, [src]);

  const setImageRef = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) {
      decodeImage(image);
    }
  }, [decodeImage]);

  const imageState = failedSrc === src
    ? "error"
    : readySrc === src
      ? "ready"
      : "loading";

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    onLoad?.(event);
    decodeImage(event.currentTarget);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    onError?.(event);
    setFailedSrc(src);
  }

  return (
    // Signed private-media URLs need native image loading and explicit decode
    // control; Next Image cannot provide this reveal boundary.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...imageProps}
      ref={setImageRef}
      alt={alt}
      src={src}
      data-image-state={imageState}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
