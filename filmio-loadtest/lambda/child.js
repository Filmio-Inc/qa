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
const axios = require('axios')
const fs = require('fs');
const moment = require('moment-timezone');
const https = require('node:https');
const fsp = require('node:fs/promises');
const path = require('path');
const PNG = require('pngjs').PNG;
const pixelmatch = require('pixelmatch');
const uuid = require('uuid')


// Base domain for web scraping
const domain = 'https://stage.film.io';

// Constants
const SPINNER_SELECTOR = '.LoadMask_loader__l0arw'
const SWW_SELECTOR = '.ErrorFallback_error_fallback__VhEZt' // Something went wrong
const COMPARISON_SCREENSHOT = './default.png'

// Lambda function handler
exports.handler = async (event) => {
    console.log(event)
    let browser = null; // Initialize variable to store browser instance
    const chromePath = await chromium.executablePath(); // Get path to the Chromium executable

    try {
        // Get lambda ip address
        event["IP Address"] = await getLambdaEgressIp()
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
        const testData = []
        for (let path of event.urls) {
            console.log(`Processing URL: ${domain}${path}`);
            try {
                const response = await getPageMetrics(event, page, path);
                testData.push(response)
            } catch (error) {
                console.error(`Error processing URL ${domain}${path}: ${error}`);
                // Continue processing next URL despite any errors
            }
        }

        // Post the data to Google Sheets
        console.log('Sending data to GS')
        await postToGoogleSheets(testData);

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
    let loadTime = ((endTime - startTime) / 1000).toFixed(2); // Calculate load time

    const title = await page.title(); // Get the page title

    // Format the current timestamp
    const formattedTimestamp = moment().tz('America/Santo_Domingo').format('YYYY-MM-DD HH:mm:ss');

    let isSpinnerVisible = null
    let isSomethingWentWrong = null

    try {
        isSpinnerVisible = await checkIfElementIsVisible(page, SPINNER_SELECTOR)
        isSomethingWentWrong =  await checkIfElementIsVisible(page, SWW_SELECTOR)
	} catch (e) {
        isSpinnerVisible = false
        isSomethingWentWrong = false
	}

    // Save a screenshot of the page
    const screenshotName = `${uuid.v4()}-${formattedTimestamp.replace(' ','-')}-${event.test}.png`
    const screenshotPath = `/tmp/${screenshotName}`;
    await page.screenshot({ path: screenshotPath });
    const screenshotUrl = await uploadFileToS3(screenshotPath, screenshotName); // Upload screenshot to S3

    const imageComparisonResult = compareImages(screenshotPath, COMPARISON_SCREENSHOT)
    const isSpinner = imageComparisonResult < 215000 ? true : false
    loadTime = isSpinnerVisible ? 30 : loadTime 

    // Construct data object to be sent to Google Sheets
    const dataObj = {
        'Is Spinner Visible': isSpinnerVisible,
        'Is Spinner': imageComparisonResult < 215000 ? 'true' : 'false', // if the pixel diff is > then it should not be a spinner
        'is SWW?': isSomethingWentWrong,
        'Load Time': loadTime,
        'Page Title': title,
        'Screenshot Link': screenshotUrl,
        'URL': url,
        'Subtest #': event.urls.indexOf(path) + 1,
        'Timestamp': formattedTimestamp,
        ...event // Spread the event object to include additional data
    };

    return dataObj; // Return null indicating this step is complete
};

// Function to upload files to S3 and return the signed URL
async function uploadFileToS3(filePath, fileName) {
    try {
        await sleep(Math.random() * 500 + 500)
        const fileContent = fs.readFileSync(filePath); // Read the file content

        // Setup the S3 upload parameters
        const uploadParams = {
            Bucket: BUCKET,
            Key: fileName,
            Body: fileContent,
            ACL: 'public-read' // Set ACL to public-read
        };

        // Upload the file to S3
        const command = new PutObjectCommand(uploadParams);
        await s3.send(command);

        // Generate a signed URL for the uploaded file
        const urlCommand = new GetObjectCommand({
            Bucket: BUCKET,
            Key: fileName
        });
        // const signedUrl = await getSignedUrl(s3, urlCommand, { expiresIn: 3600 * 6 }); // URL expires in 1 hour

        // Generate a simple URL for the uploaded file
        // Make sure your bucket is configured for public access if you use this method
        const simpleUrl = `https://${uploadParams.Bucket}.s3.amazonaws.com/${encodeURIComponent(fileName)}`;


        return simpleUrl; // Return the signed URL
    } catch (error) {
        console.error(`Error uploading file to S3: ${error}`);
        return error.message
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
                    console.log('Error while posting to GS')
                    console.log(JSON.stringify(error))
                    reject(error); // Reject on request error
                });
            });

            req.write(JSON.stringify(data)); // Send the data as JSON
            req.end();
        });
        console.log(`GS response => ${JSON.stringify(response)}`)
        return response; // Return the response from Google Sheets
    } catch (error) {
        console.error(`Error posting data to Google Sheets: ${error}`);
        throw error; // Rethrow error to be handled by caller
    }
};

async function getLambdaEgressIp() {
    const url = 'http://httpbin.org/get'
    const config = {
        headers: {
            'Connection': 'keep-alive',
            'Accept-Encoding': 'gzip, deflate, br',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    };
    let ip = null
    try {
        const response = await axios.get(url, config)
        if(response.status === 200) {
            ip = response.data.origin
        }
    } catch (error) {
        ip = error.message
    } 
    console.log(`Lambda ip is ${ip}`)
    return ip
};

// Utility function for creating a promise that resolves after a set time
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const compareImages = (image1Path, image2Path) => {
    // Read the images
    const img1 = PNG.sync.read(fs.readFileSync(image1Path));
    const img2 = PNG.sync.read(fs.readFileSync(image2Path));
    const {width, height} = img1;
    const diff = new PNG({width, height});

    const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {threshold: 0.1});
    // Return the mismatch percentage from the result
    return numDiffPixels; // This will be a string representing the mismatch
};

const checkIfElementIsVisible = async (page, classSelector) => {
    let isVisible = null
    try {
        isVisible = await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (!element) return false; // Element does not exist
            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false; // Element is hidden
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0; // Element is visible if it has a positive size
        }, classSelector);
    } catch (error) {
        isVisible = false
    }
    return isVisible
}

const createJwtToken = (data, expiry = '24hr') => {
	return jwt.sign({ data }, secretKey, { expiresIn: expiry })
}