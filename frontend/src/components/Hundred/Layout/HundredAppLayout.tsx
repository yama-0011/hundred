import { Link, Outlet, useLocation } from 'react-router-dom'
import HundredLoginStatus from '../Auth/HundredLoginStatus'
import '../../../styles/Hundred/hundred-app-layout.css'

function resolveApp(pathname: string) {
  if (pathname.startsWith('/anigram')) {
    return { title: 'Anigram', homePath: '/anigram' }
  }

  return { title: 'Creative IA', homePath: '/creative-ia' }
}

/** Hundred配下のUser Appで共有する最小構成のヘッダーと本文領域。 */
function HundredAppLayout() {
  const { pathname } = useLocation()
  const app = resolveApp(pathname)

  return (
    <div className="hundred-app-layout">
      <header className="hundred-app-header">
        <Link
          className="hundred-app-header__home"
          to="/"
          aria-label="Hundred Homeへ戻る"
          title="Hundred Homeへ戻る"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <Link className="hundred-app-header__title" to={app.homePath}>
          <h1>{app.title}</h1>
        </Link>
        <HundredLoginStatus />
      </header>
      <div className="hundred-app-layout__content">
        <Outlet />
      </div>
    </div>
  )
}

export default HundredAppLayout
