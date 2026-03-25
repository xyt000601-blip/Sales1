import type { ParsedSaleRow } from "./parseInvoice"

function escapeCsvValue(value: string | number) {
  const str = String(value ?? "")
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function convertRowsToCsv(rows: ParsedSaleRow[]) {
  const headers = ["门店", "单号", "日期", "时间", "产品", "数量", "金额", "支付方式"]

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        escapeCsvValue(row.门店),
        escapeCsvValue(row.单号),
        escapeCsvValue(row.日期),
        escapeCsvValue(row.时间),
        escapeCsvValue(row.产品),
        escapeCsvValue(row.数量),
        escapeCsvValue(row.金额),
        escapeCsvValue(row.支付方式),
      ].join(",")
    ),
  ]

  return lines.join("\n")
}

export function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}