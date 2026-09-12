import { readdir } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { parseFile } from 'music-metadata'

const port = Number(process.env.PORT ?? 3000)
const app = new Hono()
const musicDirectory = 'D:\\Desktop'

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

  const filePath = `${musicDirectory}\\${fileName}`

  const metadata = await parseFile(filePath)

  const tags = metadata.native.vorbis

  const getTag = (name: string) =>
    tags?.find(tag => tag.id === name)?.value

  const tracks = []

  for (let i = 1; i <= 99; i++) {
    const index = String(i).padStart(2, '0')

    const work = getTag(`CUE_TRACK${index}_WORK`)

    if (!work) break

    tracks.push({
      track: i,
      composer: getTag(`CUE_TRACK${index}_COMPOSER`),
      work,
      performer: {
        conductor: getTag(`CUE_TRACK${index}_CONDUCTOR`),
        orchestra: getTag(`CUE_TRACK${index}_ORCHESTRA`),
        soloist: getTag(`CUE_TRACK${index}_SOLOIST`),
      },
      year: getTag(`CUE_TRACK${index}_YEAR`),
      movement: getTag(`CUE_TRACK${index}_MOVEMENT`),
    })
  }

  return c.json({
    album: getTag('ALBUM'),
    comment: getTag('COMMENT'),
    tracks,
  })
})

serve({
  fetch: app.fetch,
  port,
})
