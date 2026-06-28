import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { GroupDocument, DocumentId } from '@federation/models'

interface GroupContextValue {
  activeGroupId: DocumentId | null
  groupDoc: GroupDocument | null
  setActiveGroupId: (id: DocumentId | null) => void
  refresh: () => void
}

const GroupContext = createContext<GroupContextValue>({
  activeGroupId: null,
  groupDoc: null,
  setActiveGroupId: () => {},
  refresh: () => {},
})

export interface GroupContextProviderProps {
  children: React.ReactNode
  /** Callback to fetch the current GroupDocument. */
  getGroup: (id: DocumentId) => GroupDocument | null
  initialGroupId?: DocumentId
}

export function GroupContextProvider({ children, getGroup, initialGroupId }: GroupContextProviderProps) {
  const [activeGroupId, setActiveGroupId] = useState<DocumentId | null>(initialGroupId ?? null)
  const [groupDoc, setGroupDoc] = useState<GroupDocument | null>(null)

  // Keep context in sync when the parent switches the active group
  useEffect(() => {
    if (initialGroupId !== undefined && initialGroupId !== activeGroupId) {
      setActiveGroupId(initialGroupId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroupId])

  const refresh = useCallback(() => {
    if (!activeGroupId) { setGroupDoc(null); return }
    try { setGroupDoc(getGroup(activeGroupId)) } catch { setGroupDoc(null) }
  }, [activeGroupId, getGroup])

  useEffect(() => { refresh() }, [refresh])

  return (
    <GroupContext.Provider value={{ activeGroupId, groupDoc, setActiveGroupId, refresh }}>
      {children}
    </GroupContext.Provider>
  )
}

export function useGroupContext(): GroupContextValue {
  return useContext(GroupContext)
}
