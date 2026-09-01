import { useMemo, useState } from 'react'
import { clampRowsPerPage, downloadReportAsExcel, getPageSizeOptions } from '../lib/reportUtils'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

const paginationArrowStyle = {
  border: `1px solid ${colors.gray300}`,
  borderRadius: radius.md,
  backgroundColor: colors.white,
  color: colors.gray900,
  fontWeight: type.bold,
  cursor: 'pointer',
  minWidth: '34px',
  height: '34px',
}

const disabledArrowStyle = {
  opacity: 0.45,
  cursor: 'not-allowed',
}

const ReportView = ({
  title,
  filters,
  rows,
  columns,
  renderRow,
  exportColumns,
  exportRows,
  exportFileName,
  summary,
  emptyText,
  isMobile,
}) => {
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage))
  const safeCurrentPage = Math.min(currentPage, totalPages)

  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * rowsPerPage
    return rows.slice(start, start + rowsPerPage)
  }, [rows, rowsPerPage, safeCurrentPage])

  const firstVisibleRow = rows.length === 0 ? 0 : (safeCurrentPage - 1) * rowsPerPage + 1
  const lastVisibleRow = rows.length === 0 ? 0 : Math.min(rows.length, safeCurrentPage * rowsPerPage)

  const handleExport = () => {
    downloadReportAsExcel({
      filename: exportFileName,
      sheetName: title,
      columns: exportColumns,
      rows: exportRows,
    })
  }

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(clampRowsPerPage(event.target.value))
    setCurrentPage(1)
  }

  return (
    <div style={getContainerStyle(isMobile)}>
      <h2 style={getTitleStyle(isMobile)}>{title}</h2>

      <div style={getControlsShellStyle(isMobile)}>
        <div style={filterCardStyle}>
          <div style={filterHeaderStyle}>
            <div>
              <div style={filterEyebrowStyle}>Filtros</div>
              <div style={filterSubtitleStyle}>Esta seccion queda fija como base para todos los reportes.</div>
            </div>
          </div>
          {filters}
        </div>

        <div style={toolbarStyle(isMobile)}>
          <div style={toolbarMetaStyle}>
            <span style={recordsBadgeStyle}>
              {rows.length} registro{rows.length === 1 ? '' : 's'} filtrado{rows.length === 1 ? '' : 's'}
            </span>
            <label style={rowsControlStyle}>
              <span>Mostrar</span>
              <select value={rowsPerPage} onChange={handleRowsPerPageChange} style={rowsSelectStyle}>
                {getPageSizeOptions().map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>por pagina</span>
            </label>
          </div>

          <button type="button" onClick={handleExport} style={exportButtonStyle}>
            Descargar Excel
          </button>
        </div>
      </div>

      <div style={dataPanelStyle}>
        <div style={getTableWrapperStyle(isMobile)}>
          <div style={getTableScrollStyle(isMobile)}>
            <table style={tableStyle}>
              <thead>
                <tr style={theadStyle}>
                  {columns.map((column) => (
                    <th key={column.key} style={getThStyle(isMobile)}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length > 0 ? (
                  paginatedRows.map((row, index) => renderRow(row, index))
                ) : (
                  <tr>
                    <td colSpan={columns.length} style={emptyStateStyle}>
                      {emptyText}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={footerBarStyle(isMobile)}>
          <div style={pageStatusStyle}>
            Mostrando {firstVisibleRow}-{lastVisibleRow} de {rows.length}
          </div>

          <div style={paginationControlsStyle}>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, Math.min(page, totalPages) - 1))}
              disabled={safeCurrentPage === 1}
              style={{
                ...paginationArrowStyle,
                ...(safeCurrentPage === 1 ? disabledArrowStyle : null),
              }}
              aria-label="Pagina anterior"
            >
              ←
            </button>

            <span style={pageIndicatorStyle}>
              Pagina {safeCurrentPage} de {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, Math.min(page, totalPages) + 1))}
              disabled={safeCurrentPage === totalPages}
              style={{
                ...paginationArrowStyle,
                ...(safeCurrentPage === totalPages ? disabledArrowStyle : null),
              }}
              aria-label="Pagina siguiente"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div style={getSummaryStyle(isMobile)}>{summary}</div>
    </div>
  )
}

const getContainerStyle = (isMobile) => ({
  padding: isMobile ? space[6] : `${space[8]} ${space[10]}`,
  backgroundColor: colors.gray100,
  minHeight: '100vh',
  color: colors.gray900,
})

