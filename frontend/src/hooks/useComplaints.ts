import { useEffect } from 'react'
import api from '../services/api'
import { useComplaintsStore } from '../stores/complaintsStore'
import type { EnrichedComplaint } from '../types/complaint'

interface ComplaintsResponse {
  complaints: EnrichedComplaint[]
}

// Fetches the initial complaint list once; live updates arrive via socket.
export function useComplaints(): void {
  const setComplaints = useComplaintsStore((s) => s.setComplaints)
  const setLoading = useComplaintsStore((s) => s.setLoading)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .get<ComplaintsResponse>('/complaints', { params: { limit: 50 } })
      .then(({ data }) => {
        if (active) setComplaints(data.complaints)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [setComplaints, setLoading])
}
