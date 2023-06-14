import puppeteer from "puppeteer"; // Importing the Puppeteer library for web scraping
import constants, { KEYWORDS } from "./utils/constants.js"; // Importing constants and keywords from the constants module
import mongoose from "mongoose"; // Importing the Mongoose library for MongoDB
import dotenv from "dotenv";
import { Job } from "./models/job.js"; // Importing the Job model from the models module
import { evaluate } from "./evaluate.js";
import { OpenAI } from "langchain/llms/openai";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { DocxLoader } from "langchain/document_loaders/fs/docx";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { HNSWLib } from "langchain/vectorstores";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RetrievalQAChain } from "langchain/chains";
import getSingleJobDetails from "./getSingleJobDetails.js";
import sendEmail from "./email.js";

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

function normalizeDocuments(docs) {
  return docs.map((doc) => {
    if (typeof doc.pageContent === "string") {
      return doc.pageContent;
    } else if (Array.isArray(doc.pageContent)) {
      return doc.pageContent.join("\n");
    }
  });
}

// await runJobScrape();

const evaluationResults = await evaluate();

// Using the  getSingleJobDetails go to the job url and scrape the full job description now that we know its worth our time
let jobDetailsTextResult = [];
// create a list of jobHrFeedbackResults to hold the results of the jobHrFeedback function
const jobHrFeedbackResults = [];

for (const job of evaluationResults) {
  const jobObject = {
    id: job._id,
    details: "",
    title: job.title,
  };
  const jobDetailsText = await getSingleJobDetails(job.url);
  jobObject.details = jobDetailsText;
  jobDetailsTextResult.push(jobObject);
}

// instantiate the OpenAI LLM that will be used to answer the question and pass your key as the apiKey from the .env file
const model = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// the directory loader will load all the documents in the docs folder with the correct extension as specified in the second argument
// note this is not the only way to load documents check the docs for more info
const directoryLoader = new DirectoryLoader("docs", {
  ".pdf": (path) => new PDFLoader(path),
  ".txt": (path) => new TextLoader(path),
  ".docx": (path) => new DocxLoader(path),
});

// load the documents into the docs variable
const docs = await directoryLoader.load();

// verify the docs have been loaded correctly
console.log({ docs });

// Split text into chunks with any TextSplitter. You can then use it as context or save it to memory afterwards.
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
});

//  normalize the documents to make sure they are all strings
const normalizedDocs = normalizeDocuments(docs);

// https://js.langchain.com/docs/modules/schema/document
const splitDocs = await textSplitter.createDocuments(normalizedDocs);

// now create the vector store from the splitDocs and the OpenAIEmbeddings so that we can use it to create the chain
const vectorStore = await HNSWLib.fromDocuments(
  splitDocs,
  new OpenAIEmbeddings()
);

// https://js.langchain.com/docs/modules/chains/index_related_chains/retrieval_qa
const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());

// loop through each job in the jobDetailsTextResult
// ==> remember to change the name from Migel to your name otherwise it will look weird
for (const job of jobDetailsTextResult) {
  const question = `${job.details} is a job that Migel could apply for. 
    Act like you a recruiter or HR manager and read each job description step by step. 
    When matching up requirements with experience treat SQL Server and SQL as the same thing as well as .NET and .NET Core but mention if you are doing this so i can see. 
    If the job is not suitable for Migel then say so in your recommendations.
    then then tell me if Migel should apply for the job or not and give examples like this:

    // below is the example of style of answer i want to see
    "Migel should apply for this job because he has the required experience with React and Node. Although he does not fit all the experience requirements he has the required experience with React and Node. So it may be worth a try
    He has not used Ionic before but he has used Typescript so he should be able to pick it up quickly."
    // end of example
    `;
  const res = await chain.call({
    input_documents: docs,
    query: question,
  });

  let outputObject = {
    id: job.id.toString(),
    jobHrFeedback: res.text,
  };

  jobHrFeedbackResults.push(outputObject);
}

console.log("jobHrFeedbackResults", jobHrFeedbackResults);

await sendEmail(evaluationResults, jobHrFeedbackResults);
