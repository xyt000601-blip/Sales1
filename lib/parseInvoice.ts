export type ParsedSaleRow = {
  门店: string
  日期: string
  时间: string
  产品: string
  数量: number
  金额: number
}

function normalizeText(raw: string) {
  return raw
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function to24Hour(hh: string, mm: string, ampm: string) {
  let hour = Number(hh)
  const upper = ampm.toUpperCase()

  if (upper === "PM" && hour !== 12) hour += 12
  if (upper === "AM" && hour === 12) hour = 0

  return `${String(hour).padStart(2, "0")}:${mm}`
}

function extractStore(text: string) {
  const match = text.match(/Staff:\s*([A-Za-z0-9_-]+)/i)
  return match?.[1]?.trim() || ""
}

function extractDateAndTime(text: string) {
  const bankMatch = text.match(
    /Bank Card\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})\s*(AM|PM)/i
  )

  const createdMatch = text.match(
    /Created on:\s*(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})\s*(AM|PM)/i
  )

  const match = bankMatch || createdMatch
  if (!match) return { 日期: "", 时间: "" }

  const [, dd, mm, yyyy, hh, min, ampm] = match

  return {
    日期: `${yyyy}.${mm}.${dd}`,
    时间: to24Hour(hh, min, ampm),
  }
}

function cleanProductName(name: string) {
  return name
    .replace(/\s+/g, " ")
    .replace(/^[-–—:\s]+/, "")
    .replace(/[-–—:\s]+$/, "")
    .trim()
}

function parseInvoiceBlock(blockRows: string[][]): ParsedSaleRow | null {
  const text = normalizeText(
    blockRows
      .flat()
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v))
      .join(" ")
  )

  if (!text) return null

  const 门店 = extractStore(text)
  const { 日期, 时间 } = extractDateAndTime(text)

  let 产品 = ""
  let 数量 = 1
  let 金额 = 0

  // 按你这个模板，产品行通常长这样：
  // [空, 1, 产品名, $7.90]
  for (const row of blockRows) {
    const cells = row.map((v) => String(v ?? "").trim())

    const qtyCandidate = cells.find((c) => /^\d+$/.test(c))
    const amountCandidate = cells.find((c) => /^\$\d+(\.\d{2})?$/.test(c))

    const hasHeaderWords =
      cells.some((c) => /Qty/i.test(c)) &&
      cells.some((c) => /Item description/i.test(c))

    const hasTotalRow = cells.some((c) => /^Total$/i.test(c))
    const hasGstRow = cells.some((c) => /^Gst$/i.test(c))
    const hasBankCardRow = cells.some((c) => /Bank Card/i.test(c))
    const hasCreatedRow = cells.some((c) => /Created on:/i.test(c))
    const hasStaffRow = cells.some((c) => /Staff:/i.test(c))

    if (
      hasHeaderWords ||
      hasTotalRow ||
      hasGstRow ||
      hasBankCardRow ||
      hasCreatedRow ||
      hasStaffRow
    ) {
      continue
    }

    if (qtyCandidate && amountCandidate) {
      const productCell = cells.find((c) => {
        if (!c) return false
        if (/^\d+$/.test(c)) return false
        if (/^\$\d+(\.\d{2})?$/.test(c)) return false
        if (/^Invoice\s*-/i.test(c)) return false
        return true
      })

      if (productCell) {
        数量 = Number(qtyCandidate)
        产品 = cleanProductName(productCell)
        金额 = Number(amountCandidate.replace("$", ""))
        break
      }
    }
  }

  if (!门店 && !日期 && !时间 && !产品 && !金额) return null

  return {
    门店,
    日期,
    时间,
    产品,
    数量,
    金额,
  }
}

export function parseCsvRowsToSales(rows: string[][]): ParsedSaleRow[] {
  const results: ParsedSaleRow[] = []
  const seen = new Set<string>()

  let currentBlock: string[][] = []

  const flushBlock = () => {
    if (currentBlock.length === 0) return

    const parsed = parseInvoiceBlock(currentBlock)
    if (parsed) {
      const key = JSON.stringify(parsed)
      if (!seen.has(key)) {
        seen.add(key)
        results.push(parsed)
      }
    }

    currentBlock = []
  }

  for (const row of rows) {
    const cells = row.map((v) => String(v ?? "").trim())
    const joined = cells.join(" ")

    // 遇到新的 Invoice 开头，说明上一个 block 结束
    if (/^Invoice\s*-\s*\d+/i.test(cells[0] || "") || /^Invoice\s*-\s*\d+/i.test(joined)) {
      flushBlock()
      currentBlock.push(row)
      continue
    }

    // 普通行继续累积
    currentBlock.push(row)
  }

  // 最后一个 block
  flushBlock()

  return results
}