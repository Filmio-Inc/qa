
# Filmio Load Testing Tool

## Overview
This repository contains the source code for the Filmio Load Testing Tool, designed to facilitate performance testing by simulating user interactions on mobile and web platforms. The tool leverages AWS services and a Google Sheets integration for result analysis.

## Structure
- `filmio-loadtest/`: Main directory containing all relevant scripts and configuration files.
  - `aws.yml`: CloudFormation template for AWS resource deployment.
  - `deploy.sh`: Shell script for deploying resources to AWS.
  - `googleSheets.gs`: Google Apps Script for logging results to Google Sheets.
  - `images.py`: Python script for handling image-related operations.
  - `images.txt`: Text file containing image data used in load tests.
  - `lambda/`: Directory containing AWS Lambda function code.
    - `child.js`: Child Lambda function for handling specific tasks.
    - `master.js`: Master Lambda function orchestrating the load tests.
    - `localStorage.json`: Local storage configuration for Lambda functions.
    - `package.json`: Node.js package configuration.
    - `stage.json`: Staging configuration for deployment.
    - `yarn.lock`: Yarn lock file ensuring consistent installations.

## Prerequisites
- AWS Account
- Node.js and Yarn
- Python (for `images.py`)
- Access to Google Sheets (for `googleSheets.gs`)

## Setup and Deployment
1. Configure AWS CLI with your credentials.
2. Run `deploy.sh` to deploy AWS resources specified in `aws.yml`.
3. Set up Google Sheets API access for `googleSheets.gs`.
4. Install necessary Node.js and Python dependencies.

## Usage
- Execute the `master.js` Lambda function to start the load testing process.
- Results will be logged to the specified Google Sheet.

## Contributing
Contributions are welcome! Please fork the repository and submit pull requests with your enhancements.

## License
Specify your license or state that the project is unlicensed.
