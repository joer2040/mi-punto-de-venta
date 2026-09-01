import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { financialService } from '../api/financialService'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius, shadow } from '../lib/designTokens'
import FinanceAlert from '../components/FinanceAlert'
import FinancesTransferPanel from '../components/FinancesTransferPanel'
import FinancesOwnerContributionPanel from '../components/FinancesOwnerContributionPanel'
import FinancesDiscrepancyPanel from '../components/FinancesDiscrepancyPanel'
import FinancesOwnerWithdrawalPanel from '../components/FinancesOwnerWithdrawalPanel'
import FinancesJournalReversalPanel from '../components/FinancesJournalReversalPanel'

const ACCENT = colors.violet700

const reportCards = [
  {
    id: 'finances-balances',
    title: 'Saldos de cuentas',
    description: 'Consulta el saldo actual de cada cuenta contable.',
  },
  {
    id: 'finances-journal',
    title: 'Pólizas / Asientos',
    description: 'Revisa todos los movimientos contables por rango de fechas.',
  },
  {
    id: 'finances-ledger',
    title: 'Mayor contable',
    description: 'Historial de movimientos de una cuenta con saldo acumulado.',
  },
  {
    id: 'finances-sessions',
    title: 'Sesiones de caja',
    description: 'Histórico de sesiones de caja con sus diferencias y resoluciones.',
  },
]

const operationCards = [
  {
    id: 'transfer',
    title: 'Traspaso entre fondos',
    description: 'Mueve efectivo entre Caja operativa, Caja fuerte y Banco.',
  },
  {
    id: 'contribution',
    title: 'Aportación del propietario',
    description: 'Registra una entrada de capital a los fondos.',
  },
  {
    id: 'withdrawal',
    title: 'Retiro del propietario',
    description: 'Registra un retiro de capital de los fondos. Requiere autorización.',
  },
  {
    id: 'discrepancy',
    title: 'Resolución de diferencia',
    description: 'Registra el sobrante o faltante de una sesión de caja.',
  },
  {
    id: 'reversal',
    title: 'Reversa de póliza',
    description: 'Revierte un asiento contable con justificación. Requiere autorización.',
  },
]

