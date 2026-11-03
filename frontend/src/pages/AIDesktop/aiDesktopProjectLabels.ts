import type { AIDesktopProjectDevelopmentMode, AIDesktopProjectStatus } from '../../services/AIDesktop/aiDesktopApi'

export const statusLabels: Record<AIDesktopProjectStatus, string> = {
  planning: '企画', proposal: '提案', design: '設計', development: '開発', review: '確認', completed: '完了', 'on-hold': '保留',
}
export const developmentModeLabels: Record<AIDesktopProjectDevelopmentMode, string> = { personal: '個人開発', team: 'チーム開発' }
