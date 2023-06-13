import mongoose from "mongoose";
import dotenv from "dotenv";
import { Job } from "./models/job.js";
dotenv.config();

const mongoUrl = process.env.MONGO_URI;

const keywords = [
  "Junior",
  "Graduate/Junior",
  "Graduate",
  "React",
  "Javascript",
  "angular",
  "Vue",
  ".net",
  "sql",
  "node",
  "typescript",
  "remote",
  "work from home",
];

export const evaluate = async () => {
  const jobOutput = [];
  try {
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
    });

    const jobs = await Job.find({
      title: {
        $regex: "(Junior|Graduate/Junior|Graduate|React|Javascript|Vue|.NET)",
        $options: "i", // case insensitive
      },
      keywords: {
        $in: keywords,
      },
    });

    // now for each job we need to work out if it is still valid
    for (const job of jobs) {
      const dateCrawled = job.dateCrawled;
      const listingDate = job.listingDate.replace("d ago", "");

      const currentDate = new Date();
      const daysElapsed = Math.floor(
        (currentDate - dateCrawled) / (24 * 60 * 60 * 1000)
      );

      const updatedListingDate = parseInt(listingDate) + daysElapsed;

      if (updatedListingDate > 30) {
        // Skip the job as it's been more than 30 days since the dateCrawled, and the ad won't exist anymore on Seek
        continue;
      }

      // Tighten up the rules for job titles
      const jobTitle = job.title.toLowerCase();
      if (
        !jobTitle.includes("senior") &&
        !jobTitle.includes("lead") &&
        !jobTitle.includes("manager")
      ) {
        // Process the job
        jobOutput.push(job);
      }
    }

    console.log("Jobs from database", jobs);
    return jobOutput;
  } catch (error) {
    console.log("Could not connect to MongoDB:", error);
    process.exit(1);
  }
};
