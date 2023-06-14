import nodemailer from "nodemailer";

export const sendEmail = async (jobs, jobHrFeedbackResults) => {
  const jobHrFeedbackResultsMapped = jobHrFeedbackResults.map(
    (jobHrFeedbackResult) => {
      return {
        id: jobHrFeedbackResult.id,
        feedback: jobHrFeedbackResult.jobHrFeedback,
      };
    }
  );

  // Create a nodemailer transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: "someone@someone.com", // Replace with your Outlook email address
      pass: "abc123", // Replace with your Outlook password
    },
  });

  try {
    // Compose the email message
    const message = {
      from: "someone@someone.com", // Sender email address
      to: "someone@someone.com", // Recipient email address
      subject: "New Job Opportunities",
      html: `<html>
  <head>
    <style>
      .job-card {
        border: 1px solid #ccc;
        padding: 10px;
        margin-bottom: 20px;
      }
      
      .job-title {
        color: #333;
        margin-bottom: 10px;
      }
      
      .job-details {
        margin-bottom: 10px;
      }
      
      .job-link {
        color: blue;
        text-decoration: underline;
      }
      
      .job-keywords {
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    ${jobs
      .map(
        (job) => `
          <div class="job-card">
            <h2 class="job-title">${job.title}</h2>
            <p><strong>Company:</strong> ${job.company}</p>
            <p><strong>Location:</strong> ${job.location}</p>
            <p class="job-details"><strong>Job Description:</strong></p>
            <p>${job.details}</p>
            <p class="job-details"><strong>You HR Helper Feedback:</strong></p>
            <p>"${
              (
                jobHrFeedbackResultsMapped.find(
                  (f) => f.id.toString() === job.id.toString()
                ) || {}
              ).feedback || ""
            }"</p>
            <p><strong>Link:</strong> <a class="job-link" href="${job.url}">${
          job.url
        }</a></p>
            <p class="job-keywords"><strong>Keywords:</strong> ${job.keywords.join(
              ", "
            )}</p>
          </div>
        `
      )
      .join("")}
  </body>
</html>`,
    };

    // Send the email
    const info = await transporter.sendMail(message);
    console.log("Email sent:", info.messageId);
  } catch (error) {
    console.log("Error sending email:", error);
  }
};

export default sendEmail;
