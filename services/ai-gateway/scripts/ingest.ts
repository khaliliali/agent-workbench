import fs from 'fs/promises';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

async function extractText(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);

  if (filePath.endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (filePath.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${filePath}`);
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

async function ingestFile(filePath: string, gatewayUrl: string, token: string) {
  console.log(`Extracting text from ${filePath}...`);
  const text = await extractText(filePath);

  console.log(`Chunking text...`);
  const chunks = chunkText(text, 500, 50); // 500 words per chunk with 50 words overlap
  console.log(`Created ${chunks.length} chunks.`);

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Ingesting chunk ${i + 1}/${chunks.length}...`);

    const res = await fetch(`${gatewayUrl}/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text: chunks[i],
        source: filePath,
        chunkIndex: i,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to ingest chunk ${i + 1}: ${errorText}`);
    }
  }

  console.log(`Ingestion complete for ${filePath}.`);
}

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8787';
const CLIENT_ID = process.env.GATEWAY_CLIENT_ID!;
const CLIENT_SECRET = process.env.GATEWAY_CLIENT_SECRET!;

async function main() {
  const tokenRes = await fetch(`${GATEWAY_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
  });
  const { access_token } = await tokenRes.json();

  await ingestFile(
    'documents/RAG-Test-Manual-PDF.pdf',
    GATEWAY_URL,
    access_token,
  );
  await ingestFile(
    'documents/RAG-Test-Handbook-DOCX.docx',
    GATEWAY_URL,
    access_token,
  );
}

main().catch(console.error);
