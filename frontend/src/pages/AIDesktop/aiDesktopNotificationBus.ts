export type AIDesktopNotificationTone = 'success' | 'warning' | 'error' | 'info'
export type AIDesktopNotification = { id: number; tone: AIDesktopNotificationTone; message: string }
type Listener = (notification: AIDesktopNotification) => void

const listeners = new Set<Listener>()
let notificationId = 0

export function showAIDesktopNotification(tone: AIDesktopNotificationTone, message: string) {
  const notification = { id: ++notificationId, tone, message }
  listeners.forEach((listener) => listener(notification))
}

export function subscribeToAIDesktopNotifications(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
