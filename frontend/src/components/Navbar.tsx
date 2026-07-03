import { useTranslation } from 'react-i18next'
import { FiGlobe, FiSettings } from 'react-icons/fi'
import iconUrl from '@Logo/icon.avif'
import tipografiaUrl from '@Logo/tipografia.avif'

type NavbarProps = {
  onOpenSettings: () => void
}

export default function Navbar({ onOpenSettings }: NavbarProps) {
  const { i18n } = useTranslation()

  return (
    <nav
      className="w-full flex items-center px-8 py-4 shrink-0 select-none"
      style={{
        backgroundColor: 'var(--bg-main)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* ── Invisible spacer matching PipelineEditor width ──────────── */}
      <div className="w-80 shrink-0" />

      {/* ── Content area: brand centered, controls anchored right ──── */}
      <div className="flex-1 flex items-center justify-center relative">
        <div className="flex items-center gap-3">
          <img
            src={iconUrl}
            alt="KromaFlow"
            width={450}
            height={446}
            className="h-8 w-auto object-contain"
          />
          <img
            src={tipografiaUrl}
            alt="KromaFlow"
            width={1101}
            height={136}
            className="h-6 w-auto object-contain"
          />
        </div>

        <div className="absolute right-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en')
            }
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer text-xs"
            style={{
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-main)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            aria-label="Switch language"
          >
            <FiGlobe className="w-3.5 h-3.5" />
            <span>{i18n.language === 'en' ? 'EN' : 'ES'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center justify-center p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              color: 'var(--text-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-main)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            aria-label="Settings"
          >
            <FiSettings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </nav>
  )
}
