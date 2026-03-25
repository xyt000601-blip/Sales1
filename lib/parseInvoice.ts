export type ParsedSaleRow = {
  单号: string
  门店: string
  日期: string
  时间: string
  产品: string
  数量: number
  金额: number
  支付方式: string
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

function extractInvoiceNumber(text: string) {
  const match = text.match(/Invoice\s*-\s*([0-9]+)/i)
  return match?.[1]?.trim() || ""
}

function extractStore(text: string) {
  const match = text.match(/Staff:\s*([A-Za-z0-9_-]+)/i)
  return match?.[1]?.trim() || ""
}

function extractPaymentMethod(text: string) {
  const normalized = text.replace(/Plateform/gi, "Platform")

  // 先抓 Platform - xxx - 日期时间
  const platformMatch = normalized.match(
    /Platform\s*-\s*(.+?)\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s*(AM|PM)/i
  )
  if (platformMatch?.[1]) {
    return `${platformMatch[1].trim()}`
  }

  // 再抓 Store Credit / Bank Card 这种带时间的
  const timedMatch = normalized.match(
    /\b(Store Credit|Bank Card|Cash|EFTPOS|Visa|Mastercard|PayWave|Online|Gift Card)\b(?:\s*-\s*\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\s*(AM|PM))?/i
  )
  if (timedMatch?.[1]) {
    return timedMatch[1].trim()
  }

  // 最后兜底
  const simpleMatch = normalized.match(
    /\b(Store Credit|Bank Card|Cash|EFTPOS|Visa|Mastercard|PayWave|Online|Gift Card)\b/i
  )
  return simpleMatch?.[1]?.trim() || ""
}

function extractDateAndTime(text: string) {
  const normalized = text.replace(/Plateform/gi, "Platform")

  const platformMatch = normalized.match(
    /Platform\s*-\s*.+?\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})\s*(AM|PM)/i
  )

  const paymentMatch = normalized.match(
    /\b(Store Credit|Bank Card|Cash|EFTPOS|Visa|Mastercard|PayWave|Online|Gift Card)\b\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})\s*(AM|PM)/i
  )

  const createdMatch = normalized.match(
    /Created on:\s*(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})\s*(AM|PM)/i
  )

  if (platformMatch) {
    const [, dd, mm, yyyy, hh, min, ampm] = platformMatch
    return {
      日期: `${yyyy}.${mm}.${dd}`,
      时间: to24Hour(hh, min, ampm),
    }
  }

  if (paymentMatch) {
    const [, , dd, mm, yyyy, hh, min, ampm] = paymentMatch
    return {
      日期: `${yyyy}.${mm}.${dd}`,
      时间: to24Hour(hh, min, ampm),
    }
  }

  if (createdMatch) {
    const [, dd, mm, yyyy, hh, min, ampm] = createdMatch
    return {
      日期: `${yyyy}.${mm}.${dd}`,
      时间: to24Hour(hh, min, ampm),
    }
  }

  return { 日期: "", 时间: "" }
}

function cleanProductName(name: string) {
  return name
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b(Option|Options|Extra|Extras|Add on|Add-on):.*$/i, "")
    .replace(/^[-–—:\s]+/, "")
    .replace(/[-–—:\s]+$/, "")
    .trim()
}

function isAmountCell(cell: string) {
  return /^\$\d+(\.\d{1,2})?$/.test(cell.trim())
}

function isQtyCell(cell: string) {
  return /^\d+$/.test(cell.trim())
}

function shouldSkipRow(cells: string[]) {
  const joined = normalizeText(cells.join(" "))

  if (!joined) return true
  if (/^Invoice\s*-\s*/i.test(joined)) return true
  if (/Created on:/i.test(joined)) return true
  if (/Last updated on:/i.test(joined)) return true
  if (/Status:/i.test(joined)) return true
  if (/Staff:/i.test(joined)) return true
  if (/Customer:/i.test(joined)) return true
  if (/Table:/i.test(joined)) return true
  if (/Qty/i.test(joined) && /Item description/i.test(joined)) return true
  if (/^Total$/i.test(joined) || /\bTotal\b/i.test(joined)) return true
  if (/^Gst$/i.test(joined) || /\bGst\b/i.test(joined)) return true
  if (/Bank Card/i.test(joined)) return true
  if (/Store Credit/i.test(joined)) return true
  if (/Platform\s*-/i.test(joined) || /Plateform\s*-/i.test(joined)) return true

  return false
}

