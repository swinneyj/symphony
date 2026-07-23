import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "File is required. Must be multipart/form-data with a 'file' field." },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB." },
        { status: 400 }
      );
    }

    // Generate a unique filename to prevent collisions
    const ext = path.extname(file.name) || "";
    const uniqueName = `${uuidv4()}${ext}`;

    // Ensure upload directory exists
    const uploadDir = "/tmp/symphony-uploads";
    await mkdir(uploadDir, { recursive: true });

    // Write file to disk
    const filePath = path.join(uploadDir, uniqueName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Build the URL (temporary local URL)
    const url = `/api/uploads/${uniqueName}`;

    // Log upload details
    console.log(`[UPLOAD] User ${session.user.id} uploaded:`, {
      originalName: file.name,
      savedAs: uniqueName,
      size: file.size,
      mimeType: file.type,
      path: filePath,
      url,
    });

    return NextResponse.json(
      {
        url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        path: filePath,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error handling file upload:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
