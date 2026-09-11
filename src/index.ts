import { readdir } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { parseFile } from 'music-metadata'

const port = Number(process.env.PORT ?? 3000)
const app = new Hono()
const musicDirectory = 'D:\\Desktop\\参考\\dev'

app.get('/albums', async c => {
  const entries = await readdir(musicDirectory, {
    withFileTypes: true,
  })
  const files = entries
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.flac')
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  const result = await Promise.all(
    files.map(async ({ name }) => {
      const metadata = await parseFile(
        `${musicDirectory}\\${name}`
      )

      return {
        fileName: name,
        album: metadata.common.album,
      }
    })
  )

  return c.json(result)
})

app.get('/albums/:fileName', async c => {
  const fileName = c.req.param('fileName')

  const metadata = await parseFile(
    `${musicDirectory}\\${fileName}`
  )

  return c.json({
    fileName,
    title: metadata.common.title,
    artist: metadata.common.artist,
    album: metadata.common.album,
    albumArtist: metadata.common.albumartist,
    year: metadata.common.year,
    genre: metadata.common.genre,
    track: metadata.common.track,
    disk: metadata.common.disk,
  })
})

serve({
  fetch: app.fetch,
  port,
})
