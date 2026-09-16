import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { GetObjectCommand, ListObjectsV2Command, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

type Result = { key: string; status: "speech" | "needs_review" | "error"; transcript?: string; error?: string; processedAt: string };
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const account = required("R2_ACCOUNT_ID"), bucket = required("R2_BUCKET"), prefix = process.env.R2_PREFIX ?? "", key = required("R2_ACCESS_KEY_ID"), secret = required("R2_SECRET_ACCESS_KEY");
const client = new S3Client({ region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secret } });
const openai = new OpenAI({ apiKey: required("OPENAI_API_KEY") });
const checkpoint = process.env.R2_ANALYSIS_CHECKPOINT ?? ".r2-analysis.json";
const deleteNonSpeech = process.argv.includes("--delete-non-speech");
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
const results: Record<string, Result> = existsSync(checkpoint) ? JSON.parse(readFileSync(checkpoint, "utf8")) : {};
const save = () => { const stream = createWriteStream(checkpoint); stream.end(JSON.stringify(results, null, 2)); };
const runFfmpeg = (input: string, output: string) => new Promise<void>((resolve, reject) => { const child = spawn(ffmpeg, ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output], { stdio: "ignore" }); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))); });
const list = async () => { const objects: string[] = []; let token: string | undefined; do { const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })); objects.push(...(page.Contents ?? []).map((object) => object.Key).filter((value): value is string => Boolean(value) && /\.(mp4|mov|webm|m4v)$/i.test(value!))); token = page.IsTruncated ? page.NextContinuationToken : undefined; } while (token); return objects; };
const processOne = async (objectKey: string) => { const folder = await mkdtemp(join(tmpdir(), "symphony-r2-")); const video = join(folder, "source"); const audio = join(folder, "audio.wav"); try { const source = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey })); if (!source.Body) throw new Error("R2 object has no body"); const bytes = await source.Body.transformToByteArray(); await new Promise<void>((resolve, reject) => { const stream = createWriteStream(video); stream.once("error", reject); stream.once("finish", resolve); stream.end(bytes); }); await runFfmpeg(video, audio); const transcription = await openai.audio.transcriptions.create({ model: "gpt-4o-mini-transcribe", file: await toFile(readFileSync(audio), `${objectKey.split("/").pop() ?? "audio"}.wav`) }); const text = typeof transcription === "string" ? transcription : transcription.text; const status = text.trim() ? "speech" : "needs_review"; results[objectKey] = { key: objectKey, status, transcript: text.trim().slice(0, 500), processedAt: new Date().toISOString() }; save(); if (deleteNonSpeech && status !== "speech") await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })); console.log(`${status}\t${objectKey}`); } catch (error) { results[objectKey] = { key: objectKey, status: "error", error: error instanceof Error ? error.message : "unknown error", processedAt: new Date().toISOString() }; save(); console.error(`error\t${objectKey}\t${results[objectKey].error}`); } finally { await rm(folder, { recursive: true, force: true }); } };
const main = async () => { mkdirSync(join(checkpoint, ".."), { recursive: true }); const objects = await list(); const pending = objects.filter((objectKey) => !results[objectKey] || results[objectKey].status === "error"); console.log(`Found ${objects.length} videos; processing ${pending.length}. Checkpoint: ${checkpoint}`); for (const objectKey of pending) await processOne(objectKey); console.log(`Finished. Results saved to ${checkpoint}`); };
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
