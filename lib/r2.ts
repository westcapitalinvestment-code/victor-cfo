import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 es compatible con la API de S3 — por eso usamos el SDK de
// AWS pero apuntando al endpoint de R2 en vez de a AWS. Aquí vive la
// Bóveda (documents): pólizas, permisos, contratos, licencias.
//
// Mismo patrón de cliente perezoso (lazy singleton) que lib/stripe.ts: si
// se construye el cliente al cargar el módulo, Next.js lo intenta durante
// el build de Vercel (importa todas las rutas para analizarlas) y, si las
// llaves todavía no están puestas como env var, puede tumbar el build
// entero. Construyéndolo adentro de getR2() solo se toca en tiempo de
// request, cuando las env vars ya están garantizadas.
let _r2: S3Client | null = null;

function getR2(): S3Client {
  if (!_r2) {
    _r2 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });
  }
  return _r2;
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME || "";
}

export async function subirArchivoR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await getR2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

// URL firmada temporal (5 min) para ver/descargar un archivo. El bucket se
// queda PRIVADO siempre — son documentos personales (contratos, licencias,
// permisos), nunca los hacemos públicos. Cada "Ver archivo" genera una URL
// nueva, así que no hay problema en que expire rápido.
export async function urlDescargaR2(key: string): Promise<string> {
  return getSignedUrl(getR2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 300 });
}

// Borra un archivo de R2 cuando el usuario elimina esa foto/PDF específico
// de un documento (o el documento entero). Si el archivo ya no existe en
// R2 por lo que sea, R2 simplemente no hace nada — no lanza error.
export async function borrarArchivoR2(key: string): Promise<void> {
  await getR2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
