import { useEffect } from 'react'
import api from '../services/api'
import { useComplaintsStore } from '../stores/complaintsStore'
import type { EnrichedComplaint } from '../types/complaint'

interface ComplaintsResponse {
  complaints: EnrichedComplaint[]
  pagination?: { page: number; limit: number; total: number; pages: number }
}

// Backend caps limit at 100 — page through until we have every complaint, so a
// reload matches the live count instead of being truncated to one page.
const PAGE_SIZE = 100

// Fetches the full complaint list once; live updates arrive via socket.
export function useComplaints(): void {
  const setComplaints = useComplaintsStore((s) => s.setComplaints)
  const setLoading = useComplaintsStore((s) => s.setLoading)

  useEffect(() => {
    let active = true
    setLoading(true)

    async function fetchAll(): Promise<void> {
      const all: EnrichedComplaint[] = []
      let page = 1
      // Fetch first page, learn the total, then keep paging until we have all.
      // Hard cap on pages guards against a runaway loop.
      for (let guard = 0; guard < 100; guard++) {
        const { data } = await api.get<ComplaintsResponse>('/complaints', {
          params: { page, limit: PAGE_SIZE },
        })
        all.push(...data.complaints)
        const pages = data.pagination?.pages ?? 1
        if (page >= pages || data.complaints.length === 0) break
        page++
      }
      if (active) setComplaints(all)
    }

    fetchAll()
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [setComplaints, setLoading])
}
