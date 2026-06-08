import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

interface Post {
  title: string
  url: string
  date: {
    time: number
    string: string
  }
  excerpt: string
}

function extractExcerpt(content: string, maxLen = 120): string {
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('>') || trimmed.startsWith('!')) continue
    const plain = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .replace(/&nbsp;/g, ' ')
    if (plain.length < 10) continue
    return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain
  }
  return ''
}

function buildPost(file: string, postsDir: string): Post {
  const raw = readFileSync(join(postsDir, file), 'utf-8')
  const { data: fm, content } = matter(raw)
  const date = new Date(fm.date as string)
  date.setUTCHours(12)
  return {
    title: fm.title as string,
    url: '/posts/' + file.replace(/\.md$/, ''),
    date: {
      time: +date,
      string: date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    },
    excerpt: extractExcerpt(content),
  }
}

function loadPosts(): Post[] {
  const postsDir = join(__dirname, 'posts')
  return readdirSync(postsDir)
    .filter((f: string) => f.endsWith('.md'))
    .map((file: string) => buildPost(file, postsDir))
    .sort((a: Post, b: Post) => b.date.time - a.date.time)
}

declare const data: Post[]
export { data }

export default {
  watch: ['posts/*.md'],
  async load(): Promise<Post[]> {
    return loadPosts()
  },
}
