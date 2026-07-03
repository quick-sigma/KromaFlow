/**
 * StepConfigDialog — dynamic configuration form generated from a step's
 * JSON Schema (config_schema).
 *
 * Renders a modal overlay with form controls matching the schema:
 * - boolean + frontend_type=switch → toggle switch
 * - boolean (default) → checkbox toggle
 * - string + enum (default) → select dropdown
 * - string + enum + frontend_type=dropdown + ui_type=radiogroup → radio group
 * - integer / number (default) → number input
 * - integer + frontend_type=slider → range slider
 * - string → text input
 * - object → grouped sub-fields
 * - anyOf with null + X → optional field of type X
 *
 * Cyber-Amethyst themed with proper typography.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StepInfo } from '../stores/steps'

// ── Types ────────────────────────────────────────────────────────────────────

type ResolvedSchema = {
  type: string | undefined
  enum?: string[]
  properties?: Record<string, unknown>
  default: unknown
  title?: string
  description?: string
  minimum?: number
  maximum?: number
  frontendType?: string
  uiOptions?: Record<string, unknown>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve a possibly-anyOf schema to its "real" type info.
 * Handles the common pattern: anyOf = [type, null] → type
 */
function resolveSchema(schema: unknown): ResolvedSchema {
  if (typeof schema !== 'object' || schema === null) {
    return { type: undefined, default: undefined }
  }

  const s = schema as Record<string, unknown>

  // anyOf with null → get the non-null type
  if (Array.isArray(s.anyOf)) {
    const nonNull = s.anyOf.find(
      (alt: unknown) =>
        typeof alt === 'object' &&
        alt !== null &&
        (alt as Record<string, unknown>).type !== 'null',
    )
    if (nonNull) {
      return resolveSchema(nonNull)
    }
  }

  return {
    type: s.type as string | undefined,
    enum: s.enum as string[] | undefined,
    properties: s.properties as Record<string, unknown> | undefined,
    default: s.default,
    title: s.title as string | undefined,
    description: s.description as string | undefined,
    minimum: s.minimum as number | undefined,
    maximum: s.maximum as number | undefined,
    frontendType: s.frontend_type as string | undefined,
    uiOptions: s.ui_options as Record<string, unknown> | undefined,
  }
}

/** Extract the properties from the top-level schema (or $ref → $defs). */
function getSchemaProperties(
  schema: Record<string, unknown>,
  defs?: Record<string, unknown>,
): Record<string, unknown> {
  const ref = schema.$ref as string | undefined
  if (ref && defs) {
    const defKey = ref.replace('#/$defs/', '')
    const def = defs[defKey] as Record<string, unknown> | undefined
    if (def?.properties) {
      return def.properties as Record<string, unknown>
    }
  }
  return (schema.properties as Record<string, unknown>) ?? {}
}

// ── Props ────────────────────────────────────────────────────────────────────

