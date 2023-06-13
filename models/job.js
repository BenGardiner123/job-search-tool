import mongoose from "mongoose";

let jobSchema = new mongoose.Schema({
  title: String,
  company: String,
  details: String,
  category: String,
  location: String,
  listingDate: String,
  dateCrawled: Date,
  salary: String,
  url: String,
  keywords: {
    type: [String],
    default: [],
  },
});

export const Job = mongoose.model("Job", jobSchema);
