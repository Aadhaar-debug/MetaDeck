import React, { useCallback, useState } from 'react'

export function useToasts() {
  const [toasts, setToasts] = useState([])
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((list) => [...list, { id, ...t }])
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 5000)
  }, [])
  return { toasts, push }
}

export default function Toasts({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind || 'info'}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
