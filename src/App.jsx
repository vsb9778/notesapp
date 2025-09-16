// src/App.jsx
import { useEffect, useMemo, useState } from 'react'
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json' // <- adjust path if needed

import { Authenticator, View, Text, Button, TextField, Flex, Image } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'

// Data & Storage (Gen 2)
import { generateClient } from 'aws-amplify/data'
import { uploadData, getUrl, remove } from 'aws-amplify/storage'

Amplify.configure(outputs)

// Create a typed client for your models (Note must exist in your schema)
const client = generateClient()

export default function App() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', imageFile: null })

  // Build a display-friendly list with signed image URLs
  const withDisplayUrls = async (items) => {
    const enriched = await Promise.all(
      items.map(async (n) => {
        if (n.imageKey) {
          try {
            const url = await getUrl({ path: n.imageKey })
            return { ...n, imageUrl: url?.url?.toString() }
          } catch {
            return { ...n, imageUrl: null }
          }
        }
        return { ...n, imageUrl: null }
      })
    )
    return enriched
  }

  // --- fetchNotes: list Notes and resolve image URLs
  const fetchNotes = async () => {
    setLoading(true)
    try {
      const res = await client.models.Note.list()
      const items = res?.data ?? res?.items ?? [] // handle SDK shape variations
      setNotes(await withDisplayUrls(items))
    } finally {
      setLoading(false)
    }
  }

  // --- createNote: optional image upload + create model
  const createNote = async (e) => {
    e.preventDefault()
    if (!form.name?.trim()) return

    setCreating(true)
    try {
      let imageKey = null

      if (form.imageFile) {
        // Use a stable path; you can include the user sub or timestamp
        const key = `notes/${crypto.randomUUID()}-${form.imageFile.name}`
        await uploadData({
          path: key,
          data: form.imageFile,
          options: { contentType: form.imageFile.type },
        }).result
        imageKey = key
      }

      await client.models.Note.create({
        name: form.name.trim(),
        description: form.description?.trim() || '',
        imageKey, // store the S3 key on the note
      })

      // Reset form, refresh list
      setForm({ name: '', description: '', imageFile: null })
      await fetchNotes()
    } finally {
      setCreating(false)
    }
  }

  // --- deleteNote: remove model (and image if present)
  const deleteNote = async (note) => {
    // Optimistic UI (optional)
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    try {
      await client.models.Note.delete({ id: note.id })
      if (note.imageKey) {
        // Delete the file from storage (optional)
        await remove({ path: note.imageKey }).catch(() => {})
      }
    } catch {
      // If delete failed, refetch to re-sync
      await fetchNotes()
    }
  }

  useEffect(() => {
    fetchNotes()
  }, [])

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <View padding="1.5rem" maxWidth="900px" margin="0 auto">
          <Flex justifyContent="space-between" alignItems="center" marginBottom="1rem">
            <Text as="h1" fontSize="2rem" fontWeight="700">Notes App</Text>
            <Flex gap="0.5rem" alignItems="center">
              <Text>Signed in as {user?.username}</Text>
              <Button onClick={signOut} variation="link">Sign out</Button>
            </Flex>
          </Flex>

          {/* Create Note Form */}
          <form onSubmit={createNote}>
            <Flex direction="column" gap="0.75rem" marginBottom="1.5rem">
              <TextField
                label="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                isRequired
              />
              <TextField
                label="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  setForm((f) => ({ ...f, imageFile: file }))
                }}
              />
              <Button type="submit" isDisabled={creating}>
                {creating ? 'Creating…' : 'Create Note'}
              </Button>
            </Flex>
          </form>

          {/* Notes List */}
          <View as="section">
            <Flex justifyContent="space-between" alignItems="center" marginBottom="0.5rem">
              <Text as="h2" fontSize="1.25rem" fontWeight="600">Your Notes</Text>
              <Button size="small" onClick={fetchNotes} isDisabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </Flex>

            <Flex wrap="wrap" gap="1rem">
              {notes.length === 0 && !loading && <Text>No notes yet.</Text>}
              {notes.map((note) => (
                <View key={note.id} border="1px solid var(--amplify-colors-neutral-20)" padding="1rem" borderRadius="0.75rem" width="280px">
                  <Text as="h3" fontWeight="700" marginBottom="0.25rem">{note.name}</Text>
                  {note.description && <Text marginBottom="0.5rem">{note.description}</Text>}
                  {note.imageUrl && (
                    <Image
                      src={note.imageUrl}
                      alt={note.name}
                      width="100%"
                      height="180px"
                      objectFit="cover"
                      marginBottom="0.5rem"
                    />
                  )}
                  <Button size="small" variation="destructive" onClick={() => deleteNote(note)}>
                    Delete
                  </Button>
                </View>
              ))}
            </Flex>
          </View>
        </View>
      )}
    </Authenticator>
  )
}
