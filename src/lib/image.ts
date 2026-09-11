// Redimensionne une image côté navigateur avant upload (logos tenant/client). Les logos ne
// sont jamais affichés à plus de ~60px dans l'app ou les PDF générés, mais un fichier uploadé
// tel quel peut faire plusieurs Mo (photo/scan haute résolution) : pdf-lib embarque l'image à
// sa taille de fichier d'origine, pas à sa taille d'affichage, donc un logo trop lourd peut
// faire gonfler chaque PDF généré au point de faire échouer un export groupé (ex: ZIP de
// toutes les factures d'un mois). On downscale donc systématiquement au moment de l'upload.
export async function resizeImageFile(file: File, maxDim = 300): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob) return file;

    // ne garde le fichier redimensionné que s'il est vraiment plus léger ; sinon on garde
    // l'original (évite de re-uploader un fichier plus gros pour une petite image déjà légère)
    return blob.size < file.size ? new File([blob], file.name, { type }) : file;
  } catch {
    return file;
  }
}