function parseInvoiceBlock(blockRows: string[][]): ParsedSaleRow[] {
  const text = normalizeText(
    blockRows
      .flat()
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v))
      .join(" ")
  )

    if (!text) return []

  // 规则1：只要有 Table，整单跳过
  if (/Table\s*:/i.test(text)) {
    return []
  }

  // 规则2：只保留 Status: Completed
  if (!/Status:\s*Completed/i.test(text)) {
    return []
  }

  const 单号 = extractInvoiceNumber(text)
  const 门店 = extractStore(text)
  const { 日期, 时间 } = extractDateAndTime(text)
  const 支付方式 = extractPaymentMethod(text)

  const itemRows: ParsedSaleRow[] = []

  let pendingQty = ""
  let pendingProductParts: string[] = []
  let collectingMultilineProduct = false

  function flushPending(amountText?: string) {
    const product = cleanProductName(pendingProductParts.join(" "))
    const qty = pendingQty ? Number(pendingQty) : 1
    const amount = amountText ? Number(amountText.replace("$", "")) : 0

    if (product && amount > 0) {
      itemRows.push({
        单号,
        门店,
        日期,
        时间,
        产品: product,
        数量: qty,
        金额: amount,
        支付方式,
      })
    }

    pendingQty = ""
    pendingProductParts = []
    collectingMultilineProduct = false
  }

  for (const row of blockRows) {
    const cells = row.map((v) => String(v ?? "").trim())
    const nonEmptyCells = cells.filter(Boolean)

    if (nonEmptyCells.length === 0) continue
    if (shouldSkipRow(nonEmptyCells)) continue

    const amountCell = nonEmptyCells.find(isAmountCell)
    const qtyCell = nonEmptyCells.find(isQtyCell)

    // 标准单行商品
    if (qtyCell && amountCell) {
      const productParts = nonEmptyCells.filter(
        (c) =>
          !isQtyCell(c) &&
          !isAmountCell(c) &&
          !/^Invoice\s*-/i.test(c) &&
          !/^Total$/i.test(c) &&
          !/^Gst$/i.test(c) &&
          !/Bank Card/i.test(c) &&
          !/Store Credit/i.test(c) &&
          !/Platform\s*-/i.test(c) &&
          !/Plateform\s*-/i.test(c)
      )

      const product = cleanProductName(productParts.join(" "))

      if (product) {
        itemRows.push({
          单号,
          门店,
          日期,
          时间,
          产品: product,
          数量: Number(qtyCell),
          金额: Number(amountCell.replace("$", "")),
          支付方式,
        })
        pendingQty = ""
        pendingProductParts = []
        collectingMultilineProduct = false
        continue
      }
    }

    // 多行商品开始
    if (qtyCell && !amountCell) {
      const productParts = nonEmptyCells.filter(
        (c) =>
          !isQtyCell(c) &&
          !isAmountCell(c) &&
          !/^Invoice\s*-/i.test(c)
      )

      pendingQty = qtyCell
      pendingProductParts = [...productParts]
      collectingMultilineProduct = true
      continue
    }

    // 多行商品继续
    if (collectingMultilineProduct) {
      const extraProductParts = nonEmptyCells.filter(
        (c) =>
          !isAmountCell(c) &&
          !/^Total$/i.test(c) &&
          !/^Gst$/i.test(c) &&
          !/Bank Card/i.test(c) &&
          !/Store Credit/i.test(c) &&
          !/Platform\s*-/i.test(c) &&
          !/Plateform\s*-/i.test(c)
      )

      if (extraProductParts.length > 0) {
        pendingProductParts.push(...extraProductParts)
      }

      if (amountCell) {
        flushPending(amountCell)
      }

      continue
    }
  }

  if (collectingMultilineProduct) {
    flushPending()
  }

  return itemRows
}

export function parseCsvRowsToSales(rows: string[][]): ParsedSaleRow[] {
  const results: ParsedSaleRow[] = []
  const seen = new Set<string>()

  let currentBlock: string[][] = []

  function flushBlock() {
    if (currentBlock.length === 0) return

    const parsedRows = parseInvoiceBlock(currentBlock)
    for (const parsed of parsedRows) {
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

    if (
      /^Invoice\s*-\s*\d+/i.test(cells[0] || "") ||
      /^Invoice\s*-\s*\d+/i.test(joined)
    ) {
      flushBlock()
      currentBlock.push(row)
      continue
    }

    currentBlock.push(row)
  }

  flushBlock()

  return results
}