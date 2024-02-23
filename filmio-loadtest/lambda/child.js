// Import required AWS SDK modules for S3 operations and S3 presigner
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Initialize the S3 client with the specified region from environment variables
const s3 = new S3Client({ region: process.env.S3_REGION });
const BUCKET = process.env.S3_BUCKET; // Bucket name from environment variable

// Import required modules for headless browser operation
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// Additional modules for various functionalities
const moment = require('moment-timezone');
const fsp = require('node:fs/promises');
const fs = require('fs');
const path = require('path');
const https = require('node:https');

// Base domain for web scraping
const domain = 'https://stage.film.io';

// Lambda function handler
exports.handler = async (event) => {
    let browser = null; // Initialize variable to store browser instance
    const chromePath = await chromium.executablePath(); // Get path to the Chromium executable

    try {
        // Launch puppeteer browser with necessary arguments for Lambda environment
        browser = await puppeteer.launch({
            args: chromium.args.concat([
                '--disable-web-security', // Disables web security for CORS
                '--disable-features=IsolateOrigins,site-per-process', // Disables site isolation
                '--allow-running-insecure-content', // Allows HTTP content on HTTPS sites
                '--no-sandbox', // Disables the sandbox for security reasons in Lambda environment
                '--disable-setuid-sandbox', // Additional setting for non-sandbox mode
                '--disable-gpu', // Disables GPU hardware acceleration
                '--window-size=1920,1080', // Default window size
                '--start-maximized', // Starts browser maximized
                '--ignore-certificate-errors', // Ignores certificate-related errors
                '--no-first-run', // Skips first run wizards
                '--mute-audio', // Mutes audio from the browser
                '--disable-accelerated-2d-canvas', // Disables accelerated 2D canvas
                // Additional Chromium args can be added here
            ]),
            defaultViewport: chromium.defaultViewport,
            executablePath: chromePath,
            headless: chromium.headless,
            timeout: 360000, // Extended timeout for Lambda environment
            userDataDir: "/tmp/data", // Temporary user data directory
        });

        // Read and parse local storage data from file
        const localStorageData = JSON.parse(await fsp.readFile('./localStorage.json', 'utf8'));

        // Override JWT if provided in the event
        if (event.jwt !== null) {
            localStorageData['jwt'] = event.jwt;
        }

        // Open a new page in the browser
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(360000); // Extend default navigation timeout

        // Navigate to the base domain
        await page.goto(domain);

        // Inject local storage data into the page
        await page.evaluate((data) => {
            Object.entries(data).forEach(([key, value]) => {
                localStorage.setItem(key, value);
            });
        }, localStorageData);

        // Process each URL provided in the event
        for (let path of event.urls) {
            console.log(`Processing URL: ${domain}${path}`);
            try {
                await getPageMetrics(event, page, path);
            } catch (error) {
                console.error(`Error processing URL ${domain}${path}: ${error}`);
                // Continue processing next URL despite any errors
            }
        }

        return "Done"; // Return null to indicate successful execution
    } catch (error) {
        throw new Error(`Browsing failed: ${error}`);
    } finally {
        // Ensure the browser gets closed properly
        if (browser) {
            await browser.close();
        }
    }
};

// Function to capture page metrics
async function getPageMetrics(event, page, path) {
    const url = `${domain}${path}`;
    const startTime = Date.now(); // Start the timer

    await page.goto(url); // Navigate to the URL

    const endTime = Date.now(); // End the timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2); // Calculate load time

    const title = await page.title(); // Get the page title

    // Save a screenshot of the page
    const screenshotPath = '/tmp/screenshot.png';
    await page.screenshot({ path: screenshotPath });
    const screenshotUrl = await uploadFileToS3(screenshotPath, 'screenshot'); // Upload screenshot to S3

    // Format the current timestamp
    const formattedTimestamp = moment().tz('America/Santo_Domingo').format('YYYY-MM-DD HH:mm:ss');

    // Construct data object to be sent to Google Sheets
    const dataObj = {
        'Load Time': loadTime,
        'Page Title': title,
        'Screenshot Link': screenshotUrl,
        'URL': url,
        'Subtest #': event.urls.indexOf(path) + 1,
        'Timestamp': formattedTimestamp,
        ...event // Spread the event object to include additional data
    };

    // Post the data to Google Sheets
    await postToGoogleSheets(dataObj);

    return null; // Return null indicating this step is complete
};

// Function to upload files to S3 and return the signed URL
async function uploadFileToS3(filePath, fileType) {
    try {
        const fileContent = fs.readFileSync(filePath); // Read the file content
        const fileName = `${fileType}-${Date.now()}${path.extname(filePath)}`; // Generate a unique file name

        // Setup the S3 upload parameters
        const uploadParams = {
            Bucket: BUCKET,
            Key: fileName,
            Body: fileContent
        };

        // Upload the file to S3
        const command = new PutObjectCommand(uploadParams);
        await s3.send(command);

        // Generate a signed URL for the uploaded file
        const urlCommand = new GetObjectCommand({
            Bucket: BUCKET,
            Key: fileName
        });
        const signedUrl = await getSignedUrl(s3, urlCommand, { expiresIn: 3600 }); // URL expires in 1 hour

        return signedUrl; // Return the signed URL
    } catch (error) {
        console.error(`Error uploading file to S3: ${error}`);
        throw error; // Rethrow error to be handled by caller
    }
};

// Function to post data to Google Sheets
async function postToGoogleSheets(data) {
    try {
        const options = {
            method: 'POST',
            hostname: 'script.google.com',
            path: '/macros/s/AKfycbwO5gGxSX2TBwTVG8Zr9b_0flSF8e1loAIJJuH49YJWGqJ5X2QW_gS7lNPMD9MdK_4G/exec',
            headers: {
                'Content-Type': 'application/json'
            },
            maxRedirects: 20
        };

        // Perform the POST request and process the response
        const response = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                const chunks = [];
                res.on("data", (chunk) => {
                    chunks.push(chunk);
                });
                res.on("end", () => {
                    const body = Buffer.concat(chunks);
                    resolve(body.toString()); // Resolve with response body as string
                });
                res.on("error", (error) => {
                    reject(error); // Reject on request error
                });
            });

            req.write(JSON.stringify(data)); // Send the data as JSON
            req.end();
        });

        return response; // Return the response from Google Sheets
    } catch (error) {
        console.error(`Error posting data to Google Sheets: ${error}`);
        throw error; // Rethrow error to be handled by caller
    }
};
