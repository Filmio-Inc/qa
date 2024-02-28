const valuesRange = 'A2:Z1000' // Defines the range to get values from.

function ResetSheet() {
 var sheet = SpreadsheetApp.getActive().getSheetByName('data'); // Gets the 'data' sheet from the active spreadsheet.
 sheet.getRange(valuesRange).clearContent(); // Clears the content of the defined range in the 'data' sheet.
}

function onOpen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); // Gets the currently active spreadsheet.
  var menuEntries = [ {name: "ResetSheet", functionName: "ResetSheet"} ]; // Creates a new menu entry for the custom function.
  ss.addMenu("Run Script", menuEntries); // Adds a new menu called 'Run Script' with the 'ResetSheet' function.
}

function doGet(e) {
    return ContentService.createTextOutput(JSON.stringify('get')).setMimeType(ContentService.MimeType.JSON); // Basic doGet function returning a simple JSON string.
}

function doPost(e) {
    const ss = SpreadsheetApp.getActive(); // Gets the active Spreadsheet object.
    const sheet = ss.getSheetByName("data"); // Accesses the 'data' sheet.
    let rowNumber = null; // Initializes the variable for storing the row number where data will be written.
    let data = null; // Initializes the variable for storing parsed JSON data from the POST request.

    // Set up static headers and formulas in the sheet.
    sheet.getRange('A1').setValue('Total # of Tests').setFontWeight('bold').setBackground('#FFFF00').setHorizontalAlignment('center');
    sheet.getRange('A2').setFormula('=COUNTA(B:B)-1').setHorizontalAlignment('center');
    sheet.getRange('A3').setValue('Number of Spinners').setFontWeight('bold').setBackground('#FFFF00').setHorizontalAlignment('center');
    sheet.getRange('A4').setFormula('=COUNTIF(B2:B9000, "TRUE")').setHorizontalAlignment('center');
    sheet.getRange('A5').setValue('Number of SWW').setFontWeight('bold').setBackground('#FFFF00').setHorizontalAlignment('center');
    sheet.getRange('A6').setFormula('=COUNTIF(C2:C9000, "TRUE")').setHorizontalAlignment('center');

    try {
        var lock = LockService.getScriptLock(); // Attempts to acquire a script lock to prevent concurrent execution issues.
        if (lock.tryLock(5000)) { // Tries to lock the script for up to 5 seconds.
          try {
            data = JSON.parse(e.postData.contents); // Parses the JSON data from the POST request.
            
            // Process each data point from the parsed data.
            for (let dp of data) {
              const numberOfSubtests = dp.urls.length; // Assumes 'urls' is an array field in your data.
              dp['Test Id'] = dp.runId + '-' + dp['Subtest #']; // Constructs a 'Test Id' from 'runId' and 'Subtest #'.
              dp['Test Name'] = dp['test']; // Sets 'Test Name' to the value of 'test'.
              const runId = parseInt(dp.runId.replace(/.+-/g, '')); // Extracts numeric 'runId'.
              const objectNumber = parseInt(dp['Subtest #']); // Parses 'Subtest #' as an integer.
              rowNumber = (runId * numberOfSubtests + objectNumber) + 1; // Calculates the row number for this entry.
              dp['Sub-test Number'] = rowNumber - 1; // Adjusts 'Sub-test Number' for zero-based indexing.
              dp['Test Number'] = runId; // Sets 'Test Number' to the parsed 'runId'.

              // Remove unwanted elements from the data point.
              delete dp.jwt;
              delete dp.test;
              delete dp.urls;
              delete dp.runId;
              delete dp.numberOfRandomProjectURLs;

              const propertyNames = Object.keys(dp); // Extracts property names for headers.
              const objectData = Object.values(dp); // Extracts property values for insertion.
              sheet.getRange(1, 2, 1, propertyNames.length).setValues([propertyNames]); // Writes headers to the sheet.
              sheet.getRange(rowNumber, 2, 1, objectData.length).setValues([objectData]); // Writes data to the sheet.
            }
            
            return ContentService.createTextOutput(JSON.stringify('200')).setMimeType(ContentService.MimeType.JSON); // Returns a '200' response.
          } finally {
            lock.releaseLock(); // Ensures the lock is released regardless of how the try block exits.
          }
        } else {
          return ContentService.createTextOutput(JSON.stringify('Server busy, try again later')).setMimeType(ContentService.MimeType.JSON); // Handles case where script lock couldn't be acquired.
        }
    } catch(error){
        // Error handling: Writes error information to the sheet and returns it as JSON.
        if (rowNumber !== null) {
            sheet.getRange(rowNumber, 13, 1, 1).setValue(JSON.stringify(error)); // Writes the full error object as a string.
            sheet.getRange(rowNumber, 14, 1, 1).setValue(error.message); // Writes just the error message.
            sheet.getRange(rowNumber, 15, 1, 1).setValue(JSON.stringify(data)); // Writes the data that caused the error.
        }
        return ContentService.createTextOutput(JSON.stringify(error)).setMimeType(ContentService.MimeType.JSON); // Returns the error message as JSON.
  }
}
