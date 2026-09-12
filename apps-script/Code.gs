/**
 * Country Rolls — Spin & Win Campaign Atomic Counter
 * Google Apps Script Web App Backend
 *
 * STEP-BY-STEP REDEPLOY INSTRUCTIONS:
 * 1. Open the Google Sheet where campaign spins will be recorded.
 * 2. In the top menu, go to: Extensions > Apps Script.
 * 3. Delete any code currently in Code.gs and paste the entire contents of this file.
 * 4. Click the disk icon ("Save project") or press Ctrl+S (Cmd+S on Mac).
 * 5. Click the blue "Deploy" button at the top right > "New deployment".
 * 6. In the deployment dialog, click the gear icon next to "Select type" and choose "Web app".
 * 7. Set configuration:
 *    - Description: "Country Rolls Spin Counter v1"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone"
 * 8. Click "Deploy" (authorize permissions if prompted by Google).
 * 9. Copy the generated "Web app URL" ending in "/exec".
 * 10. IMPORTANT: Paste this NEW deployment URL into your project's .env file:
 *     VITE_SHEET_URL=https://script.google.com/macros/s/.../exec
 *     (or update DEFAULT_SHEET_URL in api.js).
 *
 * NOTE: Every time Code.gs is edited in Apps Script, you MUST create a NEW deployment
 * (or configure a new version in Manage Deployments) for changes to take effect on the live URL.
 */

/** Coupon lifetime in hours, also shown to the customer in the winner modal. */
var VALIDITY_HOURS = 48;

/**
 * Health check.
 * GET /exec -> { issued } — how many codes have been handed out so far.
 * There is no winner cap; this is for the operator's own monitoring.
 */
function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var issued = parseInt(props.getProperty('ISSUED') || '0', 10);
  if (isNaN(issued)) issued = 0;

  return ContentService.createTextOutput(JSON.stringify({ issued: issued }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Atomic claim endpoint.
 * POST /exec -> { sequence, code }
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Kept below the client's 15s abort so a queued request still gets a real
    // answer instead of being converted into an unrecorded fallback code.
    lock.waitLock(6000);
  } catch (lockError) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Lock timeout: counter busy, please try again'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return ContentService.createTextOutput(JSON.stringify({
          error: 'Malformed JSON payload'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var props = PropertiesService.getScriptProperties();
    var issued = parseInt(props.getProperty('ISSUED') || '0', 10);
    if (isNaN(issued)) issued = 0;

    // No campaign limit: codes are issued for as long as the page is live.

    var sequence = issued + 1;
    var code = 'C' + String(sequence).padStart(3, '0');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();

    // Auto-initialize headers if the sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Timestamp',
        'Name',
        'Phone',
        'Prize',
        'Code',
        'Sequence',
        'ExpiresAt',
        'ClientId',
        'Source'
      ]);
    }

    var now = new Date();
    var expiresAt = new Date(now.getTime() + VALIDITY_HOURS * 60 * 60 * 1000);
    var tz = Session.getScriptTimeZone() || 'Asia/Kolkata';
    var formattedExpiresAt = Utilities.formatDate(expiresAt, tz, 'yyyy-MM-dd HH:mm:ss');

    sheet.appendRow([
      now,
      payload.name || '',
      payload.phone || '',
      payload.prize || payload.prizeText || '',
      code,
      sequence,
      formattedExpiresAt,
      payload.clientId || '',
      payload.source || 'server'
    ]);

    // Persist incremented atomic counter
    props.setProperty('ISSUED', String(sequence));

    var response = {
      sequence: sequence,
      code: code
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseErr) {}
  }
}

/**
 * Utility helper: Reset counter to 0.
 * Can be run manually from Apps Script editor toolbar when launching a new campaign.
 */
function resetCounter() {
  PropertiesService.getScriptProperties().setProperty('ISSUED', '0');
  Logger.log('Counter reset: ISSUED = 0');
}
