import puppeteer from "puppeteer"; // Importing the Puppeteer library for web scraping
import constants, { KEYWORDS } from "./utils/constants.js"; // Importing constants and keywords from the constants module
import mongoose from "mongoose"; // Importing the Mongoose library for MongoDB
import dotenv from "dotenv";
import { Job } from "./models/job.js"; // Importing the Job model from the models module
import { evaluate } from "./evaluate.js";
import { sendEmail } from "./email.js";

dotenv.config(); // Configure dotenv to load the .env file
const mongoUrl = process.env.MONGO_URI; // Setting the MongoDB connection URL from the environment variable we set in the .env file

const jobTitle = "junior web developer"; // Setting the job title to search for.
const jobLocation = "Work from home"; // Setting the job location to search for
const searchUrl = constants.SEEK_URL + jobTitle + "-jobs?where=" + jobLocation; // Constructing the search URL

export default async function runJobScrape() {
  const browser = await puppeteer.launch({
    headless: false, // Launch Puppeteer in non-headless mode (visible browser window)
    args: ["--no-sandbox"], // Additional arguments for Puppeteer
  });

  const page = await browser.newPage(); // Create a new page in the browser

  await page.goto(constants.SEEK_URL); // Navigate the page to the SEEK website URL
  await page.click(constants.KEYWORDS); // Click on the search input field for keywords
  await page.keyboard.type(jobTitle); // Type the job title into the search input field
  await page.click(constants.LOCATION); // Click on the search input field for location
  await page.keyboard.type(jobLocation); // Type the job location into the search input field
  await page.click(constants.SEARCH); // Click the search button
  await new Promise((r) => setTimeout(r, 2000)); // Wait for 2 seconds (delay)

  // await page.screenshot({ path: "./src/screenshots/search.png" });
  // Take a screenshot of the search results page (optional)

  let numPages = await getNumPages(page); // Get the total number of pages in the search results
  console.log("getNumPages => total: ", numPages);

  const jobList = []; // Create an empty array to store job information when we loop through the search results pages

  for (let h = 1; h <= numPages; h++) {
    let pageUrl = searchUrl + "&page=" + h; // Construct the URL for the current page of search results
    await page.goto(pageUrl); // Navigate the page to the current search results page
    console.log(`Page ${h}`); // log the current page number to console for visibility

    // Find all the job elements on the page
    const jobElements = await page.$$(
      "div._1wkzzau0.szurmz0.szurmzb div._1wkzzau0.a1msqi7e"
    );

    for (const element of jobElements) {
      const jobTitleElement = await element.$('a[data-automation="jobTitle"]'); // Find the job title element
      const jobUrl = await page.evaluate((el) => el.href, jobTitleElement); // Extract the job URL from the job title element

      // Extract the job title from the element
      const jobTitle = await element.$eval(
        'a[data-automation="jobTitle"]',
        (el) => el.textContent
      );

      // Extract the job company from the element
      const jobCompany = await element.$eval(
        'a[data-automation="jobCompany"]',
        (el) => el.textContent
      );

      // Extract the job details from the element
      const jobDetails = await element.$eval(
        'span[data-automation="jobShortDescription"]',
        (el) => el.textContent
      );

      // Extract the job category from the element
      const jobCategory = await element.$eval(
        'a[data-automation="jobSubClassification"]',
        (el) => el.textContent
      );

      // Extract the job location from the element
      const jobLocation = await element.$eval(
        'a[data-automation="jobLocation"]',
        (el) => el.textContent
      );

      // Extract the job listing date from the element
      const jobListingDate = await element.$eval(
        'span[data-automation="jobListingDate"]',
        (el) => el.textContent
      );

      // Now we check if the job details contain any of the keywords that we set out in utils/constants.js
      // Ive done this as an exmaple to show when you store the jobs in the database, you can use the keywords to filter the jobs
      // or use the keywords for other data related uses/analysis.

      const jobDetailsHasKeywords = KEYWORDS.filter((keyword) =>
        jobDetails.toLowerCase().includes(keyword.toLowerCase())
      );

      // the job salary is not always available, so we need to check if it exists before we try to extract it
      let jobSalary = "";

      try {
        jobSalary = await element.$eval(
          'span[data-automation="jobSalary"]',
          (el) => el.textContent
        );
      } catch (error) {
        // return an empty string if no salary is found for the job, we don't want to throw an error
        jobSalary = "";
      }

      const job = {
        title: jobTitle || "",
        company: jobCompany || "",
        details: jobDetails || "",
        category: jobCategory || "",
        location: jobLocation || "",
        listingDate: jobListingDate || "",
        salary: jobSalary || "",
        dateScraped: new Date(),
        url: jobUrl || "",
        keywords: jobDetailsHasKeywords || [],
      };

      // verify the job object has been created correctly inside the loop
      //   console.log("Job elements loop => Job", job);

      jobList.push(job);
    }
  }

  await insertJobs(jobList);

  //   await browser.close();
}

// borrowed from https://github.com/ongsterr/job-scrape/blob/master/src/job-scrape.js

async function getNumPages(page) {
  // Get the selector for the job count element from the constants
  const jobCount = constants.JOBS_NUM;

  // Use the page's evaluate function to run the following code in the browser context
  let pageCount = await page.evaluate((sel) => {
    let jobs = parseInt(document.querySelector(sel).innerText); // Get the inner text of the job count element and convert it to an integer
    let pages = Math.ceil(jobs / 20); // Calculate the number of pages based on the total job count (assuming 20 jobs per page)
    return pages; // Return the number of pages
  }, jobCount);

  return pageCount; // Return the total number of pages
}

async function insertJobs(jobPosts) {
  try {
    // Connect to the MongoDB
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
    });
    console.log("Successfully connected to MongoDB.");

    // Get the list of existing job details in the database
    const existingJobDetails = await Job.distinct("details");

    // Filter out the existing jobs from the jobPosts array
    const newJobs = jobPosts.filter(
      (jobPost) => !existingJobDetails.includes(jobPost.details)
    );

    console.log(`Total jobs: ${jobPosts.length}`);
    console.log(`Existing jobs: ${existingJobDetails.length}`);
    console.log(`New jobs: ${newJobs.length}`);

    // Process the new jobs
    for (const jobPost of newJobs) {
      const job = new Job({
        title: jobPost.title,
        company: jobPost.company,
        details: jobPost.details,
        category: jobPost.category,
        location: jobPost.location,
        listingDate: jobPost.listingDate,
        dateCrawled: jobPost.dateScraped,
        salary: jobPost.salary,
        url: jobPost.url,
        keywords: jobPost.keywords,
      });

      // Save the job
      const savedJob = await job.save();
      console.log("Job saved successfully:", savedJob);
    }
  } catch (error) {
    console.log("Could not save jobs:", error);
  } finally {
    // Close the database connection
    mongoose.connection.close();
  }
}

await runJobScrape();

const evaluationResults = await evaluate();
// console.log("evaluate => evaluationResults: ", evaluationResults);

await sendEmail(evaluationResults);
