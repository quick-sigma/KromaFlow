import { useTranslation } from 'react-i18next'
import { FiGlobe, FiSettings } from 'react-icons/fi'

type NavbarProps = {
  onOpenSettings: () => void
}

export default function Navbar({ onOpenSettings }: NavbarProps) {
  const { i18n } = useTranslation()

  return (
    <nav
      className="w-full flex items-center justify-between px-6 py-2 shrink-0 select-none"
      style={{
        backgroundColor: 'var(--bg-main)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* ── Brand: icon + tipografia ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <img
          src="/icon.png"
          alt="KromaFlow"
          className="w-8 h-8 object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
        <img
          src="/tipografia.avif"
          alt="KromaFlow"
          className="h-6 object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* ── Right: language switcher + settings ─────────────────────── */}
      <div className="flex items-center gap-1">
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
    </nav>
  )
}