const getTitleStyle = (isMobile) => ({
  color: colors.gray800,
  marginBottom: space[6],
  borderBottom: `2px solid ${colors.gray300}`,
  paddingBottom: space[5],
  fontSize: isMobile ? type.xl : type['3xl'],
})

const getControlsShellStyle = (isMobile) => ({
  position: isMobile ? 'static' : 'sticky',
  top: isMobile ? 'auto' : 0,
  zIndex: isMobile ? 'auto' : 5,
  backgroundColor: colors.gray100,
  paddingBottom: space[6],
})

const filterCardStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.lg,
  padding: space[7],
  boxShadow: shadow.sm,
  marginBottom: space[6],
  color: colors.gray900,
}

const filterHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: space[7],
}

const filterEyebrowStyle = {
  color: colors.blue700,
  fontWeight: type.bold,
  fontSize: type.xs,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const filterSubtitleStyle = {
  marginTop: space[2],
  color: colors.gray500,
  fontSize: type.sm,
}

const toolbarStyle = (isMobile) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: isMobile ? 'stretch' : 'center',
  flexDirection: isMobile ? 'column' : 'row',
  gap: space[6],
  marginBottom: space[5],
})

const toolbarMetaStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space[6],
  flexWrap: 'wrap',
}

const recordsBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${space[1]} ${space[5]}`,
  borderRadius: radius.full,
  backgroundColor: '#e0f2fe',
  color: '#075985',
  fontWeight: type.bold,
}

const rowsControlStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[4],
  color: colors.gray900,
  fontWeight: type.bold,
  flexWrap: 'wrap',
  backgroundColor: colors.white,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.full,
  padding: `${space[2]} ${space[6]}`,
  boxShadow: shadow.sm,
}

const rowsSelectStyle = {
  padding: `${space[2]} ${space[5]}`,
  borderRadius: radius.sm,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray900,
  fontWeight: type.bold,
  WebkitTextFillColor: colors.gray900,
}

const exportButtonStyle = {
  border: 'none',
  borderRadius: radius.md,
  backgroundColor: colors.blue700,
  color: colors.white,
  fontWeight: type.black,
  padding: `${space[4]} ${space[7]}`,
  cursor: 'pointer',
}

const dataPanelStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.lg,
  overflow: 'hidden',
  boxShadow: shadow.sm,
}

const getTableWrapperStyle = (isMobile) => ({
  maxHeight: isMobile ? 'none' : '60vh',
  overflow: isMobile ? 'visible' : 'hidden',
})

const getTableScrollStyle = (isMobile) => ({
  overflowX: 'auto',
  overflowY: isMobile ? 'visible' : 'auto',
  maxHeight: isMobile ? 'none' : '60vh',
})

const tableStyle = {
  width: '100%',
  minWidth: '760px',
  borderCollapse: 'collapse',
  backgroundColor: colors.white,
}

const theadStyle = { backgroundColor: '#4a5568', color: colors.white }
const getThStyle = (isMobile) => ({
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: type.sm,
  position: isMobile ? 'static' : 'sticky',
  top: isMobile ? 'auto' : 0,
  zIndex: 1,
  backgroundColor: '#4a5568',
  color: colors.white,
})

const emptyStateStyle = {
  padding: space[9],
  textAlign: 'center',
  color: colors.gray500,
  fontWeight: type.bold,
  backgroundColor: colors.white,
}

const footerBarStyle = (isMobile) => ({
  padding: `${space[5]} ${space[7]} ${space[6]}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: isMobile ? 'stretch' : 'center',
  flexDirection: isMobile ? 'column' : 'row',
  gap: space[6],
  backgroundColor: colors.white,
  borderTop: `1px solid ${colors.gray200}`,
})

const pageStatusStyle = {
  color: colors.gray600,
  fontWeight: type.bold,
}

const paginationControlsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space[5],
  flexWrap: 'wrap',
}

const pageIndicatorStyle = {
  color: colors.gray900,
  fontWeight: type.black,
  minWidth: '130px',
  textAlign: 'center',
}

const getSummaryStyle = (isMobile) => ({
  marginTop: space[5],
  textAlign: isMobile ? 'left' : 'right',
  padding: isMobile ? `${space[6]} ${space[3]}` : space[7],
  fontSize: isMobile ? type.md : type.xl,
  fontWeight: type.bold,
  color: colors.gray800,
})

export default ReportView
