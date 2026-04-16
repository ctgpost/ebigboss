const CLOUD_NAME = "dkwwljbmy";
const UPLOAD_PRESET = "bigboss";

export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

export async function uploadToCloudinary(file: File, folder: string = "general"): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", `bigboss/${folder}`);

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Cloudinary আপলোড ব্যর্থ হয়েছে");
  }

  const data = await response.json();
  return data.secure_url;
}

export function getCloudinaryThumbnail(url: string, width: number = 200, height: number = 200): string {
  if (!url || !url.includes("cloudinary.com")) return url;
  return url.replace("/upload/", `/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`);
}
