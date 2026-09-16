import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

export function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { bucket, prefix: process.env.R2_PREFIX ?? "", client: new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } }) };
}

export async function listR2Objects() {
  const config = r2Config();
  if (!config) return null;
  const response = await config.client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.prefix }));
  return { bucket: config.bucket, prefix: config.prefix, objects: (response.Contents ?? []).map((object) => ({ key: object.Key, size: object.Size ?? 0, lastModified: object.LastModified ?? null })) };
}
