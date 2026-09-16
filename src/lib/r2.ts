import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

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
  const objects: Array<{ key: string | undefined; size: number; lastModified: Date | null }> = [];
  let continuationToken: string | undefined;
  do {
    const response = await config.client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: config.prefix, ContinuationToken: continuationToken }));
    objects.push(...(response.Contents ?? []).map((object) => ({ key: object.Key, size: object.Size ?? 0, lastModified: object.LastModified ?? null })));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return { bucket: config.bucket, prefix: config.prefix, objects };
}

export async function getR2Object(key: string) {
  const config = r2Config();
  if (!config || !key.startsWith(config.prefix)) return null;
  return { config, response: await config.client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key })) };
}
