import React, { useMemo, useState } from 'react'
import { clampRowsPerPage, downloadReportAsExcel, getPageSizeOptions } from '../lib/reportUtils'

const paginationArrowStyle = {
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  backgroundColor: '#ffffff',
  color: '#0f172a',
  fontWeight: '800',
  cursor: 'pointer',
  minWidth: '42px',
  height: '42px',
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
  padding: isMobile ? '16px' : '30px',
  backgroundColor: '#f7fafc',
  minHeight: '100vh',
  color: '#0f172a',
})

const getTitleStyle = (isMobile) => ({
  color: '#2d3748',
  marginBottom: '20px',
  borderBottom: '2px solid #cbd5e0',
  paddingBottom: '10px',
  fontSize: isMobile ? '1.35rem' : '1.75rem',
})

const getControlsShellStyle = (isMobile) => ({
  position: isMobile ? 'static' : 'sticky',
  top: isMobile ? 'auto' : 0,
  zIndex: isMobile ? 'auto' : 5,
  backgroundColor: '#f7fafc',
  paddingBottom: '12px',
})

const filterCardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '18px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.08)',
  marginBottom: '18px',
  color: '#0f172a',
}

const filterHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: '14px',
}

const filterEyebrowStyle = {
  color: '#1d4ed8',
  fontWeight: '800',
  fontSize: '0.8rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const filterSubtitleStyle = {
  marginTop: '4px',
  color: '#64748b',
  fontSize: '0.9rem',
}

const toolbarStyle = (isMobile) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: isMobile ? 'stretch' : 'center',
  flexDirection: isMobile ? 'column' : 'row',
  gap: '12px',
  marginBottom: '14px',
})

const toolbarMetaStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
}

const recordsBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '10px 14px',
  borderRadius: '999px',
  backgroundColor: '#e0f2fe',
  color: '#075985',
  fontWeight: '700',
}

const rowsControlStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  color: '#0f172a',
  fontWeight: '700',
  flexWrap: 'wrap',
  backgroundColor: '#ffffff',
  border: '1px solid #dbe4f0',
  borderRadius: '999px',
  padding: '8px 12px',
  boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)',
}

const rowsSelectStyle = {
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#0f172a',
  fontWeight: '700',
  WebkitTextFillColor: '#0f172a',
}

const exportButtonStyle = {
  border: 'none',
  borderRadius: '10px',
  backgroundColor: '#1d4ed8',
  color: '#ffffff',
  fontWeight: '800',
  padding: '12px 16px',
  cursor: 'pointer',
}

const dataPanelStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
}

const getTableWrapperStyle = (isMobile) => ({
  maxHeight: isMobile ? 'none' : '56vh',
  overflow: isMobile ? 'visible' : 'hidden',
})

const getTableScrollStyle = (isMobile) => ({
  overflowX: 'auto',
  overflowY: isMobile ? 'visible' : 'auto',
  maxHeight: isMobile ? 'none' : '56vh',
})

const tableStyle = {
  width: '100%',
  minWidth: '760px',
  borderCollapse: 'collapse',
  backgroundColor: '#ffffff',
}

const theadStyle = { backgroundColor: '#4a5568', color: '#ffffff' }
const getThStyle = (isMobile) => ({
  padding: '15px',
  textAlign: 'left',
  fontSize: '0.85rem',
  position: isMobile ? 'static' : 'sticky',
  top: isMobile ? 'auto' : 0,
  zIndex: 1,
  backgroundColor: '#4a5568',
  color: '#ffffff',
})

const emptyStateStyle = {
  padding: '18px',
  textAlign: 'center',
  color: '#64748b',
  fontWeight: '700',
  backgroundColor: '#ffffff',
}

const footerBarStyle = (isMobile) => ({
  padding: '14px 16px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: isMobile ? 'stretch' : 'center',
  flexDirection: isMobile ? 'column' : 'row',
  gap: '12px',
  backgroundColor: '#ffffff',
  borderTop: '1px solid #e2e8f0',
})

const pageStatusStyle = {
  color: '#475569',
  fontWeight: '700',
}

const paginationControlsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
}

const pageIndicatorStyle = {
  color: '#0f172a',
  fontWeight: '800',
  minWidth: '130px',
  textAlign: 'center',
}

const getSummaryStyle = (isMobile) => ({
  marginTop: '20px',
  textAlign: isMobile ? 'left' : 'right',
  padding: isMobile ? '16px 8px' : '20px',
  fontSize: isMobile ? '1rem' : '1.2rem',
  fontWeight: 'bold',
  color: '#2d3748',
})

export default ReportView
