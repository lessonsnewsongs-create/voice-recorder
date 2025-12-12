import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { transcriptText, transcriptName } = await req.json();

    if (!transcriptText) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_KEY),
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });

    // Convert transcript text into a buffer
    const buffer = Buffer.from(transcriptText, "utf-8");

    const upload = await drive.files.create({
      requestBody: {
        name: `${transcriptName || "transcript"}.txt`,
        mimeType: "text/plain",
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: "text/plain",
        body: buffer,
      },
    });

    return NextResponse.json({ fileId: upload.data.id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
