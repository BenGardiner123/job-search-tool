import puppeteer from "puppeteer";

export default async function getSingleJobDetails(url) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto(url);
  await new Promise((r) => setTimeout(r, 2000));

  try {
    const jobDetailResult = await page.$eval(
      'div[data-automation="jobAdDetails"]',
      (el) => el.textContent
    );
    await browser.close();

    return jobDetailResult;
  } catch (error) {
    console.log("Error retrieving job details:", error);
  }
}
