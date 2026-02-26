export async function uploadToCloudinary(file) {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    const debug = String(import.meta.env.VITE_CLOUDINARY_DEBUG || '').toLowerCase() === 'true';

    if (!cloudName || !uploadPreset) {
        throw new Error("Cloudinary no está configurado. Revisa tu archivo .env local.");
    }

    if (debug) {
        console.log('[Cloudinary] Using config', { cloudName, uploadPreset });
    }

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    try {
        const response = await fetch(url, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            const apiMessage = data?.error?.message;
            if (debug) {
                console.error('[Cloudinary] Upload failed', { status: response.status, apiMessage, cloudName, uploadPreset, data });
            }
            if (apiMessage && apiMessage.toLowerCase().includes('upload preset') && apiMessage.toLowerCase().includes('not found')) {
                throw new Error(
                    `Upload preset no encontrado en Cloudinary. Verifica que exista y sea Unsigned. Preset="${uploadPreset}", Cloud="${cloudName}"`
                );
            }
            throw new Error(apiMessage || "Error subiendo la imagen a Cloudinary");
        }

        return data.secure_url;
    } catch (err) {
        console.error("Upload error:", err);
        throw err;
    }
}
