// Import required AWS SDK and Node.js file system (fs) modules
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const fsp = require('node:fs/promises');

// Initialize AWS Lambda client
const lambda = new LambdaClient({ apiVersion: '2015-03-31' });

// Lambda function parameters template
const params = {
    FunctionName: process.env.CHILD_LAMBDA, // Name of the lambda function to invoke
    InvocationType: 'Event'                 // Asynchronous invocation
};

// Main lambda handler
exports.handler = async function(event) {
    console.log(event)
    // Load and parse project data from 'stage.json' file
    const projectData = JSON.parse(await fsp.readFile('./stage.json', 'utf8'));
    const projectSlugs = projectData.map(el => `/project/${el.slug}`); // Extract slugs from project data
    
    // Extract test configuration from the event
    const config = event.config;
    config.projectSlugs = projectSlugs
    const { testType } = config;

    // Execute test based on the test type
    switch (testType) {
        case '1':
            await fullLoadTest(config);
            break;
        case '2':
            await stepTest(config);
            break;
        default:
            console.log('Invalid test type');
    }

    return 'Done'; // Return a message indicating completion
};

// Function to perform a full load test
async function fullLoadTest(config) {
    let index = 1;
    let { jwt, urls, testId, numberOfUsers, numberOfRandomProjectURLs, projectSlugs } = config;

    // Iterate over the number of users and invoke separate lambda functions
    for (let a = 0; a < numberOfUsers; a++) {

        // Initialize URLs array with a default '/explore' path
        let randomProjects = ['/explore'];

        // Populate randomProjects array with random project URLs
        if (numberOfRandomProjectURLs > 0) {
            for (let a = 0; a < numberOfRandomProjectURLs; a++) {
                randomProjects.push(projectSlugs[Math.floor(Math.random() * projectSlugs.length)]);
            }
            urls = randomProjects; // Assign modified URLs back to the event object
        }
        
        console.log(`Invoking lambda ${index} - ${JSON.stringify(config)}`);
        await sleep(500); // Wait for 500ms between lambda invocations

        // Update lambda parameters with current test details
        params.Payload = JSON.stringify({ jwt, urls, runId: `${testId}-${a}` });
        const command = new InvokeCommand(params);
        await lambda.send(command); // Send the command to invoke the lambda
        index += 1;
    }
}

// Function to perform a step test
async function stepTest(config) {
    let index = 0;
    let lambdaIndex = 0;
    let { timeToStay, testId, numberOfUsers, userIncrease, stepTime } = config;
    numberOfUsers += 1; // Adjust total number of users

    // Calculate the number of iterations needed based on user increase steps
    const divisionResult = numberOfUsers / userIncrease;
    const numberOfIterations = Math.ceil(divisionResult);
    const ratioOfRoomsForLastIteration = numberOfIterations - divisionResult;

    // Log calculation results for debugging
    console.log(`Division Result: ${divisionResult}, Number of Iterations: ${numberOfIterations}, Last Iteration Ratio: ${ratioOfRoomsForLastIteration}`);

    // Iterate over each step
    for (let a = 0; a < numberOfIterations; a++) {
        if (a === numberOfIterations - 1) {
            userIncrease *= ratioOfRoomsForLastIteration; // Adjust user increase for the last iteration
            console.log(`Last Room Increase: ${userIncrease}`);
        }

        // Iterate over the number of users for each step
        for (let b = 0; b < userIncrease; b++) {
            await sleep(500); // Wait for 500ms between lambda invocations

            // Update lambda parameters with current step details
            params.Payload = JSON.stringify({
                config,
                url: config.links[index],
                timeToStay: timeToStay * 60 * 1000, // Convert minutes to milliseconds
                name: `${testId} #${lambdaIndex + 1}`,
                testId,
                runId: `Rooms#${numberOfRooms - 1}-${lambdaIndex + 1}`
            });
            const command = new InvokeCommand(params);
            await lambda.send(command); // Invoke the lambda function
            lambdaIndex += 1;
            index += 1;
        }

        // Wait for the specified step time minus the time to spin up the lambdas
        await sleep(stepTime * 60 * 1000 - 500);
    }
}

// Utility function for creating a promise that resolves after a set time
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
