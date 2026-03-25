"use client"

import { useMemo, useState } from "react"
import { convertRowsToCsv, downloadCsv } from "@/lib/exportCsv"
import { parseCsvRowsToSales, type ParsedSaleRow } from "@/lib/parseInvoice"

function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    const next = normalized[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === "," && !inQuotes) {
      row.push(cell)
      cell = ""
      continue
    }

    if (char === "\n" && !inQuotes) {
      row.push(cell)

      if (row.some((c) => String(c).trim() !== "")) {
        rows.push(row)
      }

      row = []
      cell = ""
      continue
    }

    cell += char
  }

  // 收尾
  row.push(cell)
  if (row.some((c) => String(c).trim() !== "")) {
    rows.push(row)
  }

  return rows
}

export default function HomePage() {
  const [rows, setRows] = useState<ParsedSaleRow[]>([])
  const [fileName, setFileName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const totalAmount = useMemo(() => {
    return rows.reduce((sum, row) => sum + Number(row.金额 || 0), 0)
  }, [rows])

  const totalQty = useMemo(() => {
    return rows.reduce((sum, row) => sum + Number(row.数量 || 0), 0)
  }, [rows])

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError("")
    setLoading(true)
    setFileName(file.name)
    setRows([])

    try {
      const text = await file.text()
      const rawRows = parseCsvText(text)
      const parsedRows = parseCsvRowsToSales(rawRows)

      setRows(parsedRows)

      if (parsedRows.length === 0) {
        setError("没有解析到有效数据。请检查原始 CSV 格式。")
      }
    } catch (err) {
      console.error(err)
      setError("读取或解析 CSV 失败。")
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (rows.length === 0) return

    const csv = convertRowsToCsv(rows)
    const baseName = fileName.replace(/\.csv$/i, "") || "converted_sales"
    downloadCsv(`${baseName}_formatted.csv`, csv)
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>销售 CSV 转换工具</h1>
        <p style={styles.desc}>
          上传原始发票 CSV，自动转换为：门店、单号、日期、时间、产品、数量、金额、支付方式
        </p>

        <div style={styles.uploadBox}>
          <input type="file" accept=".csv" onChange={handleFileChange} />
        </div>

        {loading && <p style={styles.info}>正在解析中...</p>}
        {error && <p style={styles.error}>{error}</p>}

        {rows.length > 0 && (
          <>
            <div style={styles.summary}>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>解析行数</div>
                <div style={styles.summaryValue}>{rows.length}</div>
              </div>

              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>总数量</div>
                <div style={styles.summaryValue}>{totalQty}</div>
              </div>

              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>总金额</div>
                <div style={styles.summaryValue}>{totalAmount.toFixed(2)}</div>
              </div>
            </div>

            <div style={styles.buttonRow}>
              <button onClick={handleDownload} style={styles.button}>
                下载规整版 CSV
              </button>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    
                    <th style={styles.th}>门店</th>
                    <th style={styles.th}>单号</th>
                    <th style={styles.th}>日期</th>
                    <th style={styles.th}>时间</th>
                    <th style={styles.th}>产品</th>
                    <th style={styles.th}>数量</th>
                    <th style={styles.th}>金额</th>
                    <th style={styles.th}>支付方式</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      
                      <td style={styles.td}>{row.门店}</td>
                      <td style={styles.td}>{row.单号}</td>
                      <td style={styles.td}>{row.日期}</td>
                      <td style={styles.td}>{row.时间}</td>
                      <td style={styles.td}>{row.产品}</td>
                      <td style={styles.td}>{row.数量}</td>
                      <td style={styles.td}>{Number(row.金额).toFixed(2)}</td>
                      <td style={styles.td}>{row.支付方式}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f7f7f7",
    padding: "40px 20px",
  },
  card: {
    maxWidth: 1100,
    margin: "0 auto",
    background: "#fff",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  title: {
    margin: 0,
    marginBottom: 8,
    fontSize: 28,
    fontWeight: 700,
  },
  desc: {
    marginTop: 0,
    marginBottom: 20,
    color: "#666",
    lineHeight: 1.6,
  },
  uploadBox: {
    marginBottom: 16,
  },
  info: {
    color: "#333",
  },
  error: {
    color: "#c62828",
    fontWeight: 600,
  },
  summary: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    margin: "20px 0",
  },
  summaryItem: {
    background: "#fafafa",
    border: "1px solid #eee",
    borderRadius: 12,
    padding: "14px 18px",
    minWidth: 140,
  },
  summaryLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 700,
  },
  buttonRow: {
    marginBottom: 16,
  },
  button: {
    background: "#111",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: 14,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#fff",
  },
  th: {
    textAlign: "left",
    padding: "12px 10px",
    borderBottom: "1px solid #ddd",
    background: "#fafafa",
    fontSize: 14,
  },
  td: {
    padding: "12px 10px",
    borderBottom: "1px solid #eee",
    fontSize: 14,
    verticalAlign: "top",
  },
}