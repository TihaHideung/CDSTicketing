import { SWFM_COLUMNS, isHandledStatus } from './constants.js';

/**
 * Dari baris-baris file SWFM Check, bangun:
 *  - handledMap: ticketId -> status (hanya utk yang statusnya "sudah ditangani")
 *  - infoMap: ticketId -> { rcCategory } (utk enrichment RC Category ticket aktif)
 */
export function buildSwfmMaps(swfmRows) {
  const handledMap = {};
  const infoMap = {};

  for (const row of swfmRows) {
    const ticketId = String(row[SWFM_COLUMNS.TICKET_ID] ?? '').trim();
    if (!ticketId) continue;
    const status = String(row[SWFM_COLUMNS.TICKET_SWFM_STATUS] ?? '').trim();
    const rc = String(row[SWFM_COLUMNS.RC_CATEGORY] ?? '').trim();

    if (isHandledStatus(status)) {
      handledMap[ticketId] = status.toUpperCase();
    }
    if (rc) {
      infoMap[ticketId] = { rcCategory: rc };
    }
  }

  return { handledMap, infoMap, totalRows: swfmRows.length };
}