type StepConfigDialogProps = {
  step: StepInfo
  initialConfig: Record<string, unknown>
  onSave: (config: Record<string, unknown>) => void
  onClose: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StepConfigDialog({
  step,
  initialConfig,
  onSave,
  onClose,
}: StepConfigDialogProps) {
  const { t } = useTranslation()
  const [config, setConfig] =
    useState<Record<string, unknown>>(initialConfig)

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on backdrop
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      setConfig((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const schema = step.config_schema as Record<string, unknown>
  const defs = schema.$defs as Record<string, unknown> | undefined
  const properties = getSchemaProperties(schema, defs)

  // ── Resize-step specific: hide width/height when a named preset is selected ─
  const isResize = step.id === 'resize'
  const isCustomPreset = isResize ? String(config.preset ?? '1920x1080') === 'custom' : false

  const visibleProperties = useMemo(() => {
    if (!isResize) return Object.entries(properties)
    return Object.entries(properties).filter(([key]) => {
      if (key === 'width' || key === 'height') return isCustomPreset
      return true
    })
  }, [isResize, properties, isCustomPreset])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-label={`Configure ${step.name}`}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] rounded-xl shadow-2xl flex flex-col"
        style={{
          backgroundColor: 'var(--bg-main)',
          border: '1px solid var(--border-subtle)',
          animation: 'configDialogIn 150ms ease-out',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="min-w-0">
            <h2 className="text-lg truncate"
              style={{
                color: 'var(--text-main)',
                fontFamily: 'var(--font-heading)',
              }}>
              {t('stepConfig.configure', { name: step.name })}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
              v{step.version} &middot; {step.variant}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="transition-colors cursor-pointer ml-3 shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
            aria-label={t('stepConfig.close')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Form body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {Object.keys(properties).length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
              {t('stepConfig.noOptions')}
            </p>
          )}
          {visibleProperties.map(([key, propSchema]) => (
            <FieldRenderer
              key={key}
              name={key}
              schema={propSchema}
              value={config[key]}
              defs={defs}
              stepId={step.id}
              onChange={(val) => handleChange(key, val)}
            />
          ))}
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg transition cursor-pointer"
            style={{
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-main)'
              e.currentTarget.style.backgroundColor = 'var(--bg-card)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {t('stepConfig.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onSave(config)}
            className="px-4 py-2 rounded-lg text-white transition cursor-pointer"
            style={{
              backgroundColor: 'var(--brand-primary)',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
              fontSize: '0.8rem',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
          >
            {t('stepConfig.save')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes configDialogIn {
          from { opacity: 0; transform: scale(0.96) translateY(-8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ── Field renderer ───────────────────────────────────────────────────────────

function FieldRenderer({
  name,
  schema: rawSchema,
  value,
  defs,
  stepId,
  onChange,
}: {
  name: string
  schema: unknown
  value: unknown
  defs?: Record<string, unknown>
  stepId?: string
  onChange: (val: unknown) => void
}) {
  const { t } = useTranslation()
  const resolved = resolveSchema(rawSchema)

  // Resolve $ref
  let properties = resolved.properties
  if (!properties) {
    const raw = rawSchema as Record<string, unknown>
    if (raw.$ref && defs) {
      const defKey = (raw.$ref as string).replace('#/$defs/', '')
      const def = defs[defKey] as Record<string, unknown> | undefined
      if (def?.properties) {
        properties = def.properties as Record<string, unknown>
      }
    }
  }

  // Use i18n translation for field labels when available, fall back to schema
  const tKey = stepId ? `stepConfig.fields.${stepId}.${name}` : undefined
  const label = (tKey ? t(`${tKey}.title`, { defaultValue: '' }) : undefined)
    || resolved.title
    || name
  const help = (tKey ? t(`${tKey}.description`, { defaultValue: '' }) : undefined)
    || resolved.description
  const isBool = resolved.type === 'boolean'
  const isEnum = Array.isArray(resolved.enum) && resolved.enum.length > 0
  const isInt = resolved.type === 'integer'
  const isNum = resolved.type === 'number'
  const isString = resolved.type === 'string'
  const isObject = resolved.type === 'object' && properties
  const currentVal = value ?? resolved.default

  const frontendType = resolved.frontendType

  // Boolean + frontend_type=switch → toggle switch
  if (isBool && frontendType === 'switch') {
    const checked = currentVal === true
    return (
      <label className="flex items-center justify-between gap-3 cursor-pointer group py-1">
        <div className="min-w-0">
          <span className="text-sm transition-colors"
            style={{ color: 'var(--text-main)', fontFamily: 'var(--font-body)' }}>
            {label}
          </span>
          {help && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{help}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
            checked ? 'bg-purple-500' : 'bg-gray-600'
          }`}
          style={{
            backgroundColor: checked ? 'var(--brand-primary, #a855f7)' : undefined,
          }}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </label>
    )
  }

  // Boolean → checkbox toggle
  if (isBool) {
    const checked = currentVal === true
    return (
      <label className="flex items-center gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded cursor-pointer"
          style={{ accentColor: 'var(--brand-primary)' }}
        />
        <div className="min-w-0">
          <span className="text-sm transition-colors"
            style={{ color: 'var(--text-main)', fontFamily: 'var(--font-body)' }}>
            {label}
          </span>
          {help && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{help}</p>
          )}
        </div>
      </label>
    )
  }

  // Integer + frontend_type=slider → range slider
  if ((isInt || isNum) && frontendType === 'slider') {
    const min = resolved.minimum ?? 0
    const max = resolved.maximum ?? 100
    const val = typeof currentVal === 'number' ? currentVal : resolved.default as number ?? min
    return (
      <FieldGroup label={label} help={help}>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={min}
            max={max}
            value={val}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              onChange(v)
            }}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
            style={{ accentColor: 'var(--brand-primary)', backgroundColor: 'var(--bg-card)' }}
          />
          <span className="text-sm w-10 text-right tabular-nums"
            style={{ color: 'var(--text-main)', fontFamily: 'var(--font-ui)' }}>
            {val}
          </span>
        </div>
        <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </FieldGroup>
    )
  }

  // Enum with frontend_type=dropdown + ui_options.ui_type=radiogroup → radio buttons
  if (isEnum && frontendType === 'dropdown' && resolved.uiOptions?.ui_type === 'radiogroup') {
    const options = resolved.enum!
    const selected = String(currentVal ?? options[0])
    return (
      <fieldset className="rounded-lg p-3"
        style={{ border: '1px solid var(--border-subtle)' }}>
        <legend className="text-xs font-semibold uppercase tracking-wider px-1 mb-1"
          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          {label}
        </legend>
        {help && <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{help}</p>}
        <div className="space-y-2">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name={name}
                value={opt}
                checked={selected === opt}
                onChange={() => onChange(opt)}
                className="w-4 h-4 cursor-pointer"
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              <span className="text-sm transition-colors"
                style={{ color: 'var(--text-main)', fontFamily: 'var(--font-body)' }}>
                {opt}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  // Enum → select dropdown
  if (isEnum) {
    return (
      <FieldGroup label={label} help={help}>
        <select
          value={String(currentVal ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {resolved.enum!.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </FieldGroup>
    )
  }

  // Integer / Number → number input
  if (isInt || isNum) {
    return (
      <FieldGroup label={label} help={help}>
        <input
          type="number"
          value={currentVal ?? ''}
          min={resolved.minimum}
          max={resolved.maximum}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === '' ? null : isInt ? parseInt(v, 10) : Number(v))
          }}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            fontFamily: 'var(--font-ui)',
          }}
        />
      </FieldGroup>
    )
  }

  // String → text input
  if (isString) {
    return (
      <FieldGroup label={label} help={help}>
        <input
          type="text"
          value={String(currentVal ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            fontFamily: 'var(--font-ui)',
          }}
        />
      </FieldGroup>
    )
  }

  // Object → nested fields
  if (isObject && properties) {
    return (
      <fieldset className="rounded-lg p-3"
        style={{ border: '1px solid var(--border-subtle)' }}>
        <legend className="text-xs font-semibold uppercase tracking-wider px-1"
          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          {label}
        </legend>
        <div className="space-y-3 mt-2">
          {Object.entries(properties).map(([subKey, subSchema]) => (
            <FieldRenderer
              key={subKey}
              name={subKey}
              schema={subSchema}
              value={
                currentVal && typeof currentVal === 'object'
                  ? (currentVal as Record<string, unknown>)[subKey]
                  : undefined
              }
              defs={defs}
              stepId={stepId}
              onChange={(subVal) => {
                const obj = {
                  ...(typeof currentVal === 'object' && currentVal !== null
                    ? (currentVal as Record<string, unknown>)
                    : {}),
                  [subKey]: subVal,
                }
                onChange(obj)
              }}
            />
          ))}
        </div>
      </fieldset>
    )
  }

  // Fallback: unknown type — show raw value
  return (
    <FieldGroup label={label} help={help}>
      <code className="block text-xs rounded px-2 py-1"
        style={{
          color: 'var(--text-muted)',
          backgroundColor: 'var(--bg-card)',
          fontFamily: 'var(--font-ui)',
        }}>
        {String(currentVal ?? '')}
      </code>
    </FieldGroup>
  )
}

// ── Field layout wrapper ─────────────────────────────────────────────────────

function FieldGroup({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm block mb-1"
        style={{ color: 'var(--text-main)', fontFamily: 'var(--font-body)' }}>
        {label}
      </span>
      {help && <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{help}</p>}
      {children}
    </label>
  )
}