const FinancesHome = ({ onNavigate }) => {
  const { isMobile } = useResponsive()
  const { canAccessPage, isSuperadmin } = useAuth()
  const [activeOperation, setActiveOperation] = useState(null)
  const [ledgerStatus, setLedgerStatus] = useState(null)
  const visibleReports = reportCards.filter((card) => canAccessPage(card.id))

  useEffect(() => {
    financialService
      .getLedgerStatus()
      .then((data) => setLedgerStatus(data))
      .catch(() => setLedgerStatus({ is_active: false, ledger_cutover_at: null }))
  }, [])

  return (
    <div style={getContainerStyle(isMobile)}>
      <section style={heroStyle}>
        <div style={eyebrowStyle}>FINANZAS</div>
        <h2 style={getTitleStyle(isMobile)}>Módulo Financiero</h2>
        <p style={subtitleStyle}>
          Consulta saldos de cuentas, pólizas, mayor contable y sesiones de caja.
          Registra traspasos, aportaciones y resuelve diferencias de caja.
        </p>
        {ledgerStatus && (
          <div style={getLedgerBadgeStyle(ledgerStatus.is_active)}>
            <span style={getLedgerDotStyle(ledgerStatus.is_active)} />
            <span>
              {ledgerStatus.is_active
                ? `Ledger activo — corte: ${formatLedgerDate(ledgerStatus.ledger_cutover_at)}`
                : 'Ledger inactivo'}
            </span>
          </div>
        )}
      </section>

      <section style={cardsSectionStyle}>
        <div style={sectionLabelStyle}>Reportes</div>
        <div style={getCardsGridStyle(isMobile)}>
          {visibleReports.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onNavigate(card.id)}
              style={{
                ...cardButtonStyle,
                borderTop: `5px solid ${ACCENT}`,
              }}
            >
              <div style={{ color: ACCENT, ...moduleTagStyle }}>Reporte</div>
              <div style={cardTitleStyle}>{card.title}</div>
              <div style={cardDescriptionStyle}>{card.description}</div>
              <div style={{ ...cardLinkStyle, color: ACCENT }}>Abrir</div>
            </button>
          ))}
        </div>
      </section>

      {isSuperadmin && (
        <section style={cardsSectionStyle}>
          <div style={sectionLabelStyle}>Operaciones</div>

          {activeOperation === 'transfer' ? (
            <div style={panelWrapStyle}>
              <FinancesTransferPanel
                onClose={() => setActiveOperation(null)}
                onNavigate={onNavigate}
              />
            </div>
          ) : activeOperation === 'contribution' ? (
            <div style={panelWrapStyle}>
              <FinancesOwnerContributionPanel
                onClose={() => setActiveOperation(null)}
                onNavigate={onNavigate}
              />
            </div>
          ) : activeOperation === 'discrepancy' ? (
            <div style={panelWrapStyle}>
              <FinancesDiscrepancyPanel
                onClose={() => setActiveOperation(null)}
                onNavigate={onNavigate}
              />
            </div>
          ) : activeOperation === 'withdrawal' ? (
            <div style={panelWrapStyle}>
              <FinancesOwnerWithdrawalPanel
                onClose={() => setActiveOperation(null)}
                onNavigate={onNavigate}
              />
            </div>
          ) : activeOperation === 'reversal' ? (
            <div style={panelWrapStyle}>
              <FinancesJournalReversalPanel
                onClose={() => setActiveOperation(null)}
                onNavigate={onNavigate}
              />
            </div>
          ) : (
            <>
              <div style={alertWrapStyle}>
                <FinanceAlert
                  type="info"
                  title="Todas las operaciones disponibles"
                  message="Traspaso, Aportación, Resolución de diferencia, Retiro y Reversa de póliza."
                />
              </div>
              <div style={getCardsGridStyle(isMobile)}>
                {operationCards.map((card) =>
                  card.id === 'transfer' ||
                  card.id === 'contribution' ||
                  card.id === 'discrepancy' ||
                  card.id === 'withdrawal' ||
                  card.id === 'reversal' ? (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setActiveOperation(card.id)}
                      style={{ ...cardButtonStyle, borderTop: `5px solid ${ACCENT}` }}
                    >
                      <div style={{ color: ACCENT, ...moduleTagStyle }}>Operación</div>
                      <div style={cardTitleStyle}>{card.title}</div>
                      <div style={cardDescriptionStyle}>{card.description}</div>
                      <div style={{ ...cardLinkStyle, color: ACCENT }}>Ejecutar</div>
                    </button>
                  ) : (
                    <div key={card.id} style={disabledCardStyle}>
                      <div style={disabledTagStyle}>Operación · Próximamente</div>
                      <div style={disabledCardTitleStyle}>{card.title}</div>
                      <div style={cardDescriptionStyle}>{card.description}</div>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}

const getContainerStyle = (isMobile) => ({
  padding: isMobile ? space[6] : `${space[8]} ${space[10]}`,
})

const heroStyle = {
  background: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 55%, #dbeafe 100%)',
  borderRadius: radius.xl,
  boxShadow: shadow.lg,
  overflow: 'hidden',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  padding: space[10],
}

const eyebrowStyle = {
  color: ACCENT,
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

const getTitleStyle = (isMobile) => ({
  margin: `${space[5]} 0 ${space[6]} 0`,
  color: colors.gray900,
  fontSize: isMobile ? type['2xl'] : type['3xl'],
  lineHeight: 1.05,
})

const subtitleStyle = {
  margin: 0,
  color: colors.gray600,
  fontSize: type.md,
  maxWidth: '700px',
  lineHeight: 1.6,
}

const cardsSectionStyle = {
  marginTop: space[8],
}

const sectionLabelStyle = {
  color: colors.gray500,
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: space[6],
}

const getCardsGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: space[7],
})

const cardButtonStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  padding: `${space[7]} ${space[8]}`,
  borderLeft: `1px solid ${colors.gray200}`,
  borderRight: `1px solid ${colors.gray200}`,
  borderBottom: `1px solid ${colors.gray200}`,
  boxShadow: shadow.md,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: space[4],
  textAlign: 'left',
  cursor: 'pointer',
}

const moduleTagStyle = {
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const cardTitleStyle = {
  color: colors.gray900,
  fontWeight: type.black,
  fontSize: type.xl,
}

const cardDescriptionStyle = {
  color: colors.gray500,
  fontSize: type.md,
  lineHeight: 1.55,
  flex: 1,
}

const cardLinkStyle = {
  fontWeight: type.black,
  fontSize: type.md,
}

const disabledCardStyle = {
  backgroundColor: colors.gray150,
  borderRadius: radius.xl,
  padding: `${space[7]} ${space[8]}`,
  border: `1px solid ${colors.gray200}`,
  borderTop: `5px solid ${colors.gray300}`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: space[4],
  textAlign: 'left',
  opacity: 0.65,
}

const disabledTagStyle = {
  color: colors.gray400,
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const disabledCardTitleStyle = {
  color: colors.gray600,
  fontWeight: type.black,
  fontSize: type.xl,
}

const alertWrapStyle = {
  marginBottom: space[7],
}

const panelWrapStyle = {
  maxWidth: '640px',
}

const formatLedgerDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  })
}

const getLedgerBadgeStyle = (isActive) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[3],
  marginTop: space[5],
  padding: `${space[2]} ${space[4]}`,
  borderRadius: '999px',
  backgroundColor: isActive ? colors.green50 : colors.gray100,
  border: `1px solid ${isActive ? colors.green100 : colors.gray200}`,
  fontSize: type.sm,
  color: isActive ? colors.green700 : colors.gray500,
  fontWeight: type.bold,
})

const getLedgerDotStyle = (isActive) => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: isActive ? colors.green700 : colors.gray400,
  flexShrink: 0,
})

export default FinancesHome
