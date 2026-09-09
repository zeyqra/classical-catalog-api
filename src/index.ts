import { readdir } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const port = Number(process.env.PORT ?? 3000);
const app = new Hono();
const musicDirectory = "D:\\Desktop\\参考";

app.get("/getFiles", async (c) => {
  try {
    const entries = await readdir(musicDirectory, { withFileTypes: true });
    const fileNames = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".flac"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    return c.json(fileNames);
  } catch {
    return c.json({ error: "Failed to read music directory" }, 500);
  }
});

serve(
  {
    fetch: app.fetch,
    port,
  },
);
