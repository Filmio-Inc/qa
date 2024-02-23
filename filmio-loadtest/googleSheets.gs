
const valuesRange = 'A2:Z1000' // get values

function ResetSheet() {
 var sheet = SpreadsheetApp.getActive().getSheetByName('data');
 sheet.getRange(valuesRange).clearContent();
}

function onOpen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); // gets opened spreadsheet
  var menuEntries = [ {name: "ResetSheet", functionName: "ResetSheet"} ]; //adds menu
  ss.addMenu("Run Script", menuEntries); //adds submenu 'Script'
}

function doGet(e) {
    // const ss = SpreadsheetApp.getActive()
    // const sheet = ss.getSheetByName("data")
    // sheet.getRange(1, 1).setValue('get')
    return ContentService.createTextOutput(JSON.stringify('get')).setMimeType(ContentService.MimeType.JSON)
   }
   
function doPost(e) {
    const ss = SpreadsheetApp.getActive()
    const sheet = ss.getSheetByName("data")
  try {
    sheet.getRange(1, 14, 1, 1).setValue(JSON.stringify(e))
    const data = JSON.parse(e.postData.contents)

    data['Test number'] = data.testNumber
    data['Test name'] = data.runId + '-' + data['Subtest #']
    const runId = parseInt(data.runId.replace(/.+-/g, ''))
    const objectNumber = parseInt(data['Subtest #'])
    const rowNumber = (runId * 4 + objectNumber) + 1
    data['Test #'] = runId

    // Remove unwanted elements
    delete data.jwt
    delete data.urls
    delete data.runId
    delete data.testNumber
    delete data.numberOfRandomProjectURLs

    sheet.getRange(1, 13, 1, 1).setValue(JSON.stringify(data))
    const propertyNames = Object.keys(data)
    const objectData = Object.values(data)

    sheet.getRange(1, 1, 1, propertyNames.length).setValues([propertyNames])
    sheet.getRange(rowNumber, 1, 1, objectData.length).setValues([objectData])
    
    return ContentService.createTextOutput(JSON.stringify('200')).setMimeType(ContentService.MimeType.JSON)

    } catch(e){
        e = JSON.stringify(e.message)
        sheet.getRange(1, 11, 1, 1).setValue(e)
        return ContentService.createTextOutput(e).setMimeType(ContentService.MimeType.JSON)
  }
}
   
        
   