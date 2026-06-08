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
  let inCodeBlock = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ') || /^\d+\.\s/.test(trimmed) || /^\*+$/.test(trimmed) || /^[-=]{3,}$/.test(trimmed) || trimmed.startsWith('>') || trimmed.startsWith('![') || trimmed.startsWith('<') || trimmed.startsWith('|')) continue
    const plain = trimmed
      .replace(/\[([^\]]+)\]\((?:[^)(]|\([^)]*\))*\)/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/&nbsp;/g, ' ')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&amp;/g, '&')
      .replace(/&laquo;/g, '«')
      .replace(/&raquo;/g, '»')
    if (plain.length < 10) continue
    return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain
  }
  return ''
}

function buildPost(file: string, postsDir: string): Post {
  const raw = readFileSync(join(postsDir, file), 'utf-8')
  const { data: fm, content } = matter(raw)
  if (!fm.date) throw new Error(`Post "${file}" is missing a date in frontmatter`)
  if (!fm.title) throw new Error(`Post "${file}" is missing a title in frontmatter`)
  const rawDate = fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : String(fm.date).slice(0, 10)
  const date = new Date(rawDate + 'T12:00:00Z')
  if (isNaN(date.getTime())) throw new Error(`Post "${file}" has an unparseable date: ${fm.date}`)
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
