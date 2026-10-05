import type { ElementType, ReactNode } from 'react'

const classes = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ')

export function AppShell({ children, className, split = false }: { children: ReactNode; className?: string; split?: boolean }) {
  return <div className={classes('ad-app-shell', split && 'ad-app-shell--split', className)}>{children}</div>
}

export function AppHeader({ eyebrow, breadcrumb, title, description, actions, className, titleAs: Title = 'h1' }: { eyebrow?: string; breadcrumb?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; titleAs?: ElementType }) {
  return <header className={classes('ad-app-header', className)}><div className="ad-app-header__identity">{breadcrumb && <div className="ad-app-header__breadcrumb">{breadcrumb}</div>}{eyebrow && <p className="ad-app-header__eyebrow">{eyebrow}</p>}<Title className="ad-app-header__title">{title}</Title>{description && <p className="ad-app-header__description">{description}</p>}</div>{actions && <div className="ad-app-header__actions">{actions}</div>}</header>
}

export function AppToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classes('ad-app-toolbar', className)}>{children}</div>
}

export function AppSidebar({ children, className }: { children: ReactNode; className?: string }) {
  return <aside className={classes('ad-app-sidebar', className)}>{children}</aside>
}

export function AppMain({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={classes('ad-app-main', className)}>{children}</main>
}

export function AppContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classes('ad-app-content-area', className)}>{children}</div>
}
