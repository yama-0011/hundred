import { useEffect, useState } from 'react'
import { subscribeToAIDesktopNotifications, type AIDesktopNotification, type AIDesktopNotificationTone } from './aiDesktopNotificationBus'

const labels: Record<AIDesktopNotificationTone, string> = {
  success: '成功',
  warning: '注意',
  error: 'エラー',
  info: 'お知らせ',
}

const marks: Record<AIDesktopNotificationTone, string> = {
  success: '✓',
  warning: '!',
  error: '×',
  info: 'i',
}

function NotificationItem({ notification, onClose }: { notification: AIDesktopNotification; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 5000); return () => window.clearTimeout(timer) }, [onClose])
  return <article className={`ad-notification ${notification.tone}`} role={notification.tone === 'error' ? 'alert' : 'status'}><span aria-hidden="true">{marks[notification.tone]}</span><div><strong>{labels[notification.tone]}</strong><p>{notification.message}</p></div><button type="button" aria-label="通知を閉じる" onClick={onClose}>×</button></article>
}

export default function AIDesktopNotifications() {
  const [notifications, setNotifications] = useState<AIDesktopNotification[]>([])
  useEffect(() => {
    return subscribeToAIDesktopNotifications((notification) => setNotifications((current) => [...current.slice(-3), notification]))
  }, [])
  return <section className="ad-notifications" aria-label="操作結果">{notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} onClose={() => setNotifications((current) => current.filter((candidate) => candidate.id !== notification.id))} />)}</section>
}
