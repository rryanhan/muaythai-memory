import type { Area } from "react-easy-crop";

const AVATAR_OUTPUT_SIZE = 1024;
const AVATAR_OUTPUT_QUALITY = 0.9;

export async function createCroppedAvatar(imageUrl: string, crop: Area): Promise<File> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Profile photo could not be prepared in this browser.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  const blob = await canvasToBlob(canvas, "image/webp", AVATAR_OUTPUT_QUALITY);
  if (!blob) throw new Error("Profile photo could not be exported. Try another image.");
  return new File([blob], "profile-avatar.webp", { type: "image/webp" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Profile photo could not be decoded. Try another image."));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
